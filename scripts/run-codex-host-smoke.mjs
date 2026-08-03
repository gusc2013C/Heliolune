import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { resolveCodexExecutable } from "../plugins/luna-pool-orchestrator/scripts/app-server-client.mjs";
import { jobDirectory, processIsAlive, readJobRecord, waitForProcessExit } from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(process.argv[2] ?? path.join(scriptDirectory, ".."));
const executable = await resolveCodexExecutable();
const child = spawn(executable, [
  "-c", "mcp_servers.node_repl.enabled=false",
  "-c", "mcp_servers.serena.enabled=false",
  "-c", "mcp_servers.context7.enabled=false",
  "app-server", "--listen", "stdio://",
], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: process.env,
});

let nextId = 1;
let stderr = "";
const pending = new Map();
const output = readline.createInterface({ input: child.stdout });
child.stderr.on("data", (chunk) => { stderr += String(chunk); });
output.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id != null && !message.method) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
    return;
  }
  if (message.id != null && message.method) {
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: message.id,
      error: { code: -32601, message: `Host smoke does not handle callback ${message.method}` },
    })}\n`);
  }
});

function request(method, params = {}, timeoutMs = 60_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0 ? setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}; stderr=${stderr.slice(-4000)}`));
      }, timeoutMs) : null;
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function stage(message) {
  process.stderr.write(`[host-smoke] ${message}\n`);
}

