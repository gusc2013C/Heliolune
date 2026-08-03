import assert from "node:assert/strict";
import test from "node:test";
import { JobStore } from "../plugins/luna-pool-orchestrator/scripts/jobs.mjs";
import { startVisibleJob } from "../plugins/luna-pool-orchestrator/scripts/server.mjs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
