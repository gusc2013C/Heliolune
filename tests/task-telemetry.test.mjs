import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskTelemetry, createTaskNodes, TASK_NODE_VERSION } from "../plugins/luna-pool-orchestrator/scripts/task-telemetry.mjs";

test("TASK_NODE_V1 records heterogeneous tasks without binding worker slots", () => {
  const nodes = createTaskNodes([
    { id: "owner", mode: "repair", objective: "Fix", acceptance: ["Pass"], scope: ["a.mjs"], risk: "low" },
    { id: "edges", mode: "analyze", objective: "Challenge", acceptance: ["Find edge"], scope: ["a.mjs"], risk: "low" },
  ]);
  assert.equal(nodes[0].schema, TASK_NODE_VERSION);
  assert.deepEqual(nodes.map(({ kind }) => kind), ["repair", "challenge"]);
  assert.ok(nodes.every(({ state }) => state === "ready"));
  assert.ok(nodes.every(({ dependsOn }) => dependsOn.length === 0));
});

test("task telemetry exposes queue, critical path, utilization, and unavailable acceptance metrics", () => {
  const workstreams = [
    { id: "owner", mode: "repair", objective: "Fix", acceptance: ["Pass"], scope: ["a.mjs"], risk: "low" },
    { id: "edges", mode: "analyze", objective: "Challenge", acceptance: ["Review"], scope: ["a.mjs"], risk: "low" },
  ];
  const telemetry = buildTaskTelemetry({
    profile: "adaptive",
    route: { parallelism: 2, taskClass: "bounded-review", reason: "test" },
    workstreams,
    executions: [
      { id: "owner", slot: "burst-1", status: "completed", queueWaitMs: 2, durationMs: 80 },
      { id: "edges", slot: "burst-2", status: "completed", queueWaitMs: 3, durationMs: 40 },
    ],
    workerWallMs: 100,
    leaderMs: 0,
  });
  assert.equal(telemetry.routing.actualParallelism, 2);
  assert.equal(telemetry.routing.shadowAdaptiveParallelism, 2);
  assert.equal(telemetry.nodes[0].criticalPath, true);
  assert.equal(telemetry.metrics.nonCriticalWorkerMs, 40);
  assert.equal(telemetry.metrics.slotUtilization, 0.6);
  assert.ok(telemetry.unavailable.includes("falseAcceptance"));
});

test("task telemetry does not invent a worker or accept invalid timing", () => {
  const telemetry = buildTaskTelemetry({
    profile: "adaptive", route: { parallelism: 1 }, workstreams: [], executions: [], workerWallMs: -1, leaderMs: Number.NaN,
  });
  assert.equal(telemetry.routing.actualParallelism, 0);
  assert.equal(telemetry.metrics.workerWallMs, 0);
  assert.equal(telemetry.metrics.leaderMs, 0);
  assert.equal(telemetry.metrics.slotUtilization, 0);
});

test("task telemetry treats numeric slot zero as an active slot", () => {
  const telemetry = buildTaskTelemetry({
    profile: "adaptive",
    route: { parallelism: 1 },
    workstreams: [{ id: "owner", mode: "analyze", objective: "Inspect", acceptance: ["Report"], scope: ["a.mjs"] }],
    executions: [{ id: "owner", slot: 0, status: "completed", queueWaitMs: 0, durationMs: 10 }],
    workerWallMs: 10,
    leaderMs: 0,
  });
  assert.equal(telemetry.routing.actualParallelism, 1);
  assert.equal(telemetry.metrics.slotUtilization, 1);
});
