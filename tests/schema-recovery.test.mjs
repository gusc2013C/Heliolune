import assert from "node:assert/strict";
import test from "node:test";
import { compactSchemaRecoveryPrompt } from "../plugins/luna-pool-orchestrator/scripts/schema-recovery.mjs";

test("schema recovery forbids more exploration and permits honest partial output", () => {
  const prompt = compactSchemaRecoveryPrompt({
    mode: "analyze",
    objective: "Inspect two files",
    acceptance: ["Return evidence"],
    scope: ["a.mjs", "b.mjs"],
    activity: { elapsedMs: 80_000, eventCount: 30, lastMethod: "thread/tokenUsage/updated" },
  });
  assert.match(prompt, /invalid structured output/);
  assert.match(prompt, /Do not inspect files, run commands, call tools/);
  assert.match(prompt, /status=partial/);
  assert.match(prompt, /never invent evidence/);
});
