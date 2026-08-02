import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const serverPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", "scripts", "server.mjs");
const taskFiles = process.argv.slice(2);
if (!taskFiles.length) throw new Error("Usage: node scripts/run-live-benchmark.mjs <task.json> [task.json ...]");
const tasks = await Promise.all(taskFiles.map(async (taskFile) => ({
  taskFile,
  task: JSON.parse(await readFile(path.resolve(taskFile), "utf8")),
})));
const localAppData = await mkdtemp(path.join(os.tmpdir(), "heliolune-live-benchmark-"));
const child = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, LOCALAPPDATA: localAppData },
});

let nextId = 1;
let stderr = "";
const pending = new Map();
child.stderr.on("data", (chunk) => { stderr += String(chunk); });
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  clearTimeout(waiter.timer);
  waiter.resolve(message);
});

function request(method, params, timeoutMs) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}; stderr=${stderr.slice(-2000)}`));
    }, timeoutMs);
    timer.unref?.();
    pending.set(id, { resolve, reject, timer });
  });
}

const startedAt = Date.now();
try {
  const initialized = await request("initialize", { protocolVersion: "2025-06-18" }, 10_000);
  const runs = [];
  for (const { taskFile, task } of tasks) {
    const runStartedAt = Date.now();
    const response = await request("tools/call", { name: "run_task", arguments: task }, (task.timeoutSeconds + 180) * 1000);
    runs.push({
      taskFile,
      wallMs: Date.now() - runStartedAt,
      isError: response.result.isError,
      payload: JSON.parse(response.result.content[0].text),
    });
  }
  const result = {
    server: initialized.result.serverInfo,
    measuredAt: new Date().toISOString(),
    wallMs: Date.now() - startedAt,
    ...(runs.length === 1 ? runs[0] : { runs }),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  child.kill();
  await rm(localAppData, { recursive: true, force: true });
}
