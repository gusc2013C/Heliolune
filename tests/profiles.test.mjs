import assert from "node:assert/strict";
import test from "node:test";
import {
  SPEED_FIRST,
  TOKEN_FIRST,
  batchSupervisionSchedule,
  burstLanes,
  compactBatchSupervisorPrompt,
  compactBurstTask,
  mapWithConcurrency,
  speedParallelism,
  validateSpeedWorkstreams,
} from "../plugins/luna-pool-orchestrator/scripts/profiles.mjs";

test("execution profiles separate cache-oriented and burst-oriented routing", () => {
  assert.equal(TOKEN_FIRST.defaultParallelism, 1);
  assert.equal(TOKEN_FIRST.cachePolicy, "function-affine-reuse");
  assert.equal(SPEED_FIRST.defaultParallelism, 4);
  assert.deepEqual(SPEED_FIRST.allowedParallelism, [4, 8]);
  assert.deepEqual(burstLanes(4), ["burst-1", "burst-2", "burst-3", "burst-4"]);
  assert.equal(burstLanes(8).length, 8);
  assert.throws(() => speedParallelism(6), /4, 8/);
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
});

test("shared batch Leader checkpoint encourages 90-second workstreams without imposing a hard cap", () => {
  assert.equal(batchSupervisionSchedule(90).enabled, false);
  assert.deepEqual(batchSupervisionSchedule(120), {
    enabled: true,
    hardMs: 120_000,
    checkpointMs: 90_000,
    leaderTimeoutMs: 25_000,
  });
  const long = batchSupervisionSchedule(600);
  assert.equal(long.checkpointMs, 90_000);
  assert.equal(long.hardMs, 600_000);
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
