export const TASK_NODE_VERSION = "TASK_NODE_V1";

function nodeKind(workstream) {
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
    dependsOn: [],
    risk: workstream.risk ?? "moderate",
    state: "ready",
  }));
}

export function buildTaskTelemetry({ profile, route, workstreams, executions, workerWallMs, leaderMs }) {
  const nodes = createTaskNodes(workstreams);
  const durationOf = (execution) => Number.isFinite(execution?.durationMs) && execution.durationMs >= 0 ? execution.durationMs : 0;
  const queueWaitOf = (execution) => Number.isFinite(execution?.queueWaitMs) && execution.queueWaitMs >= 0 ? execution.queueWaitMs : null;
  const safeWorkerWallMs = Number.isFinite(workerWallMs) && workerWallMs >= 0 ? workerWallMs : 0;
  const safeLeaderMs = Number.isFinite(leaderMs) && leaderMs >= 0 ? leaderMs : 0;
  const maximumDuration = Math.max(0, ...executions.map(durationOf));
  const workerSumMs = executions.reduce((sum, execution) => sum + durationOf(execution), 0);
  const activeSlots = new Set(executions.map((execution) => execution.slot).filter((slot) => slot !== null && slot !== undefined && slot !== "")).size;
  const capacityMs = Math.max(1, safeWorkerWallMs * Math.max(1, activeSlots));
  const executionById = new Map(executions.map((execution) => [execution.id, execution]));
  return {
    schema: TASK_NODE_VERSION,
    routing: {
      profile,
      actualParallelism: activeSlots,
      shadowAdaptiveParallelism: route?.parallelism ?? null,
      taskClass: route?.taskClass ?? "manual-batch",
      reason: route?.reason ?? "Sol supplied an explicit independent batch.",
    },
    nodes: nodes.map((node) => {
      const execution = executionById.get(node.id);
      return {
        id: node.id,
        kind: node.kind,
        state: execution?.status === "failed" ? "blocked" : execution?.status ?? "cancelled",
        slot: execution?.slot ?? null,
        queueWaitMs: queueWaitOf(execution),
        activeWallMs: durationOf(execution),
        criticalPath: Boolean(execution && durationOf(execution) === maximumDuration),
      };
    }),
    metrics: {
      workerWallMs: safeWorkerWallMs,
      workerSumMs,
      criticalPathMs: maximumDuration,
      nonCriticalWorkerMs: Math.max(0, workerSumMs - maximumDuration),
      slotUtilization: Math.min(1, workerSumMs / capacityMs),
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
