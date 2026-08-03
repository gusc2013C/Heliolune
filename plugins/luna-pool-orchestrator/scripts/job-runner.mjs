import { createJobAwareShutdown, createProcessKeepAlive, JobStore } from "./jobs.mjs";
import path from "node:path";
import { appendRunnerDiagnostic, claimJobRequest, readJobRecord, removeJobClaim, removeJobRequest, validateJobId, writeJobRecord } from "./job-files.mjs";

const jobId = validateJobId(process.argv[2] ?? "");
const releaseKeepAlive = createProcessKeepAlive();
appendRunnerDiagnostic("runner-start", { jobId, ppid: process.ppid, node: process.version });
if (process.env.HELIOLUNE_RUNNER_DIAGNOSTIC_FILE && process.report) {
  process.report.directory = path.dirname(process.env.HELIOLUNE_RUNNER_DIAGNOSTIC_FILE);
  process.report.filename = `${jobId}.node-report.json`;
  process.report.reportOnFatalError = true;
  process.report.reportOnUncaughtException = true;
}
process.on("uncaughtExceptionMonitor", (error, origin) => appendRunnerDiagnostic("uncaught-exception", { jobId, origin, error: error.stack ?? error.message }));
process.on("warning", (warning) => appendRunnerDiagnostic("process-warning", { jobId, warning: warning.stack ?? warning.message }));
process.on("beforeExit", (code) => appendRunnerDiagnostic("before-exit", { jobId, code }));
process.on("exit", (code) => appendRunnerDiagnostic("process-exit", { jobId, code }));

const store = new JobStore({ idFactory: () => jobId });
const requestShutdown = createJobAwareShutdown({
  store,
  log: (message) => process.stderr.write(`[heliolune-runner] ${message}\n`),
});
process.on("SIGINT", () => { appendRunnerDiagnostic("signal", { jobId, signal: "SIGINT" }); void requestShutdown("SIGINT"); });
process.on("SIGTERM", () => { appendRunnerDiagnostic("signal", { jobId, signal: "SIGTERM" }); void requestShutdown("SIGTERM"); });

async function writeRunnerFailure(error) {
  const existing = await readJobRecord(jobId);
  if (existing?.status === "completed" || existing?.status === "failed") return;
  const completedAt = new Date().toISOString();
  const message = `Detached Heliolune runner failed: ${error.message}`;
  await writeJobRecord(jobId, {
    ...existing,
    status: "failed",
    completedAt,
    ownerPid: process.pid,
    error: message,
    snapshot: {
      ...(existing?.snapshot ?? {}),
      jobId,
      status: "failed",
      progress: 100,
      message,
      updatedAt: completedAt,
      error: message,
      workers: existing?.snapshot?.workers ?? [],
    },
  });
}

let ownsClaim = false;
let closeOwnedClient = async () => {};
try {
  const claimed = await claimJobRequest(jobId);
  appendRunnerDiagnostic("request-claim", { jobId, claimed: Boolean(claimed) });
  if (!claimed) {
    process.stderr.write(`[heliolune-runner] request ${jobId} is already owned; duplicate runner exiting.\n`);
  } else {
    ownsClaim = true;
    const request = claimed.request;
    const { BUILD_ID, VERSION, closeClient, startOwnedBatch, startOwnedTask } = await import("./server.mjs");
    closeOwnedClient = closeClient;
    appendRunnerDiagnostic("server-imported", { jobId });
    if (request.version !== VERSION || request.buildId !== BUILD_ID) {
      throw new Error(`Detached request runtime mismatch: expected ${VERSION}/${BUILD_ID}, received ${request.version ?? "missing"}/${request.buildId ?? "missing"}.`);
    }
    const existing = await readJobRecord(jobId);
    if (existing?.status === "failed") throw new Error(`Runner startup was cancelled before ownership transfer: ${existing.error}`);
    if (request.kind === "task") await startOwnedTask(request.args, { store });
    else if (request.kind === "batch") await startOwnedBatch(request.args, { store });
    else throw new Error(`Unknown Heliolune runner request kind: ${request.kind}`);
    appendRunnerDiagnostic("owned-job-started", { jobId, kind: request.kind });
    await store.wait(jobId);
    appendRunnerDiagnostic("owned-job-terminal", { jobId });
  }
} catch (error) {
  appendRunnerDiagnostic("runner-catch", { jobId, error: error.stack ?? error.message });
  const secondary = [];
  try { await writeRunnerFailure(error); }
  catch (persistenceError) { secondary.push(`terminal persistence failed: ${persistenceError.message}`); }
  try { await removeJobRequest(jobId); }
  catch (cleanupError) { secondary.push(`request cleanup failed: ${cleanupError.message}`); }
  try { await removeJobClaim(jobId); }
  catch (cleanupError) { secondary.push(`claim cleanup failed: ${cleanupError.message}`); }
  process.stderr.write(`[heliolune-runner] ${error.stack ?? error.message}${secondary.length ? `\n${secondary.join("\n")}` : ""}\n`);
  process.exitCode = 1;
} finally {
  try {
    appendRunnerDiagnostic("client-close-start", { jobId });
    await closeOwnedClient().catch((error) => {
      appendRunnerDiagnostic("client-close-error", { jobId, error: error.stack ?? error.message });
      process.stderr.write(`[heliolune-runner] app-server cleanup failed: ${error.message}\n`);
    });
    appendRunnerDiagnostic("client-close-complete", { jobId });
    if (ownsClaim) await removeJobClaim(jobId).catch((error) => {
      process.stderr.write(`[heliolune-runner] final claim cleanup failed: ${error.message}\n`);
    });
  }
  finally {
    appendRunnerDiagnostic("keepalive-release", { jobId });
    releaseKeepAlive();
  }
}
