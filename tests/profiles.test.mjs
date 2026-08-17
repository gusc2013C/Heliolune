import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTaskDag } from "../plugins/luna-pool-orchestrator/scripts/task-dag.mjs";
import {
  ADAPTIVE,
  DEFAULT_PROFILE,
  SPEED_FIRST,
  TOKEN_FIRST,
  adaptiveParallelism,
  adaptiveParallelWorkstreams,
  adaptiveRoute,
  adaptiveBudgets,
  batchSupervisionSchedule,
  burstLanes,
  compactBatchLeaderPrompt,
  compactBatchSupervisorPrompt,
  compactBurstTask,
  compactDependencyEvidence,
  defaultParallelWorkstreams,
  mapWithConcurrency,
  shouldUseBatchLeader,
  speedParallelism,
  throughputParallelism,
  validateSpeedWorkstreams,
} from "../plugins/luna-pool-orchestrator/scripts/profiles.mjs";

test("execution profiles separate cache-oriented and burst-oriented routing", () => {
  assert.equal(DEFAULT_PROFILE, ADAPTIVE);
  assert.deepEqual(ADAPTIVE.allowedParallelism, [1, 2, 4]);
  assert.equal(ADAPTIVE.defaultParallelism, 1);
  assert.equal(TOKEN_FIRST.defaultParallelism, 1);
  assert.equal(TOKEN_FIRST.cachePolicy, "function-affine-reuse");
  assert.equal(SPEED_FIRST.defaultParallelism, 4);
  assert.deepEqual(SPEED_FIRST.allowedParallelism, [4, 8]);
  assert.deepEqual(burstLanes(4), ["burst-1", "burst-2", "burst-3", "burst-4"]);
  assert.deepEqual(burstLanes(2), ["burst-1", "burst-2"]);
  assert.equal(burstLanes(8).length, 8);
  assert.equal(adaptiveParallelism(1), 1);
  assert.equal(adaptiveParallelism(2), 2);
  assert.throws(() => adaptiveParallelism(8), /1, 2, 4/);
  assert.throws(() => speedParallelism(6), /4, 8/);
  assert.deepEqual([1, 2, 4, 8].map(throughputParallelism), [1, 2, 4, 8]);
  assert.throws(() => throughputParallelism(6), /1, 2, 4, 8/);
});

test("candidate dependency evidence omits producer reasoning", () => {
  const evidence = compactDependencyEvidence([
    { id: "owner", status: "completed", run: { output: { summary: "owner reasoning", evidence: [{ claim: "owner claim" }] } } },
    { id: "contract", status: "completed", run: { output: { summary: "base contract", evidence: [{ claim: "constraint" }] } } },
  ], { candidateProducerId: "owner", candidateFingerprint: "abc123" });
  assert.deepEqual(evidence[0], { id: "owner", status: "completed", candidateFingerprint: "abc123" });
  assert.equal(JSON.stringify(evidence[0]).includes("owner reasoning"), false);
  assert.equal(evidence[1].summary, "base contract");
});

