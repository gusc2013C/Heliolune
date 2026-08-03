export const TASK_NODE_VERSION = "TASK_NODE_V1";

function nodeKind(workstream) {
  if (workstream.kind) return workstream.kind;
  if (workstream.id === "contract") return "inspect";
  if (workstream.id === "edges" || workstream.id === "verify") return "challenge";
  if (workstream.mode === "repair") return "repair";
  if (workstream.mode === "implement") return "implement";
  return "inspect";
}

export function createTaskNodes(workstreams) {
  return workstreams.map((workstream) => ({
    schema: TASK_NODE_VERSION,
    id: workstream.id,
    kind: nodeKind(workstream),
    objective: workstream.objective,
    acceptance: workstream.acceptance,
    scope: workstream.scope,
    dependsOn: workstream.dependsOn ?? [],
    baseRef: workstream.baseRef ?? null,
    readLease: workstream.readLease ?? [],
    writeLease: workstream.writeLease ?? [],
    preferredAffinity: workstream.preferredAffinity ?? null,
    priority: workstream.priority ?? 50,
    optional: Boolean(workstream.optional),
    risk: workstream.risk ?? "moderate",
    state: "ready",
  }));
}

function criticalPath(graphNodes, executionById, durationOf) {
  const byId = new Map(graphNodes.map((node) => [node.id, node]));
  const memo = new Map();
  const predecessor = new Map();
  const total = (id, visiting = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const node = byId.get(id);
    const candidates = (node?.dependsOn ?? []).map((dependency) => ({ id: dependency, total: total(dependency, visiting) }));
    const best = candidates.sort((left, right) => right.total - left.total)[0];
    if (best) predecessor.set(id, best.id);
    const value = durationOf(executionById.get(id)) + (best?.total ?? 0);
    visiting.delete(id);
    memo.set(id, value);
    return value;
  };
  const terminal = graphNodes.map((node) => ({ id: node.id, total: total(node.id) })).sort((left, right) => right.total - left.total)[0];
  const ids = new Set();
  for (let id = terminal?.id; id; id = predecessor.get(id)) ids.add(id);
  return { ids, durationMs: terminal?.total ?? 0 };
}

export function buildTaskTelemetry({ profile, route, workstreams, executions, workerWallMs, leaderMs, graph, scheduling }) {
  const graphNodes = graph?.nodes ?? workstreams;
  const nodes = createTaskNodes(graphNodes);
  const durationOf = (execution) => Number.isFinite(execution?.durationMs) && execution.durationMs >= 0 ? execution.durationMs : 0;
  const queueWaitOf = (execution) => Number.isFinite(execution?.queueWaitMs) && execution.queueWaitMs >= 0 ? execution.queueWaitMs : null;
  const safeWorkerWallMs = Number.isFinite(workerWallMs) && workerWallMs >= 0 ? workerWallMs : 0;
  const safeLeaderMs = Number.isFinite(leaderMs) && leaderMs >= 0 ? leaderMs : 0;
  const maximumDuration = Math.max(0, ...executions.map(durationOf));
  const workerSumMs = executions.reduce((sum, execution) => sum + durationOf(execution), 0);
  const activeSlots = new Set(executions.map((execution) => execution.slot).filter((slot) => slot !== null && slot !== undefined && slot !== "")).size;
  const capacityMs = Math.max(1, safeWorkerWallMs * Math.max(1, activeSlots));
  const executionById = new Map(executions.map((execution) => [execution.id, execution]));
  const path = criticalPath(graphNodes, executionById, durationOf);
  return {
    schema: TASK_NODE_VERSION,
    routing: {
      profile,
      actualParallelism: activeSlots,
      initialWidth: scheduling?.initialWidth ?? activeSlots,
      peakWidth: scheduling?.peakWidth ?? activeSlots,
      widthTransitions: scheduling?.widthTransitions ?? [],
      shadowAdaptiveParallelism: route?.parallelism ?? null,
      taskClass: route?.taskClass ?? "manual-batch",
      reason: route?.reason ?? "Sol supplied an explicit TASK_DAG_V1 graph.",
    },
    nodes: nodes.map((node) => {
      const execution = executionById.get(node.id);
      return {
        id: node.id,
        kind: node.kind,
        state: execution?.status === "failed" ? "blocked" : execution?.status ?? "cancelled",
        dependsOn: node.dependsOn,
        baseRef: node.baseRef,
        readLease: node.readLease,
        writeLease: node.writeLease,
        preferredAffinity: node.preferredAffinity,
        priority: node.priority,
        optional: node.optional,
        slot: execution?.slot ?? null,
        queueWaitMs: queueWaitOf(execution),
        assignmentScore: execution?.assignmentScore ?? null,
        activeWallMs: durationOf(execution),
        candidateFingerprint: execution?.run?.output?.candidateFingerprint ?? null,
        criticalPath: path.ids.has(node.id),
        criticalPathContribution: path.durationMs > 0 ? durationOf(execution) / path.durationMs : 0,
      };
    }),
    metrics: {
      workerWallMs: safeWorkerWallMs,
      workerSumMs,
      slowestNodeMs: maximumDuration,
      criticalPathMs: path.durationMs,
      nonCriticalWorkerMs: Math.max(0, workerSumMs - path.durationMs),
      slotUtilization: Math.min(1, workerSumMs / capacityMs),
      nodesCancelled: scheduling?.cancelledNodes?.length ?? 0,
      nodesBlocked: scheduling?.blockedNodes?.length ?? 0,
      leaderMs: safeLeaderMs,
      leaderShare: (safeWorkerWallMs + safeLeaderMs) > 0 ? safeLeaderMs / (safeWorkerWallMs + safeLeaderMs) : 0,
    },
    unavailable: [
      "controllerUsage",
      "finalAcceptance",
      "falseAcceptance",
      "resultUsed",
      "duplicateExplorationRatio",
      "routeRegret",
    ],
  };
}
