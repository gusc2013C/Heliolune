import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTaskDag, runTaskDag, TASK_DAG_VERSION } from "../plugins/luna-pool-orchestrator/scripts/task-dag.mjs";

const readNode = (id, extra = {}) => ({ id, lane: "core", mode: "analyze", objective: id, acceptance: ["done"], scope: [`${id}.mjs`], ...extra });

test("TASK_DAG_V1 rejects missing dependencies, cycles, and unordered lease conflicts", () => {
  assert.throws(() => normalizeTaskDag([readNode("a", { dependsOn: ["missing"] })]), /missing node/);
  assert.throws(() => normalizeTaskDag([readNode("a", { dependsOn: ["b"] }), readNode("b", { dependsOn: ["a"] })]), /cycle/);
  assert.throws(() => normalizeTaskDag([
    readNode("writer", { mode: "repair", writeLease: ["src"] }),
    readNode("reader", { readLease: ["src/a.mjs"] }),
  ]), /unordered lease conflict/);
});

test("TASK_DAG_V1 permits an ordered post-patch challenge and rejects chained writers", () => {
  const graph = normalizeTaskDag([
    readNode("owner", { mode: "repair", kind: "repair", writeLease: ["src/a.mjs"] }),
    readNode("challenge", { kind: "challenge", dependsOn: ["owner"], candidateFrom: "owner", readLease: ["src/a.mjs"] }),
  ], { maxParallelism: 2 });
  assert.equal(graph.schema, TASK_DAG_VERSION);
  assert.equal(graph.nodes[1].state, "pending");
  assert.throws(() => normalizeTaskDag([
    readNode("first", { mode: "repair" }),
    readNode("second", { mode: "repair", dependsOn: ["first"] }),
  ]), /rejects chained writers/);
});

test("DAG scheduler never runs a dependent node early and binds challenge to another slot", async () => {
  const graph = normalizeTaskDag([
    readNode("owner", { mode: "repair", kind: "repair", writeLease: ["src/a.mjs"], preferredAffinity: "src" }),
    readNode("challenge", { kind: "challenge", dependsOn: ["owner"], candidateFrom: "owner", readLease: ["src/a.mjs"], preferredAffinity: "src" }),
  ], { maxParallelism: 2 });
  const events = [];
  const result = await runTaskDag({
    graph,
    slots: ["burst-1", "burst-2"],
    runNode: async (node) => {
      events.push(node.id);
      return { status: "completed", durationMs: 1 };
    },
  });
  assert.deepEqual(events, ["owner", "challenge"]);
  assert.notEqual(result.scheduling.assignmentByNode.owner, result.scheduling.assignmentByNode.challenge);
  assert.equal(result.scheduling.widthTransitions[0].reason, "candidate-thread-isolation");
});

test("candidate challenge waits when only its producer slot is idle", async () => {
  const graph = normalizeTaskDag([
    readNode("owner", { mode: "repair", kind: "repair", writeLease: ["src/a.mjs"], priority: 100 }),
    readNode("sibling", { priority: 90 }),
    readNode("challenge", { kind: "challenge", dependsOn: ["owner"], candidateFrom: "owner", readLease: ["src/a.mjs"], priority: 80 }),
  ], { maxParallelism: 2 });
  let siblingCompleted = false;
  const result = await runTaskDag({
    graph,
    slots: ["burst-1", "burst-2"],
    runNode: async (node) => {
      if (node.id === "owner") await new Promise((resolve) => setTimeout(resolve, 5));
      if (node.id === "sibling") {
        await new Promise((resolve) => setTimeout(resolve, 20));
        siblingCompleted = true;
      }
      if (node.id === "challenge") assert.equal(siblingCompleted, true);
      return { status: "completed", durationMs: 1 };
    },
  });
  assert.notEqual(result.scheduling.assignmentByNode.owner, result.scheduling.assignmentByNode.challenge);
});

test("adaptive DAG widens 1 to 2 to 4 for an independent READY backlog", async () => {
  const graph = normalizeTaskDag([readNode("a"), readNode("b"), readNode("c"), readNode("d")], { maxParallelism: 4 });
  let active = 0;
  let peak = 0;
  const result = await runTaskDag({
    graph,
    slots: ["burst-1", "burst-2", "burst-3", "burst-4"],
    runNode: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { status: "completed", durationMs: 10 };
    },
  });
  assert.equal(peak, 4);
  assert.deepEqual(result.scheduling.widthTransitions.map(({ to }) => to), [2, 4]);
});

test("completion quorum cancels only queued optional nodes after required nodes complete", async () => {
  const graph = normalizeTaskDag([
    readNode("required"),
    readNode("optional", { optional: true, dependsOn: ["required"] }),
  ], { maxParallelism: 2, completionQuorum: 1 });
  const result = await runTaskDag({
    graph,
    slots: ["burst-1", "burst-2"],
    runNode: async () => ({ status: "completed", durationMs: 1 }),
  });
  assert.deepEqual(result.scheduling.cancelledNodes, ["optional"]);
  assert.equal(result.executions.find(({ id }) => id === "optional").status, "cancelled");
});

test("failed prerequisites block descendants without invoking them", async () => {
  const graph = normalizeTaskDag([readNode("first"), readNode("second", { dependsOn: ["first"] })], { maxParallelism: 2 });
  const invoked = [];
  const result = await runTaskDag({
    graph,
    slots: ["burst-1", "burst-2"],
    runNode: async (node) => {
      invoked.push(node.id);
      return { status: "failed", durationMs: 1 };
    },
  });
  assert.deepEqual(invoked, ["first"]);
  assert.deepEqual(result.scheduling.blockedNodes, ["second"]);
});

test("a worker-blocked node remains blocked and blocks its descendants", async () => {
  const graph = normalizeTaskDag([readNode("first"), readNode("second", { dependsOn: ["first"] })], { maxParallelism: 2 });
  const result = await runTaskDag({
    graph,
    slots: ["burst-1", "burst-2"],
    runNode: async () => ({ status: "blocked", error: "requires Sol", durationMs: 1 }),
  });
  assert.deepEqual(result.scheduling.blockedNodes, ["first", "second"]);
  assert.equal(result.executions.find(({ id }) => id === "first").status, "blocked");
});
