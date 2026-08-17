import assert from "node:assert/strict";
import test from "node:test";
import { contractGuardEscalations, withRecoveryMetadata } from "../plugins/luna-pool-orchestrator/scripts/orchestration-policy.mjs";

test("only the concurrent contract lane can trigger a Sol escalation", () => {
  const output = { status: "blocked", needsSol: [{ decision: "test scope", reason: "Acceptance requires changing tests outside scope." }] };
  assert.equal(contractGuardEscalations("owner", output).length, 0);
  assert.deepEqual(contractGuardEscalations("contract", output), output.needsSol);
  assert.deepEqual(contractGuardEscalations("contract", { status: "completed", needsSol: output.needsSol }), []);
  assert.deepEqual(contractGuardEscalations("contract", { status: "blocked", needsSol: [] }), []);
});

test("held non-empty patches are explicit quarantined recovery candidates", () => {
  const integration = withRecoveryMetadata(
    { applied: false, reason: "incomplete-workstreams", changedPaths: [] },
    [{ id: "owner", patchBytes: 42, patchPath: "owner.patch", changedPaths: ["src/a.mjs"], outOfScope: [] }],
  );
  assert.equal(integration.recoverable.available, true);
  assert.equal(integration.recoverable.safeToApply, false);
  assert.equal(integration.recoverable.requiresSol, true);
  assert.equal(integration.recoverable.candidates[0].patchPath, "owner.patch");
  assert.equal(withRecoveryMetadata({ applied: true, reason: "safe-apply" }, []).recoverable, undefined);
});

test("partial apply recovery metadata contains only held workstreams", () => {
  const integration = withRecoveryMetadata(
    { applied: true, reason: "safe-partial-apply", heldWorkstreams: ["held"] },
    [
      { id: "applied", patchBytes: 12, patchPath: "applied.patch", changedPaths: ["src/a.mjs"], outOfScope: [] },
      { id: "held", patchBytes: 42, patchPath: "held.patch", changedPaths: ["src/b.mjs"], outOfScope: [] },
    ],
  );
  assert.equal(integration.recoverable.available, true);
  assert.deepEqual(integration.recoverable.candidates.map((candidate) => candidate.id), ["held"]);
});
