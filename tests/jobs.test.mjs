import assert from "node:assert/strict";
import test from "node:test";
import { JobStore } from "../plugins/luna-pool-orchestrator/scripts/jobs.mjs";

test("job store starts immediately, publishes bounded status, and awaits the result", async () => {
  let resolveRun;
  let time = 1_000;
  const persisted = [];
  const jobs = new JobStore({ now: () => time, idFactory: () => "job-1" });
  const started = jobs.start({
    lane: "core",
    workerLanes: ["core", "tests", "integration", "verifier", "supervisor"],
    onSnapshot: (snapshot) => persisted.push(snapshot),
    run: ({ report }) => new Promise((resolve) => {
      report(40, "Heliolune Leader · core active", { workerLane: "core", explanation: "Inspecting the bounded core path." });
      resolveRun = resolve;
    }),
  });
  assert.equal(started.jobId, "job-1");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(jobs.status("job-1").progress, 40);
  assert.equal(jobs.status("job-1").workers.length, 5);
  assert.equal(jobs.status("job-1").workers.find((worker) => worker.lane === "core").explanation, "Inspecting the bounded core path.");
  assert.equal(jobs.status("job-1").workers.find((worker) => worker.lane === "tests").status, "idle");
  const observed = [];
  const waiting = jobs.wait("job-1", (snapshot) => observed.push(snapshot));
  time += 500;
  resolveRun({
    status: "completed",
    usage: { inputTokens: 10, cachedInputTokens: 8, outputTokens: 2 },
    cost: {
      actual: { amount: 0.01 },
      sameTokenBaseline: { amount: 0.25 },
      estimatedSavingsRate: 0.96,
      historicalProjection: { profileId: "test-profile", estimatedSolOnlyCost: 0.04, estimatedSavings: 0.03, estimatedSavingsRate: 0.75 },
    },
  });
  assert.equal((await waiting).status, "completed");
  const final = jobs.status("job-1");
  assert.equal(final.status, "completed");
  assert.equal(final.progress, 100);
  assert.equal(final.usage.cachedInputTokens, 8);
  assert.deepEqual(final.cost, { actual: 0.01, projectedSolOnly: 0.04, estimatedSavings: 0.03, savingsPercent: 75, profile: "test-profile" });
  assert.ok(observed.some((snapshot) => snapshot.status === "completed"));
  assert.equal(persisted.at(0).progress, 1);
  assert.ok(persisted.some((snapshot) => snapshot.progress === 40));
  assert.equal(persisted.at(-1).status, "completed");
});

test("job store converts worker rejection into a stable failed snapshot", async () => {
  const jobs = new JobStore({ idFactory: () => "job-fail" });
  jobs.start({ lane: "tests", run: async () => { throw new Error("bounded failure"); } });
  await assert.rejects(jobs.wait("job-fail"), /bounded failure/);
  assert.equal(jobs.status("job-fail").status, "failed");
  assert.match(jobs.status("job-fail").message, /bounded failure/);
});

test("batch jobs can expose active workers without a synthetic profile card", async () => {
  let finish;
  const store = new JobStore({ now: () => 1_000, idFactory: () => "batch-job", minimumIntervalMs: 0 });
  const started = store.start({
    lane: "speed-first",
    workerLanes: ["burst-1", "burst-2", "supervisor"],
    activeLanes: ["burst-1", "burst-2"],
    run: () => new Promise((resolve) => { finish = resolve; }),
  });
  assert.equal(started.workers.find((worker) => worker.lane === "burst-1").status, "queued");
  assert.equal(started.workers.find((worker) => worker.lane === "supervisor").status, "idle");
  await Promise.resolve();
  finish({ status: "completed" });
  await store.wait("batch-job");
  assert.equal(store.status("batch-job").status, "completed");
});
