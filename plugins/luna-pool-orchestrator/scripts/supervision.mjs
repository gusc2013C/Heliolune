function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function supervisionSchedule(options = {}) {
  const checkpointSeconds = Math.min(90, boundedInteger(options.checkpointSeconds, 90, 30, 90));
  const repeatSeconds = boundedInteger(options.repeatSeconds, 30, 15, 90);
  const staleSeconds = boundedInteger(options.staleAfterSeconds, 45, 15, 300);
  const supervisorTimeoutSeconds = boundedInteger(options.supervisorTimeoutSeconds, 30, 15, 60);
  return {
    enabled: options.supervision !== "off",
    renewable: true,
    checkpointMs: checkpointSeconds * 1000,
    repeatMs: repeatSeconds * 1000,
    staleMs: staleSeconds * 1000,
    supervisorTimeoutMs: supervisorTimeoutSeconds * 1000,
    sizingTargetMs: 90_000,
    ...(options.supervision === "off" ? { reason: "leader_disabled" } : {}),
  };
}

export function shouldConsultSupervisor(snapshot, schedule, mode = "auto") {
  if (!schedule.enabled) return false;
  if (mode === "always") return true;
  return !snapshot || snapshot.silentMs >= schedule.staleMs;
}

export function classifyTurnFailure(error, schedule) {
  if (error?.code === "SUPERVISOR_INTERRUPTED") return "supervisor_interrupted";
  if (error?.code !== "TURN_HARD_TIMEOUT") return "turn_error";
  const silentMs = Number(error.activity?.silentMs);
  if (Number.isFinite(silentMs) && silentMs < schedule.staleMs) return "legacy_timeout_active";
  return "legacy_timeout_stalled";
}

export function compactSupervisorPrompt({ lane, mode, objective, snapshot, schedule }) {
  return [
    `SUPERVISE_DELTA ${JSON.stringify({
      workerLane: lane,
      workerMode: mode,
      objective,
      elapsedMs: snapshot.elapsedMs,
      silentMs: snapshot.silentMs,
      eventCount: snapshot.eventCount,
      lastEvent: snapshot.lastMethod,
      usage: snapshot.usage,
      staleAfterMs: schedule.staleMs,
    })}`,
    "Decide only the worker's liveness. There is no execution deadline: recommend continue while activity indicates bounded work, and interrupt only with high confidence after sustained silence indicates a stall. Do not decide architecture, security, public API, migrations, implementation correctness, or acceptance. Prefer continue when evidence is ambiguous. Return the schema only.",
  ].join("\n");
}
