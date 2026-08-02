function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function finalizationSchedule(options = {}) {
  const hardSeconds = boundedInteger(options.timeoutSeconds, 900, 30, 3600);
  if (options.finalization === "off" || hardSeconds < 60) {
    return {
      enabled: false,
      hardMs: hardSeconds * 1000,
      workMs: hardSeconds * 1000,
      reserveMs: 0,
      reason: options.finalization === "off" ? "disabled" : "hard_timeout_below_60s",
    };
  }
  const defaultReserve = Math.max(40, Math.min(90, Math.ceil(hardSeconds * 0.5)));
  const reserveSeconds = boundedInteger(options.synthesisReserveSeconds, defaultReserve, 20, Math.min(300, hardSeconds - 30));
  return {
    enabled: true,
    hardMs: hardSeconds * 1000,
    workMs: (hardSeconds - reserveSeconds) * 1000,
    reserveMs: reserveSeconds * 1000,
  };
}

export function shouldAttemptSynthesis(error, schedule, staleMs) {
  if (!schedule.enabled) return false;
  return error?.code === "INVALID_STRUCTURED_OUTPUT" || error?.code === "FINALIZATION_INTERRUPTED";
}

export function compactSteerPrompt({ objective, acceptance }) {
  return [
    `FINALIZE_NOW ${JSON.stringify({ objective, acceptance })}`,
    "Stop repository exploration and tool use now. Finish this same turn by returning the required JSON schema from evidence and changes already gathered. Prefer status=partial with explicit missing checks over more work. Keep evidence and summaries terse; never invent evidence.",
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
