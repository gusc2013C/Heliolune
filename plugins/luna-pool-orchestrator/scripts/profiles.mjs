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

export const ADAPTIVE = Object.freeze({
  id: "adaptive",
  workerCount: 4,
  defaultParallelism: 1,
  allowedParallelism: [1, 2, 4],
  cachePolicy: "evidence-guided-burst",
});

export const DEFAULT_PROFILE = ADAPTIVE;

const MAX_FILES = 30;
const MAX_COMMANDS = 50;

function bounded(value, fallback, maximum) {
  const parsed = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  return Math.min(maximum, Math.max(3, parsed));
}

export function adaptiveBudgets({ mode = "analyze", risk = "moderate", maxFiles, maxCommands } = {}) {
  const mutating = mode !== "analyze";
  const elevated = risk === "moderate" || risk === "high";
  const defaults = mutating
    ? (elevated ? { maxFiles: 12, maxCommands: 20 } : { maxFiles: 8, maxCommands: 14 })
    : (elevated ? { maxFiles: 8, maxCommands: 14 } : { maxFiles: 6, maxCommands: 10 });
  return {
    maxFiles: bounded(maxFiles, defaults.maxFiles, MAX_FILES),
    maxCommands: bounded(maxCommands, defaults.maxCommands, MAX_COMMANDS),
  };
}

