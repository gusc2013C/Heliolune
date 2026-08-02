import assert from "node:assert/strict";
import test from "node:test";
import { buildControllerResult, compactLeaderPrompt, shouldUseLeader } from "../plugins/luna-pool-orchestrator/scripts/leader.mjs";

const owner = {
  status: "completed",
  summary: "Implemented the bounded change.",
  evidence: [{ path: "src/a.mjs", line: 10, claim: "Relevant branch changed." }],
  changes: [{ path: "src/a.mjs", summary: "Updated branch." }],
  checks: [{ name: "focused", status: "passed", detail: "1 test passed" }],
  risks: [],
  needsVerifier: false,
  needsSol: [],
};
const cost = {
  unit: "price_units_per_million_tokens",
  actual: { model: "gpt-5.6-luna", amount: 0.1, breakdown: {}, rate: {} },
  sameTokenBaseline: { model: "gpt-5.6-sol", amount: 2.5, breakdown: {}, rate: {} },
  estimatedSavings: 2.4,
  estimatedSavingsRate: 0.96,
  historicalProjection: { profileId: "alpha-0.5.0-matched", estimatedSolOnlyCost: 0.41, estimatedSavings: 0.31, estimatedSavingsRate: 0.756261 },
  assumptions: ["long controller-irrelevant explanation"],
};
const routing = { ownerLane: "core", verifierUsed: false, ownerThreadId: "hidden", leaderEffort: "high", model: "gpt-5.6-luna", effort: "max", promptVersion: "test" };

test("leader prompt permits reporting but forbids planning and acceptance", () => {
  const prompt = compactLeaderPrompt({
    taskId: "task-1", lane: "core", objective: "Bounded task", acceptance: ["One criterion"],
    owner, verifier: null, schemaRecovery: { attempted: false }, timing: { ownerMs: 10 },
  });
  assert.match(prompt, /operations leader and reporting compressor/);
  assert.match(prompt, /Do not inspect the repository/);
  assert.match(prompt, /plan future work/);
  assert.match(prompt, /final acceptance/);
});

test("leader result hides raw worker bundles and controller-irrelevant cost detail", () => {
  const direct = buildControllerResult({ status: "completed", owner, verifier: null, leader: null, leaderError: null, includeRawResults: false, routing, supervision: null, schemaRecovery: {}, usage: {}, cost, timing: {} });
  const summarized = buildControllerResult({
    status: "completed", owner, verifier: null,
    leader: { status: "completed", brief: "Done.", evidence: owner.evidence, changes: owner.changes, checks: owner.checks, risks: [], escalations: [], confidence: "high" },
    leaderError: null, includeRawResults: false, routing, supervision: null, schemaRecovery: {}, usage: {}, cost, timing: {},
  });
  assert.equal(summarized.reportMode, "leader");
  assert.equal("owner" in summarized, false);
  assert.equal("audit" in summarized, false);
  assert.equal("assumptions" in summarized.cost, false);
  assert.equal(summarized.cost.historicalProjection.profileId, "alpha-0.5.0-matched");
  assert.equal("reference" in summarized.cost.historicalProjection, false);
  assert.ok(JSON.stringify(summarized).length < JSON.stringify(direct).length);
});

test("raw worker results remain opt-in for audits", () => {
  const result = buildControllerResult({
    status: "completed", owner, verifier: null,
    leader: { status: "completed", brief: "Done.", evidence: [], changes: [], checks: [], risks: [], escalations: [], confidence: "high" },
    leaderError: null, includeRawResults: true, routing, supervision: null, schemaRecovery: {}, usage: {}, cost, timing: {},
  });
  assert.deepEqual(result.audit.owner, owner);
});

test("auto reporting defers small low-risk bundles but wakes for risk or size", () => {
  assert.equal(shouldUseLeader({ reporting: "auto", risk: "low" }, owner, null), false);
  assert.equal(shouldUseLeader({ reporting: "auto", risk: "high" }, owner, null), true);
  assert.equal(shouldUseLeader({ reporting: "auto", risk: "low", leaderThresholdChars: 1000 }, { ...owner, summary: "x".repeat(2000) }, null), true);
  assert.equal(shouldUseLeader({ reporting: "direct", risk: "high" }, owner, { verdict: "fail" }), false);
  assert.equal(shouldUseLeader({ reporting: "leader", risk: "low" }, owner, null), true);
});
