import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", "scripts", "server.mjs");
const child = spawn(process.execPath, [serverPath], { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
const pending = new Map();
let nextId = 1;
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  waiter(message);
});

function request(method, params = {}) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve) => pending.set(id, resolve));
}

function measure(tools) {
  const characters = JSON.stringify(tools).length;
  return { tools: tools.map((tool) => tool.name), characters, approximateTokens: Math.ceil(characters / 4) };
}

try {
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
  const listed = await request("tools/list");
  const tools = listed.result.tools;
  const tokenNames = new Set(["initialize_pool", "start_task", "pool_status", "cost_dashboard"]);
  const speedNames = new Set(["initialize_pool", "start_batch", "pool_status", "cost_dashboard"]);
  process.stdout.write(`${JSON.stringify({
    all: measure(tools),
    tokenFirstSurface: measure(tools.filter((tool) => tokenNames.has(tool.name))),
    speedFirstSurface: measure(tools.filter((tool) => speedNames.has(tool.name))),
    marginalSpeedSchema: measure(tools.filter((tool) => tool.name === "start_batch")),
  }, null, 2)}\n`);
} finally {
  child.kill();
}
