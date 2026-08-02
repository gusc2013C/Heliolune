function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function supervisionSchedule(options = {}) {
  const hardSeconds = boundedInteger(options.timeoutSeconds, 900, 30, 3600);
  if (options.supervision === "off" || hardSeconds < 90) {
    return { enabled: false, hardMs: hardSeconds * 1000, reason: options.supervision === "off" ? "disabled" : "hard_timeout_below_90s" };
  }
  const latestSafeSoft = hardSeconds - 40;
  const defaultSoft = Math.floor(hardSeconds * 2 / 3);
  const softSeconds = boundedInteger(options.softTimeoutSeconds, defaultSoft, 30, latestSafeSoft);
  const staleSeconds = boundedInteger(options.staleAfterSeconds, 45, 15, Math.max(15, softSeconds));
  const supervisorTimeoutSeconds = Math.max(20, Math.min(60, hardSeconds - softSeconds - 10));
  return {
    enabled: true,
    hardMs: hardSeconds * 1000,
    softMs: softSeconds * 1000,
    staleMs: staleSeconds * 1000,
    supervisorTimeoutMs: supervisorTimeoutSeconds * 1000,
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
  if (Number.isFinite(silentMs) && silentMs < schedule.staleMs) return "hard_timeout_active";
  return "hard_timeout_stalled";
}

export function compactSupervisorPrompt({ lane, mode, objective, snapshot, schedule }) {
  const remainingMs = Math.max(0, schedule.hardMs - snapshot.elapsedMs);
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
      remainingMs,
    })}`,
    "Decide only the worker's liveness: whether it appears live enough to continue until the existing hard deadline or should be interrupted as stalled. Do not decide architecture, security, public API, migrations, implementation correctness, or acceptance. Prefer continue when evidence is ambiguous. Return the schema only.",
  ].join("\n");
}