test("adaptive routing uses one, two, or four workers from deterministic task signals", () => {
  const narrow = adaptiveParallelWorkstreams({
    lane: "core", mode: "repair", objective: "Fix one parser edge", acceptance: ["Focused test passes"],
    scope: ["src/parser.mjs"], risk: "low",
  });
  assert.equal(narrow.route.parallelism, 1);
  assert.equal(narrow.route.taskClass, "narrow-strong-contract");
  assert.deepEqual(narrow.workstreams.map(({ id }) => id), ["owner"]);

  const explicitNarrow = adaptiveParallelWorkstreams({
    lane: "core", mode: "analyze", objective: "Audit one bounded edge",
    acceptance: ["Evidence", "Regression", "Usage", "Risk"], scope: ["src/parser.mjs"], risk: "low",
  });
  assert.equal(explicitNarrow.route.parallelism, 1);
  assert.equal(explicitNarrow.route.signals.acceptanceCount, 4);
  assert.deepEqual(explicitNarrow.workstreams.map(({ id }) => id), ["owner"]);

  const bounded = adaptiveParallelWorkstreams({
    lane: "core", mode: "repair", objective: "Repair bounded behavior", acceptance: ["Tests pass", "No regression", "Current evidence", "Document risk"],
    scope: ["src/parser.mjs"], risk: "moderate",
  });
  assert.equal(bounded.route.parallelism, 2);
  assert.deepEqual(bounded.workstreams.map(({ id }) => id), ["owner", "edges"]);

  assert.equal(adaptiveRoute({ scope: ["a", "b", "c"], acceptance: ["ok"], risk: "low" }).parallelism, 4);
  assert.equal(adaptiveRoute({ scope: ["src"], acceptance: ["ok"], risk: "low" }).parallelism, 4);
  assert.equal(adaptiveRoute({ scope: ["a"], acceptance: ["ok"], risk: "high" }).parallelism, 4);
  assert.equal(adaptiveRoute({ scope: ["a"], acceptance: ["ok"], reservedBoundary: true }).parallelism, 4);
});

test("task budgets adapt to risk while explicit overrides remain authoritative", () => {
  assert.deepEqual(adaptiveBudgets({ mode: "repair", risk: "low" }), { maxFiles: 8, maxCommands: 14 });
  assert.deepEqual(adaptiveBudgets({ mode: "repair", risk: "high" }), { maxFiles: 12, maxCommands: 20 });
  assert.deepEqual(adaptiveBudgets({ mode: "analyze", risk: "moderate" }), { maxFiles: 8, maxCommands: 14 });
  assert.deepEqual(adaptiveBudgets({ mode: "repair", risk: "high", maxFiles: 18, maxCommands: 31 }), { maxFiles: 18, maxCommands: 31 });
  assert.deepEqual(adaptiveBudgets({ mode: "repair", risk: "high", maxFiles: 99, maxCommands: 99 }), { maxFiles: 30, maxCommands: 50 });
});

test("compact start_task expands into an owner, base contract guard, and post-patch challenges", () => {
  const workstreams = defaultParallelWorkstreams({
    lane: "core",
    mode: "repair",
    objective: "Fix exact-gap merging without mutating input",
    acceptance: ["Tests pass", "Input stays unchanged"],
    scope: ["src/merge.mjs", "test/merge.test.mjs"],
    risk: "low",
  });
  assert.deepEqual(workstreams.map(({ id }) => id), ["owner", "contract", "edges", "verify"]);
  assert.deepEqual(workstreams.map(({ mode }) => mode), ["repair", "analyze", "analyze", "analyze"]);
  assert.deepEqual(workstreams.map(({ lane }) => lane), ["core", "core", "tests", "verifier"]);
  assert.ok(workstreams.every(({ scope }) => scope.length === 2));
  assert.match(workstreams[1].objective, /contract/i);
  assert.match(workstreams[2].objective, /edge cases/i);
  assert.match(workstreams[3].objective, /Independently/);
  assert.match(workstreams[1].objective, /base snapshot/);
  assert.deepEqual(workstreams[1].dependsOn, undefined);
  assert.deepEqual(workstreams[1].readLease, []);
  assert.deepEqual(workstreams.slice(2).map(({ dependsOn }) => dependsOn), [["owner"], ["owner"]]);
  assert.deepEqual(workstreams.slice(2).map(({ candidateFrom }) => candidateFrom), ["owner", "owner"]);
  assert.ok(workstreams.slice(2).every(({ objective }) => /candidate/i.test(objective)));
  const graph = normalizeTaskDag(workstreams, { maxParallelism: 4 });
  assert.deepEqual(graph.nodes.map(({ state }) => state), ["ready", "ready", "pending", "pending"]);
});

