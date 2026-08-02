export function compactLeaderPrompt({ taskId, lane, objective, acceptance, owner, verifier, finalization, timing, backlog = [] }) {
  return [
    `REPORT_DELTA ${JSON.stringify({
      taskId,
      ownerLane: lane,
      objective,
      acceptance,
      owner,
      verifier,
      finalization,
      timing,
      deferredTaskDigests: backlog,
    })}`,
    "Act only as an operations leader and reporting compressor. Track this worker outcome in your persistent context and produce a faithful handoff to Sol. Preserve decisive paths, line numbers, failed checks, risks, and explicit needsSol decisions. Do not inspect the repository, call tools, plan future work, assign tasks, decide architecture/security/public APIs/migrations, judge correctness beyond the supplied verifier verdict, or perform final acceptance. Return the schema only.",
  ].join("\n");
}

export function shouldUseLeader(args, owner, verifier) {
  const mode = args.reporting ?? "auto";
  if (mode === "leader") return true;
  if (mode === "direct") return false;
  const rawChars = JSON.stringify({ owner, verifier }).length;
  return Boolean(
    verifier
    || args.reservedBoundary
    || args.risk === "high"
    || owner.needsSol?.length
    || owner.risks?.some((risk) => ["high", "critical"].includes(risk.severity))
    || rawChars >= (args.leaderThresholdChars ?? 3200)
  );
}

export function compactCost(cost) {
  return {
    unit: cost.unit,
    actual: { model: cost.actual.model, amount: cost.actual.amount },
    sameTokenBaseline: { model: cost.sameTokenBaseline.model, amount: cost.sameTokenBaseline.amount },
    estimatedSavings: cost.estimatedSavings,
    estimatedSavingsRate: cost.estimatedSavingsRate,
    historicalProjection: {
      profileId: cost.historicalProjection.profileId,
      estimatedSolOnlyCost: cost.historicalProjection.estimatedSolOnlyCost,
      estimatedSavings: cost.historicalProjection.estimatedSavings,
      estimatedSavingsRate: cost.historicalProjection.estimatedSavingsRate,
      confidence: cost.historicalProjection.confidence,
    },
  };
}

function compactRouting(routing) {
  return {
    ownerLane: routing.ownerLane,
    verifierUsed: routing.verifierUsed,
    leaderUsed: true,
    leaderEffort: routing.leaderEffort,
    model: routing.model,
    effort: routing.effort,
  };
}

export function compactUsage(usage) {
  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
    cacheRate: usage.cacheRate,
  };
}

export function buildControllerResult({
  status,
  owner,
  verifier,
  leader,
  leaderError,
  includeRawResults,
  routing,
  supervision,
  finalization,
  usage,
  cost,
  timing,
}) {
  if (!leader) {
    return {
      status,
      reportMode: leaderError ? "direct-fallback" : "direct",
      owner,
      verifier,
      routing: { ...routing, leaderUsed: false, leaderError },
      supervision,
      finalization,
      usage,
      cost,
      timing,
    };
  }
  return {
    status,
    reportMode: "leader",
    leader,
    ...(includeRawResults ? { audit: { owner, verifier } } : {}),
    routing: compactRouting(routing),
    ...(supervision && supervision.source !== "activity" ? { supervision } : {}),
    ...(finalization?.attempted ? { finalization } : {}),
    usage: compactUsage(usage),
    cost: compactCost(cost),
    timing,
  };
}
