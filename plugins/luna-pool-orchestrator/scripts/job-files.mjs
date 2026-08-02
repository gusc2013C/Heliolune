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

export async function waitForJobRecord(jobId, { root, timeoutMs = 3_900_000, pollMs = 500 } = {}) {
  validateJobId(jobId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = await readJobRecord(jobId, root);
    if (record?.status === "completed") return record.result;
    if (record?.status === "failed") throw new Error(record.error ?? "Heliolune job failed");
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(1, deadline - Date.now()))));
  }
  throw new Error(`Timed out awaiting Heliolune job ${jobId}`);
}
