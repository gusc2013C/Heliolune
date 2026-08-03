import assert from "node:assert/strict";
import test from "node:test";
import { classifyTurnFailure, compactSupervisorPrompt, createInactivityCircuitBreaker, shouldConsultSupervisor, supervisionSchedule } from "../plugins/luna-pool-orchestrator/scripts/supervision.mjs";

test("short compatibility values become renewable liveness checkpoints", () => {
  assert.deepEqual(supervisionSchedule({ checkpointSeconds: 60 }), {
    enabled: true,
    renewable: true,
    checkpointMs: 60_000,
    repeatMs: 30_000,
    staleMs: 45_000,
    supervisorTimeoutMs: 30_000,
    maxSilentChecks: 4,
    sizingTargetMs: 90_000,
  });
});

test("renewable liveness resets on activity and terminates a persistently silent stall", () => {
  const schedule = supervisionSchedule({ checkpointSeconds: 60 });
  const observe = createInactivityCircuitBreaker(schedule);
  assert.equal(observe({ silentMs: 60_000 }), null);
  assert.equal(observe({ silentMs: 80_000 }), null);
  assert.equal(observe({ silentMs: 1_000 }), null);
  assert.equal(observe({ silentMs: 60_000 }), null);
  assert.equal(observe({ silentMs: 90_000 }), null);
  assert.equal(observe({ silentMs: 120_000 }), null);
  const decision = observe({ silentMs: 150_000 });
  assert.equal(decision.action, "interrupt");
  assert.equal(decision.confidence, "high");
  assert.equal(decision.source, "inactivity-circuit-breaker");
});

test("caps the first checkpoint at the preferred 90-second workstream size", () => {
  const schedule = supervisionSchedule({ checkpointSeconds: 180 });
  assert.equal(schedule.enabled, true);
  assert.equal(schedule.renewable, true);
  assert.equal(schedule.checkpointMs, 90_000);
  assert.equal(schedule.repeatMs, 30_000);
  assert.equal(schedule.staleMs, 45_000);
  assert.equal(schedule.hardMs, undefined);
});

test("turning the model supervisor off does not disable renewable execution", () => {
  const schedule = supervisionSchedule({ checkpointSeconds: 60, supervision: "off" });
  assert.equal(schedule.enabled, false);
  assert.equal(schedule.renewable, true);
  assert.equal(schedule.reason, "leader_disabled");
});

test("auto mode consults only after sustained silence", () => {
  const schedule = supervisionSchedule({ checkpointSeconds: 180 });
  assert.equal(shouldConsultSupervisor({ silentMs: 10_000 }, schedule, "auto"), false);
  assert.equal(shouldConsultSupervisor({ silentMs: 60_000 }, schedule, "auto"), true);
  assert.equal(shouldConsultSupervisor({ silentMs: 1 }, schedule, "always"), true);
});

test("supervisor prompt is compact and excludes reserved judgments", () => {
  const schedule = supervisionSchedule({ checkpointSeconds: 180 });
  const prompt = compactSupervisorPrompt({
    lane: "core",
    mode: "analyze",
    objective: "Inspect bounded files",
    snapshot: { elapsedMs: 120_000, silentMs: 60_000, eventCount: 4, lastMethod: "item/completed", usage: null },
    schedule,
  });
  assert.match(prompt, /liveness/);
  assert.match(prompt, /no execution deadline/);
  assert.doesNotMatch(prompt, /remainingMs|hard deadline/);
  assert.match(prompt, /Do not decide architecture/);
});

test("legacy timeout classification remains diagnostic-only", () => {
  const schedule = supervisionSchedule({ checkpointSeconds: 180, staleAfterSeconds: 45 });
  assert.equal(classifyTurnFailure({ code: "TURN_HARD_TIMEOUT", activity: { silentMs: 10_000 } }, schedule), "legacy_timeout_active");
  assert.equal(classifyTurnFailure({ code: "TURN_HARD_TIMEOUT", activity: { silentMs: 60_000 } }, schedule), "legacy_timeout_stalled");
  assert.equal(classifyTurnFailure({ code: "SUPERVISOR_INTERRUPTED" }, schedule), "supervisor_interrupted");
});
