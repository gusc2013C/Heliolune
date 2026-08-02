import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readJobRecord, waitForJobRecord, writeJobRecord } from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const jobId = "123e4567-e89b-42d3-a456-426614174000";

test("job result files are atomic, scoped, and awaitable across MCP processes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-job-files-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJobRecord(jobId, { status: "running" }, root);
  assert.equal((await readJobRecord(jobId, root)).status, "running");
  const waiting = waitForJobRecord(jobId, { root, timeoutMs: 1_000, pollMs: 10 });
  await writeJobRecord(jobId, { status: "completed", result: { status: "completed" } }, root);
  assert.deepEqual(await waiting, { status: "completed" });
});

test("job result files reject path-shaped identifiers", async () => {
  await assert.rejects(readJobRecord("../escape"), /Invalid Heliolune job id/);
});
