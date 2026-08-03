export const TASK_DAG_VERSION = "TASK_DAG_V1";

const TERMINAL = new Set(["completed", "partial", "blocked", "cancelled", "failed"]);
const NODE_KINDS = new Set(["inspect", "plan", "implement", "test", "challenge", "repair", "integrate", "summarize"]);

function cleanPath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function comparable(value) {
  const normalized = cleanPath(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathsOverlap(left, right) {
  const a = comparable(left);
  const b = comparable(right);
  return Boolean(a && b && (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

function inferredKind(workstream) {
  if (workstream.kind) return workstream.kind;
  if (workstream.id === "edges" || workstream.id === "verify") return "challenge";
  if (workstream.mode === "implement") return "implement";
  if (workstream.mode === "repair") return "repair";
  return "inspect";
}

function normalizedLease(values) {
  return [...new Set((values ?? []).map(cleanPath).filter(Boolean))];
}

function reaches(from, target, byId, seen = new Set()) {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (byId.get(from)?.dependsOn ?? []).some((dependency) => reaches(dependency, target, byId, seen));
}

function criticalDepth(id, dependents, memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  const children = dependents.get(id) ?? [];
  const depth = children.length ? 1 + Math.max(...children.map((child) => criticalDepth(child, dependents, memo))) : 1;
  memo.set(id, depth);
  return depth;
}

function assertAcyclic(nodes, byId) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`TASK_DAG_V1 contains a dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of nodes) visit(node.id);
}

function conflictingLease(left, right) {
  return left.writeLease.some((lease) => right.writeLease.some((other) => pathsOverlap(lease, other))
    || right.readLease.some((other) => pathsOverlap(lease, other)))
    || right.writeLease.some((lease) => left.readLease.some((other) => pathsOverlap(lease, other)));
}

export function normalizeTaskDag(workstreams, {
  profile = "adaptive",
  maxParallelism = 4,
  completionQuorum,
  baseRef = null,
} = {}) {
  if (!Array.isArray(workstreams) || workstreams.length === 0) throw new Error("TASK_DAG_V1 requires at least one node");
  const nodes = workstreams.map((workstream, index) => {
    const kind = inferredKind(workstream);
    if (!NODE_KINDS.has(kind)) throw new Error(`Unsupported TASK_DAG_V1 node kind: ${kind}`);
    const mode = workstream.mode ?? "analyze";
    const dependsOn = [...new Set((workstream.dependsOn ?? []).map(String))];
    const scope = normalizedLease(workstream.scope);
    const readLease = normalizedLease(workstream.readLease ?? (mode === "analyze" ? scope : []));
    const writeLease = normalizedLease(workstream.writeLease ?? (mode === "analyze" ? [] : scope));
    return {
      ...workstream,
      schema: "TASK_NODE_V1",
      index,
      kind,
      mode,
      scope,
      dependsOn,
      readLease,
      writeLease,
      baseRef: workstream.baseRef ?? baseRef,
      candidateFrom: workstream.candidateFrom ?? null,
      preferredAffinity: String(workstream.preferredAffinity ?? scope[0] ?? workstream.lane ?? "general"),
      priority: Math.min(100, Math.max(0, Number.isFinite(Number(workstream.priority)) ? Math.trunc(Number(workstream.priority)) : 50)),
      optional: Boolean(workstream.optional),
      state: dependsOn.length ? "pending" : "ready",
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("TASK_DAG_V1 node ids must be unique");
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`TASK_DAG_V1 node ${node.id} depends on missing node ${dependency}`);
      if (dependency === node.id) throw new Error(`TASK_DAG_V1 node ${node.id} cannot depend on itself`);
    }
    if (node.candidateFrom) {
      const producer = byId.get(node.candidateFrom);
      if (!producer || !node.dependsOn.includes(node.candidateFrom)) throw new Error(`Challenge ${node.id} must depend on candidateFrom ${node.candidateFrom}`);
      if (node.mode !== "analyze" || producer.mode === "analyze") throw new Error(`Challenge ${node.id} requires one mutating candidate producer`);
      if (maxParallelism < 2) throw new Error("Post-patch challenge requires at least two worker slots for thread independence");
    }
  }
  assertAcyclic(nodes, byId);
  for (const node of nodes.filter((candidate) => candidate.mode !== "analyze")) {
    const mutatingAncestor = nodes.find((candidate) => candidate.mode !== "analyze" && candidate.id !== node.id && reaches(node.id, candidate.id, byId));
    if (mutatingAncestor) throw new Error(`TASK_DAG_V1 alpha.2 rejects chained writers: ${node.id} depends on ${mutatingAncestor.id}`);
  }
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left];
      const b = nodes[right];
      if (conflictingLease(a, b) && !reaches(a.id, b.id, byId) && !reaches(b.id, a.id, byId)) {
        throw new Error(`TASK_DAG_V1 unordered lease conflict: ${a.id} and ${b.id}`);
      }
    }
  }
  const dependents = new Map(nodes.map((node) => [node.id, []]));
  for (const node of nodes) for (const dependency of node.dependsOn) dependents.get(dependency).push(node.id);
  const depthMemo = new Map();
  for (const node of nodes) node.criticalDepth = criticalDepth(node.id, dependents, depthMemo);
  const requiredCount = nodes.filter((node) => !node.optional).length;
  const quorum = completionQuorum == null ? requiredCount : Math.trunc(Number(completionQuorum));
  if (!Number.isInteger(quorum) || quorum < requiredCount || quorum > nodes.length) {
    throw new Error(`completionQuorum must be between required node count ${requiredCount} and ${nodes.length}`);
  }
  return {
    schema: TASK_DAG_VERSION,
    profile,
    maxParallelism,
    completionQuorum: quorum,
    nodes,
  };
}

function affinityScore(node, slot, slotContext, assignmentByNode) {
  let score = node.priority * 100 + node.criticalDepth * 25 - node.index;
  const context = slotContext.get(slot);
  if (context?.affinity === node.preferredAffinity) score += 500;
  if (context?.scope?.some((left) => node.scope.some((right) => pathsOverlap(left, right)))) score += 250;
  const producerSlot = node.candidateFrom ? assignmentByNode.get(node.candidateFrom) : null;
  if (producerSlot && producerSlot === slot) score -= 100_000;
  return score;
}

function refreshStates(nodes, stateById) {
  let changed = false;
  for (const node of nodes) {
    if (stateById.get(node.id) !== "pending") continue;
    const dependencies = node.dependsOn.map((id) => stateById.get(id));
    if (dependencies.some((state) => TERMINAL.has(state) && state !== "completed")) {
      stateById.set(node.id, "blocked");
      changed = true;
    } else if (dependencies.every((state) => state === "completed")) {
      stateById.set(node.id, "ready");
      changed = true;
    }
  }
  return changed;
}

export async function runTaskDag({ graph, slots, runNode, profile = graph.profile, now = () => Date.now(), onState }) {
  const startedAt = now();
  const slotList = slots.slice(0, graph.maxParallelism);
  if (!slotList.length) throw new Error("TASK_DAG_V1 requires at least one worker slot");
  if (slotList.length < 2 && graph.nodes.some((node) => node.candidateFrom)) {
    throw new Error("Post-patch challenge requires two available worker slots for thread independence");
  }
  const stateById = new Map(graph.nodes.map((node) => [node.id, node.state]));
  const enqueuedAt = new Map(graph.nodes.map((node) => [node.id, startedAt]));
  const active = new Map();
  const slotContext = new Map();
  const assignmentByNode = new Map();
  const executions = new Map();
  const widthTransitions = [];
  let activeLimit = profile === "adaptive" ? 1 : slotList.length;

  const emit = (event) => onState?.({ ...event, activeLimit, states: Object.fromEntries(stateById) });
  const widen = (readyNodes) => {
    if (profile !== "adaptive") return;
    const runnableCapacity = active.size + readyNodes.length;
    const needsIndependentChallengeSlot = readyNodes.some((node) => {
      const producerSlot = node.candidateFrom ? assignmentByNode.get(node.candidateFrom) : null;
      return producerSlot && slotList.indexOf(producerSlot) < activeLimit;
    });
    const targets = [];
    if (activeLimit === 1 && slotList.length >= 2 && (runnableCapacity >= 2 || needsIndependentChallengeSlot)) targets.push(2);
    if ((activeLimit === 2 || targets.at(-1) === 2) && runnableCapacity >= 4 && slotList.length >= 4) targets.push(4);
    for (const requested of targets) {
      const target = Math.min(requested, slotList.length);
      if (target === activeLimit) continue;
      widthTransitions.push({
        atMs: now() - startedAt,
        from: activeLimit,
        to: target,
        reason: needsIndependentChallengeSlot ? "candidate-thread-isolation" : "independent-ready-backlog",
      });
      activeLimit = target;
      emit({ type: "width", to: target });
    }
  };

  while ([...stateById.values()].some((state) => !TERMINAL.has(state))) {
    refreshStates(graph.nodes, stateById);
    const completedCount = [...stateById.values()].filter((state) => state === "completed").length;
    const requiredComplete = graph.nodes.filter((node) => !node.optional).every((node) => stateById.get(node.id) === "completed");
    if (requiredComplete && completedCount >= graph.completionQuorum) {
      for (const node of graph.nodes.filter((candidate) => candidate.optional)) {
        if (["pending", "ready"].includes(stateById.get(node.id))) stateById.set(node.id, "cancelled");
      }
    }
    let ready = graph.nodes.filter((node) => stateById.get(node.id) === "ready");
    widen(ready);
    const availableSlots = slotList.slice(0, activeLimit).filter((slot) => !active.has(slot));
    for (const slot of availableSlots) {
      ready = graph.nodes.filter((node) => stateById.get(node.id) === "ready");
      if (!ready.length) break;
      const eligible = ready.filter((node) => !node.candidateFrom || assignmentByNode.get(node.candidateFrom) !== slot);
      if (!eligible.length) continue;
      const ranked = eligible.map((node) => ({ node, score: affinityScore(node, slot, slotContext, assignmentByNode) }))
        .sort((left, right) => right.score - left.score || left.node.index - right.node.index);
      const { node, score } = ranked[0];
      stateById.set(node.id, "running");
      assignmentByNode.set(node.id, slot);
      const queueWaitMs = Math.max(0, now() - enqueuedAt.get(node.id));
      emit({ type: "start", nodeId: node.id, slot, score, queueWaitMs });
      const promise = Promise.resolve()
        .then(() => runNode(node, slot, { queueWaitMs, dependencyExecutions: node.dependsOn.map((id) => executions.get(id)).filter(Boolean) }))
        .then((execution) => ({ slot, node, execution: { ...execution, id: node.id, slot, queueWaitMs, assignmentScore: score } }))
        .catch((error) => ({ slot, node, execution: { id: node.id, slot, queueWaitMs, assignmentScore: score, status: "failed", error: error.message, durationMs: 0 } }));
      active.set(slot, promise);
    }
    if (!active.size) {
      refreshStates(graph.nodes, stateById);
      const stranded = graph.nodes.filter((node) => !TERMINAL.has(stateById.get(node.id)));
      if (stranded.length) {
        for (const node of stranded) stateById.set(node.id, "blocked");
      }
      break;
    }
    const settled = await Promise.race(active.values());
    active.delete(settled.slot);
    const resultState = settled.execution.status === "completed" ? "completed"
      : settled.execution.status === "partial" ? "partial"
        : settled.execution.status === "cancelled" ? "cancelled"
          : settled.execution.status === "blocked" ? "blocked" : "failed";
    stateById.set(settled.node.id, resultState);
    executions.set(settled.node.id, settled.execution);
    slotContext.set(settled.slot, { affinity: settled.node.preferredAffinity, scope: settled.node.scope });
    emit({ type: "finish", nodeId: settled.node.id, slot: settled.slot, state: resultState });
  }

  for (const node of graph.nodes) {
    if (executions.has(node.id)) continue;
    const state = stateById.get(node.id);
    executions.set(node.id, {
      id: node.id,
      slot: null,
      status: state,
      queueWaitMs: Math.max(0, now() - enqueuedAt.get(node.id)),
      durationMs: 0,
      error: state === "blocked" ? "Dependency did not complete successfully" : undefined,
    });
  }
  return {
    executions: graph.nodes.map((node) => executions.get(node.id)),
    scheduling: {
      schema: TASK_DAG_VERSION,
      profile,
      initialWidth: profile === "adaptive" ? 1 : slotList.length,
      peakWidth: Math.max(profile === "adaptive" ? 1 : slotList.length, ...widthTransitions.map((transition) => transition.to)),
      widthTransitions,
      completionQuorum: graph.completionQuorum,
      cancelledNodes: graph.nodes.filter((node) => stateById.get(node.id) === "cancelled").map((node) => node.id),
      blockedNodes: graph.nodes.filter((node) => stateById.get(node.id) === "blocked").map((node) => node.id),
      assignmentByNode: Object.fromEntries(assignmentByNode),
    },
  };
}
