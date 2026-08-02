import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function writeJobRecord(jobId, record, root) {
  const file = jobFilePath(jobId, root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(record)}\n`, "utf8");
  await fs.rename(temporary, file).catch(async (error) => {
    await fs.rm(temporary, { force: true });
    throw error;
  });
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

async function failOrphanedRecord(jobId, record, root, message) {
  const latest = await readJobRecord(jobId, root);
  if (latest?.status === "completed") return { terminal: true, result: latest.result };
  if (latest?.status === "failed") throw new Error(latest.error ?? message);
  const completedAt = new Date().toISOString();
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
  throw new Error(message);
}

export async function waitForJobRecord(jobId, { root, timeoutMs = null, pollMs = 500, isAlive = processIsAlive, now = () => Date.now() } = {}) {
  validateJobId(jobId);
  const deadline = Number.isFinite(timeoutMs) && timeoutMs > 0 ? now() + timeoutMs : null;
  while (deadline === null || now() < deadline) {
    const record = await readJobRecord(jobId, root);
    if (record?.status === "completed") return record.result;
    if (record?.status === "failed") throw new Error(record.error ?? "Heliolune job failed");
    if (record?.status === "running" && record.ownerPid && !isAlive(record.ownerPid)) {
      const message = `Heliolune orchestrator process ${record.ownerPid} exited before job ${jobId} reached a terminal result. Restart Codex and retry the bounded task.`;
      const terminal = await failOrphanedRecord(jobId, record, root, message);
      if (terminal?.terminal) return terminal.result;
    }
    const waitMs = deadline === null ? pollMs : Math.min(pollMs, Math.max(1, deadline - now()));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error(`Timed out awaiting Heliolune job ${jobId}`);
}
