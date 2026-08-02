import assert from "node:assert/strict";
import test from "node:test";
import { compactSteerPrompt, compactSynthesisPrompt, finalizationSchedule, shouldAttemptSynthesis } from "../plugins/luna-pool-orchestrator/scripts/finalization.mjs";

test("reserves a bounded synthesis window inside the original deadline", () => {
  const schedule = finalizationSchedule({ timeoutSeconds: 120 });
  assert.equal(schedule.enabled, true);
  assert.equal(schedule.hardMs, 120_000);
  assert.equal(schedule.workMs, 60_000);
  assert.equal(schedule.reserveMs, 60_000);
  assert.equal(schedule.workMs + schedule.reserveMs, schedule.hardMs);
});

test("supports an explicit reserve without extending the hard deadline", () => {
  const schedule = finalizationSchedule({ timeoutSeconds: 180, synthesisReserveSeconds: 55 });
  assert.equal(schedule.workMs, 125_000);
  assert.equal(schedule.reserveMs, 55_000);
  assert.equal(schedule.workMs + schedule.reserveMs, 180_000);
});

test("starts a fallback turn only for invalid structured output", () => {
  const schedule = finalizationSchedule({ timeoutSeconds: 120 });
  assert.equal(shouldAttemptSynthesis({ code: "TURN_HARD_TIMEOUT", activity: { silentMs: 1 } }, schedule, 45_000), false);
  assert.equal(shouldAttemptSynthesis({ code: "TURN_HARD_TIMEOUT", activity: { silentMs: 60_000 } }, schedule, 45_000), false);
  assert.equal(shouldAttemptSynthesis({ code: "INVALID_STRUCTURED_OUTPUT" }, schedule, 45_000), true);
  assert.equal(shouldAttemptSynthesis({ code: "FINALIZATION_INTERRUPTED" }, schedule, 45_000), true);
  assert.equal(shouldAttemptSynthesis({ code: "TURN_NOT_COMPLETED" }, schedule, 45_000), false);
});

test("in-turn steer prompt stops tool use without discarding active reasoning", () => {
  const prompt = compactSteerPrompt({ objective: "Inspect two files", acceptance: ["Return evidence"] });
  assert.match(prompt, /Finish this same turn/);
  assert.match(prompt, /Stop repository exploration and tool use now/);
  assert.match(prompt, /status=partial/);
});

test("synthesis prompt forbids more exploration and permits honest partial output", () => {
  const prompt = compactSynthesisPrompt({
    mode: "analyze",
    objective: "Inspect two files",
    acceptance: ["Return evidence"],
    scope: ["a.mjs", "b.mjs"],
    activity: { elapsedMs: 80_000, eventCount: 30, lastMethod: "thread/tokenUsage/updated" },
  });
  assert.match(prompt, /Do not inspect files, run commands, call tools/);
  assert.match(prompt, /status=partial/);
  assert.match(prompt, /never invent evidence/);
});
