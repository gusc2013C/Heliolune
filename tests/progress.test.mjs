import assert from "node:assert/strict";
import test from "node:test";
import { createProgressReporter, weightedWorkstreamProgress, workerProgress } from "../plugins/luna-pool-orchestrator/scripts/progress.mjs";

test("progress reporter emits only for a supplied token and increases monotonically", () => {
  const sent = [];
  let time = 20_000;
  const reporter = createProgressReporter({ token: "p-1", send: (message) => sent.push(message), minimumIntervalMs: 10_000, now: () => time });
  assert.equal(reporter.report(5, "start", { force: true }), true);
  assert.equal(reporter.report(5, "too soon"), false);
  time += 10_000;
  assert.equal(reporter.report(5, "still moving"), true);
  assert.ok(sent[1].params.progress > sent[0].params.progress);
  assert.equal(sent[1].params.progressToken, "p-1");
  assert.equal(sent[1].method, "notifications/progress");
  assert.equal(reporter.report(100, "done", { force: true }), true);
  assert.equal(reporter.report(100, "after done", { force: true }), false);
});

test("progress reporter rejects non-finite values without emitting invalid JSON", () => {
  const sent = [];
  const reporter = createProgressReporter({ token: "p-2", send: (message) => sent.push(message) });
  assert.equal(reporter.report(Number.NaN, "invalid", { force: true }), false);
  assert.equal(reporter.report(Number.POSITIVE_INFINITY, "invalid", { force: true }), false);
  assert.deepEqual(sent, []);
});

test("progress reporter stays silent without a client progress token", () => {
  const sent = [];
  const reporter = createProgressReporter({ token: null, send: (message) => sent.push(message) });
  assert.equal(reporter.report(10, "hidden", { force: true }), false);
  assert.deepEqual(sent, []);
});

test("worker progress includes lane, elapsed time, events, cache, and last activity", () => {
  const update = workerProgress({
    lane: "core",
    hardMs: 120_000,
    snapshot: {
      elapsedMs: 30_000,
      eventCount: 17,
      lastMethod: "thread/tokenUsage/updated",
      usage: { last: { inputTokens: 1000, cachedInputTokens: 900 } },
    },
  });
  assert.match(update.message, /core Luna\/max active/);
  assert.match(update.message, /30s/);
  assert.match(update.message, /17 events/);
  assert.match(update.message, /90% cached/);
  assert.ok(update.progress > 8 && update.progress < 62);
});

test("parallel progress is dominated by the critical writer", () => {
  const workstreams = [
    { id: "owner", mode: "repair" },
    { id: "contract", mode: "analyze" },
    { id: "edges", mode: "analyze" },
    { id: "verify", mode: "analyze" },
  ];
  const progress = new Map([["owner", 15], ["contract", 100], ["edges", 100], ["verify", 100]]);
  const statuses = new Map([["owner", "working"], ["contract", "completed"], ["edges", "completed"], ["verify", "completed"]]);
  assert.ok(weightedWorkstreamProgress(workstreams, progress, statuses) < 55);
  progress.set("owner", 100);
  statuses.set("owner", "completed");
  assert.equal(weightedWorkstreamProgress(workstreams, progress, statuses), 100);
});
