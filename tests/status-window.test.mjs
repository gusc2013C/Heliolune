import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  detectSystemLanguage,
  launchStatusWindow,
  shouldLaunchStatusWindow,
} from "../plugins/luna-pool-orchestrator/scripts/status-window.mjs";
import { launchJobRunner } from "../plugins/luna-pool-orchestrator/scripts/job-runner-launch.mjs";

const execFileAsync = promisify(execFile);
const statusScript = fileURLToPath(new URL("../plugins/luna-pool-orchestrator/scripts/status-window.ps1", import.meta.url));
const statusLocales = fileURLToPath(new URL("../plugins/luna-pool-orchestrator/assets/status-locales.json", import.meta.url));
const liveBenchmarkScript = fileURLToPath(new URL("../scripts/run-live-benchmark.mjs", import.meta.url));

async function probeStatusRecord(root, jobId) {
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", statusScript, "-JobId", jobId, "-JobRoot", root, "-Probe",
    ], { windowsHide: true });
    return JSON.parse(stdout.trim());
  } catch (error) {
    const diagnostic = await readFile(path.join(root, `${jobId}.window-error.log`), "utf8").catch(() => "No status-window diagnostic was written.");
    throw new Error(`${error.message}\n${diagnostic}`);
  }
}

test("native window is the only automatic Windows status surface", () => {
  assert.equal(shouldLaunchStatusWindow({ platform: "win32" }), true);
  assert.equal(shouldLaunchStatusWindow({ platform: "linux" }), false);
  assert.equal(shouldLaunchStatusWindow({ platform: "win32", progressEnabled: true }), true);
  assert.equal(shouldLaunchStatusWindow({ platform: "win32", inlineUiSupported: true }), true);
  assert.equal(shouldLaunchStatusWindow({ platform: "win32", mode: "on", inlineUiSupported: true }), true);
  assert.equal(shouldLaunchStatusWindow({ platform: "win32", mode: "off" }), false);
});

test("system language survives a sanitized Windows runtime locale", () => {
  const language = detectSystemLanguage({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    fallbackLocale: "en-US",
    execFileSyncImpl: () => "LocaleName    REG_SZ    zh-CN",
  });
  assert.equal(language, "zh-CN");
  assert.equal(detectSystemLanguage({ platform: "linux", env: { LANG: "en_GB.UTF-8" } }), "en");
});

test("launcher uses the bundled WSH bridge without a console window", () => {
  let invocation;
  const child = { pid: 42, on() {}, unref() {} };
  const result = launchStatusWindow({
    jobId: "11111111-1111-4111-8111-111111111111",
    jobRoot: "C:\\jobs",
    platform: "win32",
    spawnImpl(command, args, options) {
      invocation = { command, args, options };
      return child;
    },
  });
  assert.equal(result.launched, true);
  assert.ok(invocation.command.toLowerCase().endsWith("system32\\wscript.exe"));
  assert.ok(invocation.args.some((value) => value.endsWith("status-window-launcher.vbs")));
  assert.ok(invocation.args.some((value) => value.endsWith("status-window.ps1")));
  assert.equal(invocation.options.windowsHide, false);
  assert.equal(invocation.options.stdio, "ignore");
});

test("job runner uses a hidden detached WSH bridge on Windows", () => {
  let invocation;
  const child = { pid: 84, on() {}, unref() {} };
  const result = launchJobRunner({
    jobId: "11111111-1111-4111-8111-111111111111",
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
    runnerScript: "C:\\plugin\\job-runner.mjs",
    spawnImpl(command, args, options) {
      invocation = { command, args, options };
      return child;
    },
  });
  assert.equal(result.mode, "wsh-detached");
  assert.ok(invocation.command.toLowerCase().endsWith("system32\\wscript.exe"));
  assert.ok(invocation.args[0].endsWith("job-runner-launcher.vbs"));
  assert.equal(invocation.args.at(-1), "11111111-1111-4111-8111-111111111111");
  assert.equal(invocation.options.detached, true);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.stdio, "ignore");
});

test("job runner reports asynchronous bridge launch failures", async () => {
  let errorHandler;
  const expected = new Error("bridge unavailable");
  let observed;
  const launch = launchJobRunner({
    jobId: "11111111-1111-4111-8111-111111111111",
    platform: "linux",
    onError: (error) => { observed = error; },
    spawnImpl() {
      return {
        once(event, handler) { if (event === "error") errorHandler = handler; },
        unref() {},
      };
    },
  });
  errorHandler(expected);
  await assert.rejects(launch.ready, /bridge unavailable/);
  assert.equal(observed, expected);
});

