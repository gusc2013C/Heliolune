export const PRICE_UNIT = "price_units_per_million_tokens";
export const DEFAULT_ACTUAL_MODEL = "gpt-5.6-luna";
export const DEFAULT_BASELINE_MODEL = "gpt-5.6-sol";

export const DEFAULT_PRICING = Object.freeze({
  "gpt-5.6-sol": Object.freeze({ displayName: "GPT-5.6 Sol", input: 125, cachedInput: 12.5, output: 750 }),
  "gpt-5.6-terra": Object.freeze({ displayName: "GPT-5.6 Terra", input: 50, cachedInput: 5, output: 300 }),
  "gpt-5.6-luna": Object.freeze({ displayName: "GPT-5.6 Luna", input: 5, cachedInput: 0.5, output: 30 }),
  "gpt-5.5": Object.freeze({ displayName: "GPT-5.5", input: 125, cachedInput: 12.5, output: 750 }),
  "gpt-5.4": Object.freeze({ displayName: "GPT-5.4", input: 62.5, cachedInput: 6.25, output: 375 }),
  "gpt-5.4-mini": Object.freeze({ displayName: "GPT-5.4 Mini", input: 18.75, cachedInput: 1.875, output: 113 }),
  "gpt-5.3-codex": Object.freeze({ displayName: "GPT-5.3-Codex", input: 43.75, cachedInput: 4.375, output: 350 }),
});

const USAGE_COUNTERS = [
  "inputTokens",
  "cachedInputTokens",
  "outputTokens",
  "reasoningOutputTokens",
  "totalTokens",
  "cacheWriteInputTokens",
];

function nonNegativeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function rounded(value, digits = 8) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function validateRate(model, rate) {
  if (!rate || typeof rate !== "object") throw new Error(`Invalid pricing entry for ${model}`);
  const normalized = {
    displayName: String(rate.displayName ?? model),
    input: Number(rate.input),
    cachedInput: Number(rate.cachedInput),
    output: Number(rate.output),
  };
  for (const field of ["input", "cachedInput", "output"]) {
    if (!Number.isFinite(normalized[field]) || normalized[field] < 0) {
      throw new Error(`Pricing ${model}.${field} must be a non-negative number`);
    }
  }
  return normalized;
}

export function pricingCatalog(overridesText = process.env.HELIOLUNE_PRICING_JSON) {
  const catalog = Object.fromEntries(Object.entries(DEFAULT_PRICING).map(([model, rate]) => [model, { ...rate }]));
  if (!overridesText) return catalog;
  let overrides;
  try { overrides = JSON.parse(overridesText); }
  catch (error) { throw new Error(`HELIOLUNE_PRICING_JSON is invalid JSON: ${error.message}`); }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new Error("HELIOLUNE_PRICING_JSON must be a model-to-rate object");
  }
  for (const [model, rate] of Object.entries(overrides)) catalog[model] = validateRate(model, rate);
  return catalog;
}

export function normalizeUsage(value = {}) {
  const source = value?.last ?? value ?? {};
  const usage = Object.fromEntries(USAGE_COUNTERS.map((key) => [key, nonNegativeNumber(source[key])]));
  usage.cachedInputTokens = Math.min(usage.inputTokens, usage.cachedInputTokens);
  usage.reasoningOutputTokens = Math.min(usage.outputTokens, usage.reasoningOutputTokens);
  usage.uncachedInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  usage.cacheRate = usage.inputTokens ? usage.cachedInputTokens / usage.inputTokens : 0;
  return usage;
}

export function sumUsage(values) {
  const total = Object.fromEntries(USAGE_COUNTERS.map((key) => [key, 0]));
  for (const value of values.filter(Boolean)) {
    const usage = normalizeUsage(value);
    for (const key of USAGE_COUNTERS) total[key] += usage[key];
  }
  return normalizeUsage(total);
}

