export function createProgressReporter({ token, send, minimumIntervalMs = 10_000, now = () => Date.now() }) {
  let lastProgress = -1;
  let lastSentAt = 0;
  let closed = false;
  return {
    get enabled() { return token !== undefined && token !== null; },
    report(progress, message, options = {}) {
      if (closed || token === undefined || token === null) return false;
      const timestamp = now();
      if (!options.force && timestamp - lastSentAt < minimumIntervalMs) return false;
      const numericProgress = Number(progress);
      if (!Number.isFinite(numericProgress)) return false;
      const bounded = Math.max(0, Math.min(100, numericProgress));
      const increasing = Math.min(100, Math.max(bounded, lastProgress + 0.01));
      if (increasing <= lastProgress) return false;
      send({
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progressToken: token, progress: increasing, total: 100, message },
      });
      lastProgress = increasing;
      lastSentAt = timestamp;
      if (increasing >= 100) closed = true;
      return true;
    },
  };
}

export function workerProgress({ lane, snapshot, targetMs }) {
  const usage = snapshot?.usage?.last ?? snapshot?.usage ?? {};
  const elapsedSeconds = Math.max(0, Math.round((snapshot?.elapsedMs ?? 0) / 1000));
  const cacheRate = usage.inputTokens
    ? `${Math.round((usage.cachedInputTokens ?? 0) / usage.inputTokens * 100)}% cached`
    : "usage pending";
  const progress = 8 + Math.min(54, (snapshot?.elapsedMs ?? 0) / Math.max(1, targetMs) * 54);
  return {
    progress,
    message: `Heliolune Leader · ${lane} Luna/max active · ${elapsedSeconds}s · ${snapshot?.eventCount ?? 0} events · ${cacheRate} · last ${snapshot?.lastMethod ?? "turn/start"}`,
    explanation: snapshot?.explanation ?? null,
  };
}

export function weightedWorkstreamProgress(workstreams = [], progressById = new Map(), statusById = new Map()) {
  if (!workstreams.length) return 0;
  const mutatingOwner = workstreams.find((workstream) => workstream.id === "owner" && workstream.mode !== "analyze")
    ?? workstreams.find((workstream) => workstream.mode !== "analyze");
  const ownerWeight = mutatingOwner ? 0.6 : 1 / workstreams.length;
  const otherWeight = mutatingOwner ? (1 - ownerWeight) / Math.max(1, workstreams.length - 1) : ownerWeight;
  let total = 0;
  for (const workstream of workstreams) {
    const progress = Number(progressById instanceof Map ? progressById.get(workstream.id) : progressById?.[workstream.id]);
    const bounded = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
    const weight = workstream.id === mutatingOwner?.id ? ownerWeight : otherWeight;
    total += bounded * weight;
  }
  const ownerProgress = mutatingOwner
    ? Number(progressById instanceof Map ? progressById.get(mutatingOwner.id) : progressById?.[mutatingOwner.id]) || 0
    : 100;
  const ownerStatus = mutatingOwner
    ? (statusById instanceof Map ? statusById.get(mutatingOwner.id) : statusById?.[mutatingOwner.id])
    : "completed";
  // Keep the UI honest: review lanes cannot make a stalled writer look nearly done.
  if (mutatingOwner && ownerProgress < 100 && !["completed", "failed"].includes(ownerStatus)) return Math.min(79, total);
  if (Math.abs(total - 100) < 1e-9) return 100;
  return Math.max(0, Math.min(100, total));
}