test("native panel creates cards for dynamic four/eight-worker burst lanes", async () => {
  const script = await readFile(statusScript, "utf8");
  const locales = JSON.parse(await readFile(statusLocales, "utf8"));
  assert.match(script, /function Add-WorkerCard/);
  assert.match(script, /snapshot\.workers \| ForEach-Object/);
  assert.match(script, /FileShare\]::ReadWrite -bor \[System\.IO\.FileShare\]::Delete/);
  assert.match(script, /unreadableSeconds -ge 5/);
  assert.equal(locales.en.strings.BurstWorker, "Burst worker {0}");
  assert.equal(locales["zh-CN"].lanes["speed-first"], "速度优先");
  assert.equal(locales["zh-CN"].lanes.adaptive, "自适应");
});

test("temporary live benchmarks cannot orphan a status window when cleaning their job root", async () => {
  const script = await readFile(liveBenchmarkScript, "utf8");
  assert.match(script, /HELIOLUNE_STATUS_WINDOW:\s*"off"/);
  assert.match(script, /rm\(localAppData, \{ recursive: true, force: true \}\)/);
});

test("Windows PowerShell can read the fallback status record", { skip: process.platform !== "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-status-window-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobId = "22222222-2222-4222-8222-222222222222";
  await writeFile(path.join(root, `${jobId}.json`), JSON.stringify({
    status: "running",
    ownerPid: process.pid,
    heartbeatAt: new Date().toISOString(),
    snapshot: {
      jobId, status: "running", lane: "tests", effort: "max", progress: 42,
      message: "bounded status", elapsedMs: 1234, updates: [],
      workers: [{ lane: "tests", status: "working", progress: 42, explanation: "Inspecting the focused regression." }],
    },
  }));
  const snapshot = await probeStatusRecord(root, jobId);
  assert.equal(snapshot.progress, 42);
  assert.equal(snapshot.lane, "tests");
  assert.equal(snapshot.workers[0].explanation, "Inspecting the focused regression.");
});

test("native panel probe marks orphaned worker snapshots failed", { skip: process.platform !== "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-status-orphan-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobId = "44444444-4444-4444-8444-444444444444";
  await writeFile(path.join(root, `${jobId}.json`), JSON.stringify({
    status: "running",
    ownerPid: 2147483646,
    snapshot: {
      jobId, status: "running", lane: "speed-first", effort: "max", progress: 84,
      message: "stale", elapsedMs: 180_000, updates: [],
      workers: [{ lane: "burst-1", status: "working", progress: 90, explanation: "stale" }],
    },
  }));
  const snapshot = await probeStatusRecord(root, jobId);
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.workers[0].status, "failed");
});

test("native panel probe rejects a stale heartbeat even when the owner PID is alive", { skip: process.platform !== "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-status-heartbeat-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobId = "55555555-5555-4555-8555-555555555555";
  await writeFile(path.join(root, `${jobId}.json`), JSON.stringify({
    status: "running",
    ownerPid: process.pid,
    heartbeatAt: new Date(Date.now() - 60_000).toISOString(),
    snapshot: {
      jobId, status: "running", lane: "speed-first", effort: "max", progress: 77,
      message: "stalled", elapsedMs: 180_000, updates: [],
      workers: [{ lane: "burst-1", status: "working", progress: 77, explanation: "stalled" }],
    },
  }));
  const snapshot = await probeStatusRecord(root, jobId);
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.workers[0].status, "failed");
});

test("native panel probe closes an expired startup lease", { skip: process.platform !== "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-status-startup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobId = "66666666-6666-4666-8666-666666666666";
  await writeFile(path.join(root, `${jobId}.json`), JSON.stringify({
    status: "starting",
    startedAt: new Date(Date.now() - 90_000).toISOString(),
    startupDeadline: new Date(Date.now() - 60_000).toISOString(),
    snapshot: { jobId, status: "starting", lane: "speed-first", progress: 0, workers: [] },
  }));
  const snapshot = await probeStatusRecord(root, jobId);
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.progress, 100);
});

test("native panel trusts a terminal record over a stale running snapshot", { skip: process.platform !== "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-status-terminal-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobId = "77777777-7777-4777-8777-777777777777";
  await writeFile(path.join(root, `${jobId}.json`), JSON.stringify({
    status: "completed",
    snapshot: {
      jobId, status: "running", lane: "speed-first", effort: "max", progress: 99,
      message: "stale running snapshot", elapsedMs: 180_000, updates: [],
      workers: [{ lane: "burst-1", status: "working", progress: 99, explanation: "stale" }],
    },
  }));
  const snapshot = await probeStatusRecord(root, jobId);
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.workers[0].status, "completed");
});

test("WPF initializes when Codex omits the windir environment variable", { skip: process.platform !== "win32" }, async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "windir"));
  env.windir = "";
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA",
    "-File", statusScript, "-JobId", "33333333-3333-4333-8333-333333333333", "-WpfProbe",
  ], { windowsHide: true, env });
  const result = JSON.parse(stdout.trim());
  assert.equal(result.wpf, "ready");
  assert.equal(result.apartment, "STA");
  assert.match(result.windir, /^[A-Za-z]:\\/);
});