export function estimateModelCost(usageValue, model, catalog = DEFAULT_PRICING) {
  const rate = catalog[model];
  if (!rate) throw new Error(`No pricing configured for model: ${model}`);
  const usage = normalizeUsage(usageValue);
  const uncachedInput = usage.uncachedInputTokens * rate.input / 1_000_000;
  const cachedInput = usage.cachedInputTokens * rate.cachedInput / 1_000_000;
  const output = usage.outputTokens * rate.output / 1_000_000;
  return {
    model,
    displayName: rate.displayName ?? model,
    unit: PRICE_UNIT,
    amount: rounded(uncachedInput + cachedInput + output),
    breakdown: {
      uncachedInput: rounded(uncachedInput),
      cachedInput: rounded(cachedInput),
      output: rounded(output),
    },
    rate: { input: rate.input, cachedInput: rate.cachedInput, output: rate.output },
  };
}

export function compareModelCost(usageValue, options = {}) {
  const catalog = options.catalog ?? DEFAULT_PRICING;
  const actualModel = options.actualModel ?? DEFAULT_ACTUAL_MODEL;
  const baselineModel = options.baselineModel ?? DEFAULT_BASELINE_MODEL;
  const actual = estimateModelCost(usageValue, actualModel, catalog);
  const baseline = estimateModelCost(usageValue, baselineModel, catalog);
  const estimatedSavings = rounded(baseline.amount - actual.amount);
  const estimatedSavingsRate = baseline.amount ? rounded(estimatedSavings / baseline.amount, 6) : 0;
  return {
    unit: PRICE_UNIT,
    actual,
    sameTokenBaseline: baseline,
    estimatedSavings,
    estimatedSavingsRate,
    assumptions: [
      "Rates are price units per one million tokens.",
      "inputTokens includes cachedInputTokens; uncached input is input minus cached input.",
      "reasoningOutputTokens is reported for visibility but is already included in outputTokens and is not charged twice.",
      "The baseline prices the same worker token counts at the selected baseline model; it is not a measured baseline run.",
      "Controller-model planning and acceptance usage is outside the MCP worker boundary and is not included.",
    ],
  };
}

export function emptyMetrics() {
  return {
    schemaVersion: 1,
    taskRuns: 0,
    healthChecks: 0,
    healthTurns: 0,
    verifierRuns: 0,
    failedRuns: 0,
    softTimeouts: 0,
    supervisorChecks: 0,
    supervisorInterrupts: 0,
    hardTimeouts: 0,
    wallMs: 0,
    usage: normalizeUsage(),
    lanes: {},
  };
}

export function recordMetrics(existing, event) {
  const metrics = existing && existing.schemaVersion === 1 ? structuredClone(existing) : emptyMetrics();
  metrics.taskRuns = nonNegativeNumber(metrics.taskRuns);
  metrics.healthChecks = nonNegativeNumber(metrics.healthChecks);
  metrics.healthTurns = nonNegativeNumber(metrics.healthTurns);
  metrics.verifierRuns = nonNegativeNumber(metrics.verifierRuns);
  metrics.failedRuns = nonNegativeNumber(metrics.failedRuns);
  metrics.softTimeouts = nonNegativeNumber(metrics.softTimeouts);
  metrics.supervisorChecks = nonNegativeNumber(metrics.supervisorChecks);
  metrics.supervisorInterrupts = nonNegativeNumber(metrics.supervisorInterrupts);
  metrics.hardTimeouts = nonNegativeNumber(metrics.hardTimeouts);
  metrics.wallMs = nonNegativeNumber(metrics.wallMs);
  if (event.kind === "task") metrics.taskRuns += 1;
  if (event.kind === "health") metrics.healthChecks += 1;
  if (event.kind === "failed") metrics.failedRuns += 1;
  metrics.verifierRuns += event.verifierUsed ? 1 : 0;
  metrics.softTimeouts += event.softTimeout ? 1 : 0;
  metrics.supervisorChecks += event.supervisorChecked ? 1 : 0;
  metrics.supervisorInterrupts += event.supervisorInterrupted ? 1 : 0;
  metrics.hardTimeouts += event.hardTimeout ? 1 : 0;
  metrics.wallMs += nonNegativeNumber(event.wallMs);
  if (event.diagnostic) metrics.lastFailure = structuredClone(event.diagnostic);
  for (const laneRun of event.laneRuns ?? []) {
    const laneUsage = normalizeUsage(laneRun.usage);
    metrics.usage = sumUsage([metrics.usage, laneUsage]);
    if (event.kind === "health") metrics.healthTurns += 1;
    const lane = metrics.lanes[laneRun.lane] ?? { runs: 0, usage: normalizeUsage() };
    lane.runs = nonNegativeNumber(lane.runs) + 1;
    lane.usage = sumUsage([lane.usage, laneUsage]);
    metrics.lanes[laneRun.lane] = lane;
  }
  metrics.lastRecordedAt = new Date().toISOString();
  return metrics;
}

