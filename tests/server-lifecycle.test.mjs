import assert from "node:assert/strict";
import test from "node:test";
import { JobStore } from "../plugins/luna-pool-orchestrator/scripts/jobs.mjs";
import { executionBudgetMs, startVisibleJob } from "../plugins/luna-pool-orchestrator/scripts/server.mjs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("worker execution budgets are risk-aware, challenge-bounded, and explicitly overridable", () => {
  assert.equal(executionBudgetMs({ risk: "low" }), 360_000);
  assert.equal(executionBudgetMs({ risk: "moderate" }), 600_000);
  assert.equal(executionBudgetMs({ risk: "high" }), 900_000);
  assert.equal(executionBudgetMs({}, { risk: "high", kind: "challenge", lane: "verifier" }), 360_000);
  assert.equal(executionBudgetMs({ maxExecutionSeconds: 1_200 }, { risk: "low", kind: "challenge" }), 1_200_000);
  assert.equal(executionBudgetMs({ maxExecutionSeconds: 20 }), 120_000);
  assert.equal(executionBudgetMs({ maxExecutionSeconds: 9_999 }), 1_800_000);
});

test("visible job owner persists independent heartbeats and never overwrites its terminal record", async () => {
  const records = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const store = new JobStore({
    idFactory: () => "88888888-8888-4888-8888-888888888888",
    minimumIntervalMs: 0,
  });
  const started = await startVisibleJob({
    lane: "tests",
    workerLanes: ["tests"],
    activeLanes: ["tests"],
    store,
    heartbeatIntervalMs: 5,
    writeRecord: async (_jobId, record) => { records.push(structuredClone(record)); },
    run: async () => {
      await blocked;
      return { status: "completed", usage: null, cost: null };
    },
  });

  await delay(24);
  assert.ok(records.filter((record) => record.status === "running" && record.heartbeatAt).length >= 2);
  release();
  await store.wait(started.jobId);
  await delay(20);
  assert.equal(records.at(-1).status, "completed");
  const countAfterTerminal = records.length;
  await delay(20);
  assert.equal(records.length, countAfterTerminal);
});
