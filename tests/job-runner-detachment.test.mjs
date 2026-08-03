import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { processIsAlive } from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const execFileAsync = promisify(execFile);
const launcherFixture = fileURLToPath(new URL("./fixtures/launch-detached-runner.mjs", import.meta.url));
const runnerFixture = fileURLToPath(new URL("./fixtures/detached-runner.mjs", import.meta.url));
const jobId = "55555555-5555-4555-8555-555555555555";

async function stopProcess(pid, tree = false) {
  if (!processIsAlive(pid)) return;
  await execFileAsync("taskkill.exe", ["/PID", String(pid), ...(tree ? ["/T"] : []), "/F"], { windowsHide: true }).catch(() => {});
}

async function waitForRunnerPid(file, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await readFile(file, "utf8").catch(() => "");
    const pid = Number(value.trim());
    if (Number.isSafeInteger(pid) && pid > 0) return pid;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Detached runner probe did not publish its PID.");
}

test("Windows job runner survives forced host process-tree cleanup", { skip: process.platform !== "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-detach-"));
  const env = { ...process.env, HELIOLUNE_DETACH_PROBE_ROOT: root };
  const host = spawn(process.execPath, [launcherFixture, jobId, runnerFixture], {
    stdio: "ignore",
    windowsHide: true,
    env,
  });
  let runnerPid = null;
  t.after(async () => {
    await stopProcess(host.pid, true);
    if (runnerPid) await stopProcess(runnerPid);
    await rm(root, { recursive: true, force: true });
  });

  runnerPid = await waitForRunnerPid(path.join(root, `${jobId}.pid`));
  assert.equal(processIsAlive(host.pid), true);
  assert.equal(processIsAlive(runnerPid), true);
  await stopProcess(host.pid, true);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(processIsAlive(host.pid), false);
  assert.equal(processIsAlive(runnerPid), true);
});
