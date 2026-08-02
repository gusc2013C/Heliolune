export function compactSchemaRecoveryPrompt({ mode, objective, acceptance, scope, activity }) {
  return [
    `SCHEMA_RECOVERY_DELTA ${JSON.stringify({
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
    "The prior work turn completed but returned invalid structured output. Use only information already present in this thread and repository changes already made. Do not inspect files, run commands, call tools, or continue implementation. Return the required JSON schema now. Prefer status=partial with explicit missing checks over further exploration. Keep evidence and summaries terse; never invent evidence.",
  ].join("\n");
}