export function dashboardData({ cwd, metrics: existing, actualModel = DEFAULT_ACTUAL_MODEL, baselineModel = DEFAULT_BASELINE_MODEL, catalog = DEFAULT_PRICING }) {
  const metrics = existing && existing.schemaVersion === 1 ? existing : emptyMetrics();
  const lanes = Object.fromEntries(Object.entries(metrics.lanes ?? {}).map(([lane, data]) => [lane, {
    runs: data.runs ?? 0,
    usage: normalizeUsage(data.usage),
    cost: compareModelCost(data.usage, { actualModel, baselineModel, catalog }),
  }]));
  return {
    generatedAt: new Date().toISOString(),
    cwd,
    counts: {
      taskRuns: metrics.taskRuns ?? 0,
      healthChecks: metrics.healthChecks ?? 0,
      healthTurns: metrics.healthTurns ?? 0,
      verifierRuns: metrics.verifierRuns ?? 0,
      failedRuns: metrics.failedRuns ?? 0,
      softTimeouts: metrics.softTimeouts ?? 0,
      supervisorChecks: metrics.supervisorChecks ?? 0,
      supervisorInterrupts: metrics.supervisorInterrupts ?? 0,
      hardTimeouts: metrics.hardTimeouts ?? 0,
    },
    wallMs: metrics.wallMs ?? 0,
    usage: normalizeUsage(metrics.usage),
    cost: compareModelCost(metrics.usage, { actualModel, baselineModel, catalog }),
    lanes,
    lastFailure: metrics.lastFailure ?? null,
  };
}

export function renderDashboard(data) {
  const percent = (data.cost.estimatedSavingsRate * 100).toFixed(2);
  const lines = [
    "# Heliolune cost dashboard",
    "",
    `- Repository: ${data.cwd}`,
    `- Successful tasks: ${data.counts.taskRuns}`,
    `- Verifier runs: ${data.counts.verifierRuns}`,
    `- Failed runs / hard timeouts: ${data.counts.failedRuns} / ${data.counts.hardTimeouts}`,
    `- Supervisor checks / interrupts: ${data.counts.supervisorChecks} / ${data.counts.supervisorInterrupts}`,
    `- Worker wall time: ${(data.wallMs / 1000).toFixed(2)}s`,
    `- Input / cached / output tokens: ${data.usage.inputTokens} / ${data.usage.cachedInputTokens} / ${data.usage.outputTokens}`,
    `- Cache rate: ${(data.usage.cacheRate * 100).toFixed(2)}%`,
    `- ${data.cost.actual.displayName} estimated cost: ${data.cost.actual.amount}`,
    `- Same-token ${data.cost.sameTokenBaseline.displayName} baseline: ${data.cost.sameTokenBaseline.amount}`,
    `- Estimated worker-boundary savings: ${data.cost.estimatedSavings} (${percent}%)`,
    "",
    "| Lane | Runs | Input | Cached | Output | Estimated cost |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const [lane, laneData] of Object.entries(data.lanes)) {
    lines.push(`| ${lane} | ${laneData.runs} | ${laneData.usage.inputTokens} | ${laneData.usage.cachedInputTokens} | ${laneData.usage.outputTokens} | ${laneData.cost.actual.amount} |`);
  }
  lines.push("", "_Estimate only: same-token baseline; controller planning/acceptance usage and billed credits are excluded._");
  if (data.lastFailure) {
    lines.push(
      "",
      "## Last failed turn",
      "",
      `- Classification: ${data.lastFailure.classification}`,
      `- Last event / silence: ${data.lastFailure.lastEvent ?? "unknown"} / ${data.lastFailure.silentMs ?? "unknown"}ms`,
      `- Supervisor: ${data.lastFailure.supervision?.action ?? "not used"} (${data.lastFailure.supervision?.source ?? "n/a"})`,
    );
  }
  return lines.join("\n");
}