function compactAcceptance(acceptance) {
  return (Array.isArray(acceptance) ? acceptance : [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function compactDependencyEvidence(dependencyExecutions, { candidateProducerId, candidateFingerprint } = {}) {
  return dependencyExecutions.map((execution) => execution.id === candidateProducerId
    ? {
        id: execution.id,
        status: execution.status,
        candidateFingerprint,
      }
    : {
        id: execution.id,
        status: execution.status,
        summary: execution.run?.output?.summary,
        evidence: execution.run?.output?.evidence?.slice(0, 4),
      });
}

export function defaultParallelWorkstreams(args) {
  const mode = args.mode ?? "analyze";
  const mutating = mode !== "analyze";
  const objective = String(args.objective ?? "").trim();
  const acceptance = compactAcceptance(args.acceptance);
  const shared = {
    scope: args.scope ?? [],
    repoState: args.repoState,
    risk: args.risk ?? "moderate",
    reservedBoundary: Boolean(args.reservedBoundary),
  };
  return [
    {
      ...shared,
      id: "owner",
      kind: mode === "implement" ? "implement" : mode === "repair" ? "repair" : "inspect",
      lane: args.lane ?? "core",
      mode,
      objective,
      acceptance,
    },
    {
      ...shared,
      id: "contract",
      kind: "inspect",
      lane: "core",
      mode: "analyze",
      readLease: mutating ? [] : undefined,
      objective: `Analyze the base snapshot contract and exact constraints the concurrent owner must satisfy for: ${objective}. Do not judge or claim to observe the concurrent owner's result.`,
      acceptance: ["Return only literal contract blockers, constraints, and useful implementation risks from the base snapshot."],
    },
    {
      ...shared,
      id: "edges",
      kind: "challenge",
      lane: "tests",
      mode: "analyze",
      dependsOn: mutating ? ["owner"] : [],
      candidateFrom: mutating ? "owner" : undefined,
      objective: mutating
        ? `Challenge the completed owner candidate for edge cases, regressions, and decisive tests: ${objective}. Bind every verdict to the supplied candidate fingerprint.`
        : `Derive edge cases, regressions, and decisive tests from the current snapshot for: ${objective}.`,
      acceptance: [mutating
        ? "Inspect the exact post-patch candidate and return at least one orthogonal check or explain why none is feasible."
        : "Return compact edge cases and decisive tests for Sol review."],
    },
    {
      ...shared,
      id: "verify",
      kind: "challenge",
      lane: "verifier",
      mode: "analyze",
      dependsOn: mutating ? ["owner"] : [],
      candidateFrom: mutating ? "owner" : undefined,
      objective: mutating
        ? `Independently challenge the completed owner candidate and highest-risk failure for: ${objective}. Bind the verdict to the supplied candidate fingerprint.`
        : `Independently derive expected behavior and the highest-risk failure for: ${objective}.`,
      acceptance: [mutating
        ? "Inspect the exact post-patch candidate without relying on owner reasoning and run an orthogonal check when feasible."
        : "Return an independent expected-behavior checklist and highest-risk failure."],
    },
  ];
}

export function adaptiveRoute(args = {}) {
  const scopes = [...new Set((args.scope ?? []).map((entry) => String(entry).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")))];
  const scopeCount = scopes.length;
  const fileExtension = /\.(?:c|cc|cpp|cxx|h|hpp|cs|css|go|html|java|js|jsx|json|kt|kts|md|mjs|cjs|py|rs|scss|sh|sql|toml|ts|tsx|txt|xml|yaml|yml|ps1)$/i;
  const directoryScope = scopes.some((entry) => !fileExtension.test(entry.split("/").at(-1) ?? ""));
  const acceptanceCount = compactAcceptance(args.acceptance).length;
  const risk = args.risk ?? "moderate";
  const reservedBoundary = Boolean(args.reservedBoundary);
  let parallelism;
  let taskClass;
  let reason;

  if (reservedBoundary || risk === "high" || scopeCount >= 3 || directoryScope) {
    parallelism = 4;
    taskClass = reservedBoundary ? "reserved-boundary" : risk === "high" ? "high-risk" : "broad-scope";
    reason = reservedBoundary
      ? "Reserved decisions keep the full independent review set available for Sol."
      : risk === "high"
        ? "High-risk work keeps the full independent review set."
        : directoryScope
          ? "A directory-level scope keeps the full four-way review set."
          : "Three or more scoped paths justify the full four-way review set."
  } else if (risk === "low" && scopeCount <= 2) {
    parallelism = 1;
    taskClass = "narrow-strong-contract";
    reason = "A low-risk task with at most two scoped paths stays on one critical-path worker; a detailed acceptance contract does not require duplicate exploration."
  } else {
    parallelism = 2;
    taskClass = "bounded-review";
    reason = "A bounded moderate task adds one independent edge/test review without forcing four active workers."
  }

  return {
    profile: ADAPTIVE.id,
    parallelism,
    taskClass,
    reason,
    signals: { scopeCount, directoryScope, acceptanceCount, risk, reservedBoundary },
  };
}

export function adaptiveParallelWorkstreams(args) {
  const route = adaptiveRoute(args);
  const all = defaultParallelWorkstreams(args);
  const selected = route.parallelism === 1
    ? all.slice(0, 1)
    : route.parallelism === 2
      ? [all[0], all[2]]
      : all;
  return { route, workstreams: selected };
}

export function speedParallelism(value) {
  const parsed = Number(value ?? SPEED_FIRST.defaultParallelism);
  if (!SPEED_FIRST.allowedParallelism.includes(parsed)) {
    throw new Error(`speed-first parallelism must be one of ${SPEED_FIRST.allowedParallelism.join(", ")}`);
  }
  return parsed;
}

export function throughputParallelism(value) {
  const allowed = [1, 2, 4, 8];
  const parsed = Number(value ?? SPEED_FIRST.defaultParallelism);
  if (!allowed.includes(parsed)) {
    throw new Error(`throughput parallelism must be one of ${allowed.join(", ")}`);
  }
  return parsed;
}

export function adaptiveParallelism(value) {
  const parsed = Number(value ?? ADAPTIVE.defaultParallelism);
  if (!ADAPTIVE.allowedParallelism.includes(parsed)) {
    throw new Error(`adaptive parallelism must be one of ${ADAPTIVE.allowedParallelism.join(", ")}`);
  }
  return parsed;
}

export function poolParallelism(value) {
  const parsed = Number(value);
  if (![1, 2, 4, 8].includes(parsed)) throw new Error("worker parallelism must be one of 1, 2, 4, 8");
  return parsed;
}

export function burstLanes(parallelism = SPEED_FIRST.defaultParallelism) {
  return Array.from({ length: poolParallelism(parallelism) }, (_, index) => `burst-${index + 1}`);
}

export function validateSpeedWorkstreams(workstreams, { allowSingle = false } = {}) {
  const minimum = allowSingle ? 1 : 2;
  if (!Array.isArray(workstreams) || workstreams.length < minimum || workstreams.length > SPEED_FIRST.workerCount) {
    throw new Error(`${allowSingle ? "adaptive" : "speed-first"} requires ${minimum} to 8 Sol-defined workstreams`);
  }
  const ids = new Set();
  const normalized = [];
  for (const workstream of workstreams) {
    if (!workstream || typeof workstream !== "object") throw new Error("Every speed-first workstream must be an object");
    if (!workstream.id || ids.has(workstream.id)) throw new Error("Every speed-first workstream needs a unique id");
    ids.add(workstream.id);
    const mode = workstream.mode ?? "analyze";
    if (!["analyze", "implement", "repair"].includes(mode)) throw new Error(`Unsupported DAG workstream mode: ${mode}`);
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

export function batchSupervisionSchedule(requestedCheckpointSeconds) {
  const checkpointSeconds = Math.min(90, Math.max(30, Number(requestedCheckpointSeconds) || 90));
  return {
    enabled: true,
    renewable: true,
    checkpointMs: checkpointSeconds * 1000,
    repeatMs: 30_000,
    staleMs: 45_000,
    leaderTimeoutMs: 30_000,
    maxSilentChecks: 4,
    sizingTargetMs: 90_000,
  };
}

export async function mapWithConcurrency(items, parallelism, work) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(poolParallelism(parallelism), items.length) }, (_, slotIndex) => (async () => {
    while (nextIndex < items.length) {
      const itemIndex = nextIndex;
      nextIndex += 1;
      results[itemIndex] = await work(items[itemIndex], itemIndex, slotIndex);
    }
  })());
  await Promise.all(runners);
  return results;
}

export function shouldUseBatchLeader({ profile, workstreams, outcomes, integration }) {
  if (profile !== ADAPTIVE.id) return true;
  if (integration && integration.applied === false) return true;
  if (workstreams.length >= 4) return true;
  const terminal = outcomes.length === workstreams.length
    && outcomes.every((outcome) => ["completed", "cancelled"].includes(outcome.status));
  const declaredLowRisk = workstreams.every((workstream) => (workstream.risk ?? "moderate") === "low");
  if (terminal && declaredLowRisk && workstreams.length <= 2) return false;
  return outcomes.some((outcome) => (
    !["completed", "cancelled"].includes(outcome.status)
    || outcome.needsSol?.length
    || outcome.risks?.some((risk) => ["high", "critical"].includes(risk.severity))
  ));
}

export function compactBurstTask(workstream, budget) {
  const mode = workstream.mode ?? "analyze";
  return [
    `BURST_DELTA ${JSON.stringify({
      id: workstream.id,
      kind: workstream.kind,
      lane: workstream.lane,
      mode,
      objective: workstream.objective,
      acceptance: workstream.acceptance,
      scope: workstream.scope,
      repoState: workstream.repoState || undefined,
      risk: workstream.risk ?? "moderate",
      reservedBoundary: workstream.reservedBoundary ?? false,
      dependsOn: workstream.dependsOn?.length ? workstream.dependsOn : undefined,
      baseRef: workstream.baseRef ?? undefined,
      candidateFingerprint: workstream.candidateFingerprint ?? undefined,
      dependencyEvidence: workstream.dependencyEvidence?.length ? workstream.dependencyEvidence : undefined,
      budget,
    })}`,
    mode === "analyze"
      ? "This is one Sol-defined read-only workstream in a parallel batch. Inspect only its scope and never modify files."
      : "This workstream runs in a detached Git worktree. Modify only its exact scope, preserve unrelated state, and do not commit, branch, merge, or inspect other worktrees.",
    workstream.id === "contract"
      ? "You are the concurrent contract guard. Use status=blocked with a non-empty needsSol only when the writer literally cannot proceed without choosing a Sol-owned architecture, security, public API, irreversible migration, or contradictory scope/acceptance decision. Put ordinary ambiguity, possible hidden expectations, message wording, and implementation choices in risks with needsSol=[]; never block for them."
      : "Set needsSol=[] unless the supplied contract literally prevents bounded work without a reserved Sol decision.",
    mode === "analyze"
      ? "Stop after decisive review evidence; do not run the full acceptance suite merely to rediscover failures in the base snapshot."
      : "Reserve the final portion of the work window for decisive checks after the last edit. Once acceptance passes, do not add cleanup or hardening that you cannot verify again before returning.",
    "Completion means the scoped work is done and every supplied, runnable acceptance check has decisive current evidence. Unknown or unavailable hidden tests belong in risks and do not make status partial. Use status=partial only when supplied work remains unfinished or a supplied check is missing, stale, failed, or not run.",
    "Prefer a workstream sized near 90 seconds, but there is no fixed execution deadline while app-server activity shows live bounded progress. Never coordinate with other workers or decide architecture, security, public APIs, or migrations. Stop when acceptance has decisive evidence. Return status=partial rather than broadening scope.",
    workstream.candidateFingerprint
      ? `This is a clean-room post-patch challenge bound to candidate ${workstream.candidateFingerprint}. Inspect the supplied candidate checkout, do not trust owner reasoning, and include the fingerprint in the summary. If the checkout fingerprint changes, return status=blocked.`
      : "Use only the repository state and dependency evidence supplied to this node; never claim to observe an unsupplied candidate.",
    "Keep the final payload compact: one-sentence summary and only decisive evidence, checks, risks, or Sol decisions. Do not repeat reasoning across fields.",
    "Return the schema only.",
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
    "Act only as the shared operations leader and reporting compressor. Read-only review workstreams inspected independent base snapshots in parallel and cannot observe or verify a concurrent writer's patch; report their findings as review guidance, never as evidence that the writer's later files are missing or contradictory. Worker risks are candidate findings unless a supplied passed check proves them: do not present unsupported claims as established facts, upgrade their severity, or imply that your confidence is a correctness verdict. Treat actualChangePaths and integration as authoritative for artifact state. Account for every workstream, preserve decisive evidence, failures, risks, and needsSol decisions, and produce one compact handoff. Do not inspect the repository, call tools, plan or assign work, resolve disagreements, decide reserved boundaries, or perform final acceptance. Return the schema only.",
  ].join("\n");
}

export function compactBatchSupervisorPrompt({ batchId, snapshots, schedule }) {
  return [
    `BATCH_SUPERVISE_DELTA ${JSON.stringify({ batchId, checkpointMs: schedule.checkpointMs, staleAfterMs: schedule.staleMs, workers: snapshots })}`,
    "Manage liveness only. Workers have renewable leases inside a separate deterministic total execution budget enforced by the controller. For every supplied active burst slot, recommend continue while activity indicates bounded work; recommend interrupt only with high confidence after sustained silence indicates a stall. Do not inspect the repository, call tools, plan or reassign work, judge correctness, change scope, or override the controller budget. Return the schema only.",
  ].join("\n");
}
