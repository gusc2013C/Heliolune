export const TOKEN_FIRST = Object.freeze({
  id: "token-first",
  workerCount: 4,
  defaultParallelism: 1,
  allowedParallelism: [1],
  cachePolicy: "function-affine-reuse",
});

export const SPEED_FIRST = Object.freeze({
  id: "speed-first",
  workerCount: 8,
  defaultParallelism: 4,
  allowedParallelism: [4, 8],
  cachePolicy: "best-effort-burst",
});

export function speedParallelism(value) {
  const parsed = Number(value ?? SPEED_FIRST.defaultParallelism);
  if (!SPEED_FIRST.allowedParallelism.includes(parsed)) {
    throw new Error(`speed-first parallelism must be one of ${SPEED_FIRST.allowedParallelism.join(", ")}`);
  }
  return parsed;
}

export function burstLanes(parallelism = SPEED_FIRST.defaultParallelism) {
  return Array.from({ length: speedParallelism(parallelism) }, (_, index) => `burst-${index + 1}`);
}

export function validateSpeedWorkstreams(workstreams) {
  if (!Array.isArray(workstreams) || workstreams.length < 2 || workstreams.length > SPEED_FIRST.workerCount) {
    throw new Error("speed-first requires 2 to 8 Sol-defined workstreams");
  }
  const ids = new Set();
  const normalized = [];
  for (const workstream of workstreams) {
    if (!workstream || typeof workstream !== "object") throw new Error("Every speed-first workstream must be an object");
    if (!workstream.id || ids.has(workstream.id)) throw new Error("Every speed-first workstream needs a unique id");
    ids.add(workstream.id);
    const mode = workstream.mode ?? "analyze";
    if (!["analyze", "implement", "repair"].includes(mode)) throw new Error(`Unsupported speed-first mode: ${mode}`);
    if (workstream.lane === "verifier" && mode !== "analyze") throw new Error("The verifier lane is read-only");
    const scope = (workstream.scope ?? []).map((entry) => String(entry).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, ""));
    if (mode !== "analyze") {
      if (!scope.length || scope.some((entry) => !entry || entry === "." || entry.startsWith("/") || /^[A-Za-z]:/.test(entry) || entry.split("/").includes("..") || /[*?\[\]]/.test(entry))) {
        throw new Error("Parallel write scopes must be narrow repository-relative paths without globs or parent traversal");
      }
    }
    normalized.push({ ...workstream, mode, scope });
  }
  const mutating = normalized.filter((workstream) => workstream.mode !== "analyze");
  for (let left = 0; left < mutating.length; left += 1) {
    for (let right = left + 1; right < mutating.length; right += 1) {
      for (const first of mutating[left].scope) {
        for (const second of mutating[right].scope) {
          const a = process.platform === "win32" ? first.toLowerCase() : first;
          const b = process.platform === "win32" ? second.toLowerCase() : second;
          if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
            throw new Error(`Parallel write scopes overlap: ${mutating[left].id} and ${mutating[right].id}`);
          }
        }
      }
    }
  }
  return normalized;
}

export function batchSupervisionSchedule(timeoutSeconds) {
  const hardSeconds = Math.max(30, Math.min(600, Number(timeoutSeconds) || 120));
  if (hardSeconds <= 90) return { enabled: false, hardMs: hardSeconds * 1000 };
  const checkpointSeconds = Math.max(60, Math.min(90, hardSeconds - 30));
  return {
    enabled: true,
    hardMs: hardSeconds * 1000,
    checkpointMs: checkpointSeconds * 1000,
    leaderTimeoutMs: Math.min(30, hardSeconds - checkpointSeconds - 5) * 1000,
  };
}

export async function mapWithConcurrency(items, parallelism, work) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(speedParallelism(parallelism), items.length) }, (_, slotIndex) => (async () => {
    while (nextIndex < items.length) {
      const itemIndex = nextIndex;
      nextIndex += 1;
      results[itemIndex] = await work(items[itemIndex], itemIndex, slotIndex);
    }
  })());
  await Promise.all(runners);
  return results;
}

export function compactBurstTask(workstream, budget) {
  const mode = workstream.mode ?? "analyze";
  return [
    `BURST_DELTA ${JSON.stringify({
      id: workstream.id,
      lane: workstream.lane,
      mode,
      objective: workstream.objective,
      acceptance: workstream.acceptance,
      scope: workstream.scope,
      repoState: workstream.repoState || undefined,
      risk: workstream.risk ?? "moderate",
      reservedBoundary: workstream.reservedBoundary ?? false,
      budget,
    })}`,
    mode === "analyze"
      ? "This is one Sol-defined read-only workstream in a parallel batch. Inspect only its scope and never modify files."
      : "This workstream runs in a detached Git worktree. Modify only its exact scope, preserve unrelated state, and do not commit, branch, merge, or inspect other worktrees.",
    "Prefer finishing within 90 seconds, but continue bounded work until the supplied hard deadline when decisive evidence legitimately needs longer. Never coordinate with other workers or decide architecture, security, public APIs, or migrations. Stop when acceptance has decisive evidence. Return status=partial rather than broadening scope or exhausting the deadline. Return the schema only.",
  ].join("\n");
}

export function compactBatchLeaderPrompt({ batchId, workstreams, outcomes, integration, timing }) {
  return [
    `BATCH_REPORT_DELTA ${JSON.stringify({
      batchId,
      workstreams: workstreams.map((workstream) => ({ id: workstream.id, lane: workstream.lane, objective: workstream.objective })),
      outcomes,
      integration,
      timing,
    })}`,
    "Act only as the shared operations leader and reporting compressor. Account for every workstream, preserve decisive evidence, failures, risks, and needsSol decisions, and produce one compact handoff. Do not inspect the repository, call tools, plan or assign work, resolve disagreements, decide reserved boundaries, or perform final acceptance. Return the schema only.",
  ].join("\n");
}

export function compactBatchSupervisorPrompt({ batchId, snapshots, schedule }) {
  return [
    `BATCH_SUPERVISE_DELTA ${JSON.stringify({ batchId, checkpointMs: schedule.checkpointMs, hardMs: schedule.hardMs, workers: snapshots })}`,
    "Manage liveness only. For every supplied active burst slot, recommend continue unless sustained silence and event history make a stall likely; recommend interrupt only with high confidence. Do not inspect the repository, call tools, plan or reassign work, judge correctness, or change scope. Return the schema only.",
  ].join("\n");
}
