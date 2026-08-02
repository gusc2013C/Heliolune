export function contractGuardEscalations(workstreamId, output) {
  if (workstreamId !== "contract" || output?.status !== "blocked" || !Array.isArray(output?.needsSol)) return [];
  return output.needsSol
    .filter((item) => item?.decision && item?.reason)
    .slice(0, 2)
    .map((item) => ({ decision: String(item.decision), reason: String(item.reason) }));
}

export function withRecoveryMetadata(integration, patchRecords = []) {
  if (integration?.applied) return integration;
  const candidates = patchRecords
    .filter((record) => record.patchBytes > 0 && record.changedPaths?.length > 0)
    .map((record) => ({
      id: record.id,
      patchPath: record.patchPath,
      changedPaths: record.changedPaths,
      outOfScope: record.outOfScope ?? [],
    }));
  return {
    ...integration,
    recoverable: {
      available: candidates.some((candidate) => candidate.outOfScope.length === 0),
      safeToApply: false,
      requiresSol: true,
      reason: candidates.length
        ? "A non-empty patch was quarantined because its writer was not safely completed or a contract escalation blocked integration."
        : "No non-empty patch artifact is available.",
      candidates,
    },
  };
}
