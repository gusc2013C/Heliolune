import assert from "node:assert/strict";
import test from "node:test";
import { classifyTurnFailure, compactSupervisorPrompt, shouldConsultSupervisor, supervisionSchedule } from "../plugins/luna-pool-orchestrator/scripts/supervision.mjs";

test("disables supervision for short hard timeouts", () => {
  assert.equal(supervisionSchedule({ timeoutSeconds: 60 }).enabled, false);
});

test("places one bounded checkpoint before the hard timeout", () => {
  const schedule = supervisionSchedule({ timeoutSeconds: 180 });
  assert.equal(schedule.enabled, true);
  assert.equal(schedule.softMs, 120_000);
  assert.equal(schedule.staleMs, 45_000);
  assert.ok(schedule.softMs + schedule.supervisorTimeoutMs < schedule.hardMs);
});

test("auto mode consults only after sustained silence", () => {
  const schedule = supervisionSchedule({ timeoutSeconds: 180 });
  assert.equal(shouldConsultSupervisor({ silentMs: 10_000 }, schedule, "auto"), false);
  assert.equal(shouldConsultSupervisor({ silentMs: 60_000 }, schedule, "auto"), true);
  assert.equal(shouldConsultSupervisor({ silentMs: 1 }, schedule, "always"), true);
});

test("supervisor prompt is compact and excludes reserved judgments", () => {
  const schedule = supervisionSchedule({ timeoutSeconds: 180 });
  const prompt = compactSupervisorPrompt({
    lane: "core",
    mode: "analyze",
    objective: "Inspect bounded files",
    snapshot: { elapsedMs: 120_000, silentMs: 60_000, eventCount: 4, lastMethod: "item/completed", usage: null },
    schedule,
  });
  assert.match(prompt, /liveness/);
  assert.match(prompt, /remainingMs/);
  assert.match(prompt, /Do not decide architecture/);
});

test("hard timeout classification distinguishes active from stalled", () => {
  const schedule = supervisionSchedule({ timeoutSeconds: 180, staleAfterSeconds: 45 });
  assert.equal(classifyTurnFailure({ code: "TURN_HARD_TIMEOUT", activity: { silentMs: 10_000 } }, schedule), "hard_timeout_active");
  assert.equal(classifyTurnFailure({ code: "TURN_HARD_TIMEOUT", activity: { silentMs: 60_000 } }, schedule), "hard_timeout_stalled");
  assert.equal(classifyTurnFailure({ code: "SUPERVISOR_INTERRUPTED" }, schedule), "supervisor_interrupted");
});
