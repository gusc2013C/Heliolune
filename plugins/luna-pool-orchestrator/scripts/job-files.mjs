import { appendFileSync, mkdirSync, promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const JOB_HEARTBEAT_TIMEOUT_MS = 30_000;

export function jobDirectory(root = process.env.LOCALAPPDATA ?? os.tmpdir()) {
  return path.join(root, "OpenAI", "Codex", "luna-pool-orchestrator", "jobs");
}

export function validateJobId(jobId) {
  if (!JOB_ID_PATTERN.test(jobId)) throw new Error(`Invalid Heliolune job id: ${jobId}`);
  return jobId;
}

export function jobFilePath(jobId, root) {
  return path.join(jobDirectory(root), `${validateJobId(jobId)}.json`);
}

export function jobRequestFilePath(jobId, root) {
  return path.join(jobDirectory(root), `${validateJobId(jobId)}.request.json`);
}

export function jobClaimFilePath(jobId, root) {
  return path.join(jobDirectory(root), `${validateJobId(jobId)}.claim.json`);
}

export function appendRunnerDiagnostic(event, detail = {}, file = process.env.HELIOLUNE_RUNNER_DIAGNOSTIC_FILE) {
  if (!file) return;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event, ...detail })}\n`, "utf8");
  } catch { /* opt-in diagnostics must never affect task execution */ }
}

export async function writeAtomicJson(file, value, {
  fsImpl = fs,
  pid = process.pid,
  nonce = randomUUID(),
  attempts = 24,
  retryMs = 20,
} = {}) {
  const temporary = `${file}.${pid}.${nonce}.tmp`;
  try {
    await fsImpl.writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await fsImpl.rename(temporary, file);
        return;
      } catch (error) {
        lastError = error;
        const transient = ["EACCES", "EBUSY", "EPERM"].includes(error.code);
        if (!transient || attempt === attempts) throw error;
        const staggerMs = retryMs > 0 ? attempt % 7 : 0;
        await new Promise((resolve) => setTimeout(resolve, retryMs * attempt + staggerMs));
      }
    }
    throw lastError;
  } catch (error) {
    await fsImpl.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeJobRequest(jobId, request, root) {
  const file = jobRequestFilePath(jobId, root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeAtomicJson(file, request);
}

export async function readJobRequest(jobId, root) {
  const file = jobRequestFilePath(jobId, root);
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function claimJobRequest(jobId, root, {
  fsImpl = fs,
  pid = process.pid,
  now = () => Date.now(),
  startupLeaseMs = 30_000,
} = {}) {
  const requestFile = jobRequestFilePath(jobId, root);
  const claimFile = jobClaimFilePath(jobId, root);
  let request;
  try {
    request = JSON.parse(await fsImpl.readFile(requestFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const claimedAt = now();
  const temporary = `${claimFile}.${pid}.${randomUUID()}.tmp`;
  try {
    await fsImpl.writeFile(temporary, `${JSON.stringify({
      pid,
      claimedAt: new Date(claimedAt).toISOString(),
      startupDeadline: new Date(claimedAt + startupLeaseMs).toISOString(),
    })}\n`, "utf8");
    await fsImpl.link(temporary, claimFile);
  } catch (error) {
    await fsImpl.rm(temporary, { force: true }).catch(() => {});
    if (error.code === "EEXIST") return null;
    throw error;
  }
  await fsImpl.rm(temporary, { force: true }).catch(() => {});
  try {
    await fsImpl.rm(requestFile, { force: true });
    return { request, claimFile };
  } catch (error) {
    await fsImpl.rm(claimFile, { force: true }).catch(() => {});
    throw error;
  }
}

export async function readJobClaim(jobId, root) {
  try {
    const text = await fs.readFile(jobClaimFilePath(jobId, root), "utf8");
    try { return JSON.parse(text); }
    catch (error) {
      if (error instanceof SyntaxError) return { invalid: true };
      throw error;
    }
  }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function removePathWithRetry(file, { fsImpl = fs, attempts = 4, retryMs = 25 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fsImpl.rm(file, { force: true });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryMs * attempt));
    }
  }
  throw lastError;
}

export async function removeJobRequest(jobId, root, { fsImpl = fs, attempts = 4, retryMs = 25 } = {}) {
  await removePathWithRetry(jobRequestFilePath(jobId, root), { fsImpl, attempts, retryMs });
}

export async function removeJobClaim(jobId, root, options) {
  await removePathWithRetry(jobClaimFilePath(jobId, root), options);
}

export async function removeJobClaims(jobId, root, { fsImpl = fs } = {}) {
  await removeJobClaim(jobId, root, { fsImpl });
}

export async function writeJobRecord(jobId, record, root) {
  const file = jobFilePath(jobId, root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeAtomicJson(file, record);
}

export async function readJobRecord(jobId, root) {
  const file = jobFilePath(jobId, root);
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function processIsAlive(pid, signal = process.kill) {
  const numericPid = Number(pid);
  if (!Number.isSafeInteger(numericPid) || numericPid <= 0) return false;
  try {
    signal(numericPid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function jobHeartbeatIsStale(record, {
  now = () => Date.now(),
  heartbeatTimeoutMs = JOB_HEARTBEAT_TIMEOUT_MS,
} = {}) {
  const timestamp = Date.parse(
    record?.heartbeatAt
      ?? record?.snapshot?.updatedAt
      ?? record?.ownerStartedAt
      ?? record?.startedAt
      ?? "",
  );
  return !Number.isFinite(timestamp) || now() - timestamp >= heartbeatTimeoutMs;
}

export async function waitForProcessExit(pid, {
  timeoutMs = 20_000,
  pollMs = 100,
  isAlive = processIsAlive,
} = {}) {
  const numericPid = Number(pid);
  if (!Number.isSafeInteger(numericPid) || numericPid <= 0) {
    throw new Error(`Cannot verify Heliolune process cleanup for invalid PID: ${pid}`);
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(numericPid)) return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Heliolune process ${numericPid} did not exit within ${timeoutMs}ms of terminal status.`);
}