test("speed-first accepts unique Sol-defined workstreams and isolates narrow writes", () => {
  assert.equal(validateSpeedWorkstreams([
    { id: "one", mode: "analyze" },
    { id: "two" },
  ]).length, 2);
  assert.throws(() => validateSpeedWorkstreams([{ id: "one" }, { id: "one" }]), /unique id/);
  assert.equal(validateSpeedWorkstreams([
    { id: "one", mode: "implement", scope: ["src/a.mjs"] },
    { id: "two", mode: "repair", scope: ["tests/b.test.mjs"] },
  ])[0].mode, "implement");
  assert.throws(() => validateSpeedWorkstreams([
    { id: "one", mode: "implement", scope: ["src"] },
    { id: "two", mode: "repair", scope: ["src/b.mjs"] },
  ]), /scopes overlap/);
  assert.throws(() => validateSpeedWorkstreams([
    { id: "one", lane: "verifier", mode: "implement", scope: ["src/a.mjs"] },
    { id: "two" },
  ]), /verifier lane is read-only/);
  assert.equal(validateSpeedWorkstreams([{ id: "owner", mode: "analyze" }], { allowSingle: true }).length, 1);
  assert.throws(() => validateSpeedWorkstreams([{ id: "owner", mode: "analyze" }]), /2 to 8/);
});

test("adaptive terminal reporting stays deterministic unless risk or failure needs compression", () => {
  const workstreams = [{ id: "owner" }];
  const completed = [{ id: "owner", status: "completed", risks: [], needsSol: [] }];
  assert.equal(shouldUseBatchLeader({ profile: "adaptive", workstreams, outcomes: completed, integration: { applied: true } }), false);
  assert.equal(shouldUseBatchLeader({ profile: "adaptive", workstreams, outcomes: [{ ...completed[0], risks: [{ severity: "high" }] }], integration: { applied: true } }), true);
  const lowRiskPair = [{ id: "owner", risk: "low" }, { id: "edges", risk: "low" }];
  const boundedRisk = [
    { ...completed[0], risks: [{ severity: "high" }], needsSol: [{ decision: "Sol review", reason: "Preserve the full outcome" }] },
    { id: "edges", status: "completed", risks: [], needsSol: [] },
  ];
  assert.equal(shouldUseBatchLeader({ profile: "adaptive", workstreams: lowRiskPair, outcomes: boundedRisk, integration: { applied: true } }), false);
  assert.equal(shouldUseBatchLeader({ profile: "adaptive", workstreams: lowRiskPair, outcomes: [{ ...boundedRisk[0], status: "failed" }, boundedRisk[1]], integration: { applied: true } }), true);
  assert.equal(shouldUseBatchLeader({ profile: "adaptive", workstreams, outcomes: completed, integration: { applied: false } }), true);
  assert.equal(shouldUseBatchLeader({ profile: "speed-first", workstreams, outcomes: completed, integration: { applied: true } }), true);
});

test("shared batch Leader checkpoint encourages 90-second workstreams without imposing a hard cap", () => {
  assert.deepEqual(batchSupervisionSchedule(120), {
    enabled: true,
    renewable: true,
    checkpointMs: 90_000,
    repeatMs: 30_000,
    staleMs: 45_000,
    leaderTimeoutMs: 30_000,
    maxSilentChecks: 4,
    sizingTargetMs: 90_000,
  });
  assert.equal(batchSupervisionSchedule(60).checkpointMs, 60_000);
  const long = batchSupervisionSchedule(600);
  assert.equal(long.checkpointMs, 90_000);
  assert.equal(long.hardMs, undefined);
  assert.equal(long.leaderTimeoutMs, 30_000);
});

test("burst prompt preserves Sol planning and reserved decisions", () => {
  const prompt = compactBurstTask({
    id: "audit",
    lane: "core",
    objective: "Inspect the parser",
    acceptance: ["Return evidence"],
    scope: ["parser.mjs"],
    reservedBoundary: true,
  }, { maxFiles: 4, maxCommands: 8 });
  assert.match(prompt, /Sol-defined read-only workstream/);
  assert.match(prompt, /decide architecture/);
  assert.match(prompt, /reservedBoundary/);
  assert.match(prompt, /full acceptance suite/);
});

