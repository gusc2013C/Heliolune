function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function finalizationSchedule(options = {}) {
  const hardSeconds = boundedInteger(options.timeoutSeconds, 600, 30, 600);
  if (options.finalization === "off" || hardSeconds < 60) {
    return {
      enabled: false,
      hardMs: hardSeconds * 1000,
      workMs: hardSeconds * 1000,
      reserveMs: 0,
      reason: options.finalization === "off" ? "disabled" : "hard_timeout_below_60s",
    };
  }
  const defaultReserve = Math.max(40, Math.min(60, Math.ceil(hardSeconds * 0.25)));
  const reserveSeconds = boundedInteger(options.synthesisReserveSeconds, defaultReserve, 20, Math.min(300, hardSeconds - 30));
  return {
    enabled: true,
    hardMs: hardSeconds * 1000,
    workMs: (hardSeconds - reserveSeconds) * 1000,
    reserveMs: reserveSeconds * 1000,
    steerGraceMs: Math.min(20_000, Math.max(10_000, Math.floor(reserveSeconds * 1000 / 3))),
  };
}

export function shouldAttemptSynthesis(error, schedule, staleMs) {
  if (!schedule.enabled) return false;
  return error?.code === "INVALID_STRUCTURED_OUTPUT"
    || error?.code === "FINALIZATION_INTERRUPTED"
    || (error?.code === "TURN_HARD_TIMEOUT" && error?.missingCompletion === true);
}

export function activityAwareGraceMs({ timeoutSeconds = 120, snapshot, minimumMs = 10_000, maximumMs = 45_000, maximumTotalSeconds = 600 } = {}) {
  const workMs = boundedInteger(timeoutSeconds, 120, 30, 600) * 1000;
  const absoluteCapMs = boundedInteger(maximumTotalSeconds, 600, 30, 600) * 1000;
  const availableMs = Math.max(0, absoluteCapMs - workMs);
  const active = Number(snapshot?.eventCount) > 0 && Number(snapshot?.silentMs ?? Infinity) < 45_000;
  if (!active || availableMs < minimumMs) return 0;
  const proportionalMs = Math.round(workMs * 0.1);
  return Math.min(availableMs, maximumMs, Math.max(minimumMs, proportionalMs));
}

export function compactSteerPrompt({ objective, acceptance }) {
  return [
    `FINALIZE_NOW ${JSON.stringify({ objective, acceptance })}`,
    "Stop repository exploration and tool use now. Finish this same turn by returning the required JSON schema from evidence and changes already gathered. A check that ran before the last edit is not final verification: report it honestly as stale and use status=partial. Keep evidence and summaries terse; never invent evidence.",
  ].join("\n");
}

export function compactSynthesisPrompt({ mode, objective, acceptance, scope, activity }) {
  return [
    `SYNTHESIZE_DELTA ${JSON.stringify({
      mode,
      objective,
      acceptance,
      scope,
      priorActivity: activity ? {
        elapsedMs: activity.elapsedMs,
        eventCount: activity.eventCount,
        lastEvent: activity.lastMethod,
      } : undefined,
    })}`,
    "The prior work turn was stopped to reserve time for its final result. Use only information already present in this thread and repository changes already made. Do not inspect files, run commands, call tools, or continue implementation. Return the required JSON schema now. Prefer status=partial with explicit missing checks over further exploration. Keep evidence and summaries terse; never invent evidence.",
  ].join("\n");
}