async function waitForNativeWindow(jobId, timeoutMs = 10_000) {
  const readyFile = path.join(jobDirectory(), `${jobId}.window.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(readyFile, "utf8")); }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  const errorFile = path.join(jobDirectory(), `${jobId}.window-error.log`);
  const diagnostic = await readFile(errorFile, "utf8").catch(() => "no PowerShell diagnostic was written");
  throw new Error(`Native status window did not render: ${diagnostic}`);
}

async function waitForNativeWindowClose(pid, timeoutMs = 25_000) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Native status window did not report a valid PID: ${pid}`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Native status window process ${pid} did not auto-close within ${timeoutMs}ms of terminal status.`);
}

async function stopChildTree() {
  output.close();
  child.stdin.destroy();
  if (child.exitCode != null || child.pid == null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      const timer = setTimeout(resolve, 10_000);
      killer.once("error", () => { clearTimeout(timer); resolve(); });
      killer.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  } else {
    child.kill("SIGKILL");
  }
  child.stdout.destroy();
  child.stderr.destroy();
}

const taskArguments = {
  cwd: repoRoot,
  lane: "integration",
  mode: "analyze",
  objective: "Explain what progress.mjs guarantees and cite that file.",
  acceptance: ["One path-backed evidence item", "One concise guarantee"],
  scope: ["plugins/luna-pool-orchestrator/scripts/progress.mjs"],
  risk: "low",
  reservedBoundary: false,
};

try {
  await request("initialize", {
    clientInfo: { name: "heliolune-host-smoke", version: "0.6.5" },
    capabilities: { experimentalApi: true },
  });
  notify("initialized");
  stage("app-server initialized");
  const thread = await request("thread/start", {
    model: "gpt-5.6-sol",
    ephemeral: true,
    cwd: repoRoot,
    runtimeWorkspaceRoots: [repoRoot],
    sandbox: "read-only",
    approvalPolicy: "never",
    approvalsReviewer: "user",
    baseInstructions: "Heliolune host integration test.",
  });
  stage(`ephemeral host thread started: ${thread.thread.id}`);

  const runtimeResponse = await request("mcpServer/tool/call", {
    threadId: thread.thread.id,
    server: "luna-pool",
    tool: "runtime_info",
    arguments: {},
  }, 30_000);
  const runtimeText = runtimeResponse.content?.find((item) => item.type === "text")?.text;
  const runtime = runtimeResponse.structuredContent ?? JSON.parse(runtimeText ?? "null");
  if (runtime?.version !== "0.6.5" || runtime.buildId !== "0.6.5-owner-heartbeat-r2" || runtime.promptVersion !== "mcp-v15-owner-heartbeat"
      || runtime.defaultProfile !== "speed-first" || runtime.defaultParallelism !== 4
      || runtime.burstThreadsEphemeral !== true || runtime.appServerWindowHidden !== true || runtime.statusSurface !== "native-window") {
    throw new Error(`Installed Heliolune runtime gate failed: ${JSON.stringify(runtime)}`);
  }
  stage(`runtime gate passed: ${runtime.version} / ${runtime.defaultProfile} / ${runtime.defaultParallelism}-way`);

  const startedAt = Date.now();
  const startResponse = await request("mcpServer/tool/call", {
    threadId: thread.thread.id,
    server: "luna-pool",
    tool: "start_task",
    arguments: taskArguments,
  }, 60_000);
  const started = startResponse.structuredContent;
  if (!started?.jobId) throw new Error(`start_task did not return a jobId: ${JSON.stringify(startResponse)}`);
  if (started.buildId !== runtime.buildId) throw new Error(`start_task build identity mismatch: ${JSON.stringify(started)}`);
  if (started.display?.mode !== "native-window") {
    throw new Error(`No visible status surface was selected: ${JSON.stringify(started.display)}`);
  }
  stage(`job ${started.jobId} started with ${started.display.mode}`);
  const windowReady = started.display.mode === "native-window"
    ? await waitForNativeWindow(started.jobId)
    : null;
  if (windowReady) stage(`native status window rendered in ${windowReady.language}`);

  const awaitResponse = request("mcpServer/tool/call", {
    threadId: thread.thread.id,
    server: "luna-await",
    tool: "await_task",
    arguments: { jobId: started.jobId, buildId: started.buildId },
  }, null);
  stage("await_task is blocking on the independent server");
  const awaited = await awaitResponse;
  const finalRecord = await readJobRecord(started.jobId);
  stage(`await_task complete; final status: ${finalRecord?.status}`);

  if (awaited.isError) throw new Error(`await_task failed: ${JSON.stringify(awaited)}`);
  if (finalRecord?.status !== "completed") {
    throw new Error(`Final job record is incomplete: ${JSON.stringify(finalRecord)}`);
  }
  const finalWorkers = finalRecord.snapshot?.workers ?? [];
  const burstWorkers = finalWorkers.filter((worker) => worker.lane.startsWith("burst-"));
  const activeWorker = burstWorkers.find((worker) => worker.explanation);
  if (burstWorkers.length !== 4 || burstWorkers.some((worker) => !["completed", "failed"].includes(worker.status)) || !activeWorker?.explanation) {
    throw new Error(`Worker lanes or natural-language status are incomplete: ${JSON.stringify(finalWorkers)}`);
  }
  if (windowReady?.language === "zh-CN" && !/[\u3400-\u9fff]/u.test(activeWorker.explanation)) {
    throw new Error(`Luna explanation did not follow the detected Chinese UI language: ${activeWorker.explanation}`);
  }
  const visibleCost = finalRecord.snapshot?.cost;
  if (visibleCost?.savingsPercent == null || visibleCost?.actual == null || visibleCost?.projectedSolOnly == null || visibleCost?.estimatedSavings == null) {
    throw new Error(`Final status does not expose the cost estimate: ${JSON.stringify(visibleCost)}`);
  }
  if (visibleCost.profile !== "alpha-0.5.0-matched" || Math.abs(visibleCost.savingsPercent - 75.6261) > 0.01) {
    throw new Error(`Visible savings did not use the matched historical profile: ${JSON.stringify(visibleCost)}`);
  }
  const windowAutoClosed = windowReady ? await waitForNativeWindowClose(windowReady.pid) : null;
  if (windowAutoClosed) stage(`native status window ${windowReady.pid} auto-closed after terminal status`);
  const runnerAutoExited = await waitForProcessExit(finalRecord.ownerPid);
  if (runnerAutoExited) stage(`detached runner ${finalRecord.ownerPid} released its app-server tree and exited`);
  process.stdout.write(`${JSON.stringify({
    server: "Codex app-server",
    runtime,
    wallMs: Date.now() - startedAt,
    jobId: started.jobId,
    displayMode: started.display.mode,
    windowReady,
    activeWorker,
    cost: visibleCost,
    finalProgress: finalRecord.snapshot?.progress,
    awaitStatus: "completed",
    windowAutoClosed,
    runnerAutoExited,
  }, null, 2)}\n`);
} finally {
  await stopChildTree();
}