export async function failOrphanedRecord(jobId, record, root, message, {
  now = () => Date.now(),
  isAlive = processIsAlive,
  heartbeatTimeoutMs = JOB_HEARTBEAT_TIMEOUT_MS,
} = {}) {
  const latest = await readJobRecord(jobId, root);
  if (latest?.status === "completed") return { terminal: true, result: latest.result };
  if (latest?.status === "failed") throw new Error(latest.error ?? message);
  if (record?.status === "starting" && latest?.status === "running") return { terminal: false, advanced: true };
  if (record?.status === "running" && latest?.status === "running"
      && latest.ownerPid && isAlive(latest.ownerPid)
      && !jobHeartbeatIsStale(latest, { now, heartbeatTimeoutMs })) {
    return { terminal: false, recovered: true };
  }
  if (record?.status === "starting") {
    const claim = await readJobClaim(jobId, root);
    if (claim?.pid && isAlive(claim.pid) && now() < new Date(claim.startupDeadline).getTime()) {
      return { terminal: false, claimed: true };
    }
  }
  const completedAt = new Date(now()).toISOString();
  const failed = {
    ...latest,
    status: "failed",
    completedAt,
    error: message,
    snapshot: latest?.snapshot ? {
      ...latest.snapshot,
      status: "failed",
      progress: 100,
      message,
      updatedAt: completedAt,
      error: message,
      workers: latest.snapshot.workers?.map((worker) => ["idle", "completed", "failed"].includes(worker.status)
        ? worker
        : { ...worker, status: "failed", progress: 100, explanation: message, updatedAt: completedAt }) ?? [],
    } : latest?.snapshot,
  };
  await writeJobRecord(jobId, failed, root);
  await removeJobRequest(jobId, root);
  await removeJobClaims(jobId, root);
  throw new Error(message);
}

export async function waitForJobRecord(jobId, {
  root,
  timeoutMs = null,
  pollMs = 500,
  isAlive = processIsAlive,
  now = () => Date.now(),
  heartbeatTimeoutMs = JOB_HEARTBEAT_TIMEOUT_MS,
} = {}) {
  validateJobId(jobId);
  const deadline = Number.isFinite(timeoutMs) && timeoutMs > 0 ? now() + timeoutMs : null;
  while (deadline === null || now() < deadline) {
    const record = await readJobRecord(jobId, root);
    if (record?.status === "completed") return record.result;
    if (record?.status === "failed") throw new Error(record.error ?? "Heliolune job failed");
    if (record?.status === "starting" && record.startupDeadline && now() >= new Date(record.startupDeadline).getTime()) {
      const message = `Detached Heliolune job runner did not claim job ${jobId} before its startup lease expired.`;
      const terminal = await failOrphanedRecord(jobId, record, root, message, { now, isAlive, heartbeatTimeoutMs });
      if (terminal?.terminal) return terminal.result;
    }
    if (record?.status === "running" && (!record.ownerPid || !isAlive(record.ownerPid))) {
      const owner = record.ownerPid ? `process ${record.ownerPid} exited` : "ownership metadata is missing";
      const message = `Heliolune orchestrator ${owner} before job ${jobId} reached a terminal result. Restart Codex and retry the bounded task.`;
      const terminal = await failOrphanedRecord(jobId, record, root, message, { now, isAlive, heartbeatTimeoutMs });
      if (terminal?.terminal) return terminal.result;
    }
    if (record?.status === "running" && jobHeartbeatIsStale(record, { now, heartbeatTimeoutMs })) {
      const message = `Heliolune orchestrator heartbeat expired before job ${jobId} reached a terminal result. The detached owner is no longer making observable progress; restart Codex and retry the bounded task.`;
      const terminal = await failOrphanedRecord(jobId, record, root, message, { now, isAlive, heartbeatTimeoutMs });
      if (terminal?.terminal) return terminal.result;
    }
    const waitMs = deadline === null ? pollMs : Math.min(pollMs, Math.max(1, deadline - now()));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error(`Timed out awaiting Heliolune job ${jobId}`);
}
