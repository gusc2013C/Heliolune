import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  MCP_APP_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
  detectSystemLanguage,
  launchStatusWindow,
  shouldLaunchStatusWindow,
  supportsInlineStatus,
} from "../plugins/luna-pool-orchestrator/scripts/status-window.mjs";

const execFileAsync = promisify(execFile);
const statusScript = fileURLToPath(new URL("../plugins/luna-pool-orchestrator/scripts/status-window.ps1", import.meta.url));

test("native window is an automatic Windows-only fallback", () => {
  assert.equal(shouldLaunchStatusWindow({ platform: "win32" }), true);
  assert.equal(shouldLaunchStatusWindow({ platform: "linux" }), false);
  assert.equal(shouldLaunchStatusWindow({ platform: "win32", progressEnabled: true }), false);
  assert.equal(shouldLaunchStatusWindow({ platform: "win32", inlineUiSupported: true }), false);
  assert.equal(shouldLaunchStatusWindow({ platform: "win32", mode: "on", inlineUiSupported: true }), true);
  assert.equal(shouldLaunchStatusWindow({ platform: "win32", mode: "off" }), false);
});

test("MCP Apps capability negotiation suppresses the fallback", () => {
  const capabilities = { extensions: { [MCP_APP_EXTENSION_ID]: { mimeTypes: [MCP_APP_MIME_TYPE] } } };
  assert.equal(supportsInlineStatus(capabilities), true);
  assert.equal(supportsInlineStatus({}), false);
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

test("Windows PowerShell can read the fallback status record", { skip: process.platform !== "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-status-window-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobId = "22222222-2222-4222-8222-222222222222";
  await writeFile(path.join(root, `${jobId}.json`), JSON.stringify({
    status: "running",
    snapshot: {
      jobId, status: "running", lane: "tests", effort: "max", progress: 42,
      message: "bounded status", elapsedMs: 1234, updates: [],
      workers: [{ lane: "tests", status: "working", progress: 42, explanation: "Inspecting the focused regression." }],
    },
  }));
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", statusScript, "-JobId", jobId, "-JobRoot", root, "-Probe",
  ], { windowsHide: true });
  const snapshot = JSON.parse(stdout.trim());
  assert.equal(snapshot.progress, 42);
  assert.equal(snapshot.lane, "tests");
  assert.equal(snapshot.workers[0].explanation, "Inspecting the focused regression.");
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