test("contract guard prompt blocks only literal reserved decisions", () => {
  const prompt = compactBurstTask({
    id: "contract", lane: "core", mode: "analyze",
    objective: "Check the supplied contract", acceptance: ["Tests pass"], scope: ["src", "tests"],
  }, { maxFiles: 8, maxCommands: 14 });
  assert.match(prompt, /concurrent contract guard/);
  assert.match(prompt, /ordinary ambiguity/);
  assert.match(prompt, /status=blocked/);
});

test("mutating burst prompts reserve verification after the last edit", () => {
  const prompt = compactBurstTask({
    id: "owner", lane: "core", mode: "implement",
    objective: "Implement the parser", acceptance: ["Tests pass"], scope: ["src"],
  }, { maxFiles: 8, maxCommands: 14 });
  assert.match(prompt, /after the last edit/);
  assert.match(prompt, /cannot verify again/);
  assert.match(prompt, /hidden tests belong in risks/);
});

test("batch Leader keeps unsupported Luna risks as candidate findings", () => {
  const prompt = compactBatchLeaderPrompt({
    batchId: "batch-1",
    workstreams: [{ id: "review", lane: "verifier", objective: "Review the contract" }],
    outcomes: [{ id: "review", status: "completed", risks: [{ severity: "high", issue: "Unverified claim" }] }],
    integration: { applied: true, reason: "not-required" },
    timing: { workerWallMs: 100 },
  });
  assert.match(prompt, /candidate findings/);
  assert.match(prompt, /unsupported claims/);
  assert.match(prompt, /confidence is a correctness verdict/);
});

test("shared batch Leader manages every active slot without taking over planning", () => {
  const prompt = compactBatchSupervisorPrompt({
    batchId: "batch-1",
    snapshots: [
      { slot: "burst-1", workstreamId: "a", elapsedMs: 90_000, silentMs: 2_000, eventCount: 8, lastEvent: "item/started" },
      { slot: "burst-2", workstreamId: "b", elapsedMs: 90_000, silentMs: 70_000, eventCount: 1, lastEvent: "turn/started" },
    ],
    schedule: batchSupervisionSchedule(180),
  });
  assert.match(prompt, /burst-1/);
  assert.match(prompt, /burst-2/);
  assert.match(prompt, /recommend continue/);
  assert.match(prompt, /renewable leases/);
  assert.match(prompt, /Do not inspect the repository/);
  assert.match(prompt, /plan or reassign work/);
});

test("bounded concurrency assigns no more than the selected burst slots", async () => {
  let active = 0;
  let maximumActive = 0;
  const slots = new Set();
  const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 4, async (item, _index, slotIndex) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    slots.add(slotIndex);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return item * 2;
  });
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12]);
  assert.equal(maximumActive, 4);
  assert.equal(slots.size, 4);
});

test("adaptive concurrency permits a two-slot queue", async () => {
  let active = 0;
  let maximumActive = 0;
  await mapWithConcurrency([1, 2, 3], 2, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });
  assert.equal(maximumActive, 2);
});

test("an idle burst slot immediately claims queued work while a sibling remains active", async () => {
  const starts = [];
  let longFinished = false;
  await mapWithConcurrency(["long", "short-a", "short-b", "short-c", "queued"], 4, async (item, _index, slotIndex) => {
    starts.push({ item, slotIndex, longFinished });
    await new Promise((resolve) => setTimeout(resolve, item === "long" ? 80 : 10));
    if (item === "long") longFinished = true;
    return item;
  });
  const queued = starts.find((entry) => entry.item === "queued");
  assert.ok(queued);
  assert.equal(queued.longFinished, false);
  assert.notEqual(queued.slotIndex, 0);
});
