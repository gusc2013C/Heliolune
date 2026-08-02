import assert from "node:assert/strict";
import test from "node:test";
import {
  compareModelCost,
  dashboardData,
  DEFAULT_PRICING,
  normalizeUsage,
  pricingCatalog,
  recordMetrics,
  renderDashboard,
  sumUsage,
} from "../plugins/luna-pool-orchestrator/scripts/pricing.mjs";

test("normalizes cached and reasoning tokens without exceeding their parents", () => {
  const usage = normalizeUsage({ inputTokens: 100, cachedInputTokens: 120, outputTokens: 10, reasoningOutputTokens: 20 });
  assert.equal(usage.cachedInputTokens, 100);
  assert.equal(usage.uncachedInputTokens, 0);
  assert.equal(usage.reasoningOutputTokens, 10);
  assert.equal(usage.cacheRate, 1);
});

test("sums usage and preserves derived fields", () => {
  const usage = sumUsage([
    { inputTokens: 100, cachedInputTokens: 40, outputTokens: 10 },
    { inputTokens: 50, cachedInputTokens: 10, outputTokens: 5 },
  ]);
  assert.equal(usage.inputTokens, 150);
  assert.equal(usage.cachedInputTokens, 50);
  assert.equal(usage.uncachedInputTokens, 100);
  assert.equal(usage.outputTokens, 15);
});

test("prices cached input separately and never double-charges reasoning output", () => {
  const usage = { inputTokens: 1_000_000, cachedInputTokens: 250_000, outputTokens: 100_000, reasoningOutputTokens: 50_000 };
  const comparison = compareModelCost(usage);
  assert.equal(comparison.actual.amount, 6.875);
  assert.equal(comparison.sameTokenBaseline.amount, 171.875);
  assert.equal(comparison.estimatedSavings, 165);
  assert.equal(comparison.estimatedSavingsRate, 0.96);
});

test("accepts provider-neutral pricing overrides", () => {
  const catalog = pricingCatalog(JSON.stringify({
    "local-worker": { displayName: "Local Worker", input: 1, cachedInput: 0.1, output: 2 },
  }));
  assert.deepEqual(catalog["gpt-5.6-sol"], DEFAULT_PRICING["gpt-5.6-sol"]);
  assert.equal(catalog["local-worker"].output, 2);
});

test("records raw metrics and renders a compact dashboard", () => {
  const metrics = recordMetrics(null, {
    kind: "task",
    wallMs: 2500,
    verifierUsed: true,
    softTimeout: true,
    supervisorChecked: true,
    synthesisAttempted: true,
    synthesisRecovered: true,
    leaderReported: true,
    leaderDeferred: false,
    diagnostic: { classification: "hard_timeout_stalled", silentMs: 60_000, lastEvent: "item/completed", supervision: { action: "continue", source: "luna-supervisor" } },
    laneRuns: [
      { lane: "core", usage: { inputTokens: 1000, cachedInputTokens: 800, outputTokens: 100 } },
      { lane: "verifier", usage: { inputTokens: 500, cachedInputTokens: 400, outputTokens: 50 } },
    ],
  });
  const data = dashboardData({ cwd: "C:\\repo", metrics });
  assert.equal(data.counts.taskRuns, 1);
  assert.equal(data.counts.verifierRuns, 1);
  assert.equal(data.counts.softTimeouts, 1);
  assert.equal(data.counts.supervisorChecks, 1);
  assert.equal(data.counts.synthesisAttempts, 1);
  assert.equal(data.counts.synthesisRecoveries, 1);
  assert.equal(data.counts.leaderReports, 1);
  assert.equal(data.lastFailure.classification, "hard_timeout_stalled");
  assert.equal(data.lanes.core.runs, 1);
  assert.match(renderDashboard(data), /Estimated worker-boundary savings/);
});
