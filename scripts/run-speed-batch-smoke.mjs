import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { waitForJobRecord } from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", "scripts", "server.mjs");
const showWindow = process.argv.includes("--show-window");
const child = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, HELIOLUNE_STATUS_WINDOW: showWindow ? "on" : "off" },
});

const pending = new Map();
let nextId = 1;
let stderr = "";
child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  waiter.resolve(message);
});

function request(method, params = {}, timeoutMs = 10_000) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}; stderr=${stderr}`));
    }, timeoutMs);
    pending.set(id, { resolve: (message) => { clearTimeout(timer); resolve(message); } });
  });
}

const workstreams = [
  {
    id: "completion",
    lane: "core",
    objective: "Confirm how turn completion IDs are normalized.",
    acceptance: ["Cite the helper and both supported notification shapes."],
    scope: ["plugins/luna-pool-orchestrator/scripts/app-server-client.mjs"],
    risk: "low",
    reservedBoundary: false,
  },
  {
    id: "profiles",
    lane: "integration",
    objective: "Confirm the token-first and speed-first parallelism defaults.",
    acceptance: ["Cite the profile constants and allowed speed parallelism values."],
    scope: ["plugins/luna-pool-orchestrator/scripts/profiles.mjs"],
    risk: "low",
    reservedBoundary: false,
  },
  {
    id: "window",
    lane: "integration",
    objective: "Confirm that Windows auto mode launches the native status window unless disabled.",
    acceptance: ["Cite the Windows and explicit-off branches."],
    scope: ["plugins/luna-pool-orchestrator/scripts/status-window.mjs"],
    risk: "low",
    reservedBoundary: false,
  },
  {
    id: "batch-safety",
    lane: "verifier",
    objective: "Verify that speed-first rejects mutating and duplicate-ID workstreams.",
    acceptance: ["Cite both validation checks."],
    scope: ["plugins/luna-pool-orchestrator/scripts/profiles.mjs"],
    risk: "moderate",
    reservedBoundary: false,
  },
];

try {
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
  const response = await request("tools/call", {
    name: "start_batch",
    arguments: {
      cwd: repoRoot,
      parallelism: 4,
      workstreams,
      timeoutSeconds: 120,
    },
  });
  if (response.result?.isError) throw new Error(response.result.content?.[0]?.text ?? "start_batch failed");
  const started = response.result.structuredContent;
  const result = await waitForJobRecord(started.jobId, { timeoutMs: 240_000 });
  if (result.priority !== "speed-first" || result.parallelism !== 4) throw new Error("Unexpected speed-first routing result");
  if (result.taskOutcomes?.length !== workstreams.length) throw new Error("Not every workstream reached a terminal outcome");
  if (!result.usage || !result.cost || !result.timing) throw new Error("Missing usage, cost, or timing telemetry");
  process.stdout.write(`${JSON.stringify({
    jobId: started.jobId,
    status: result.status,
    priority: result.priority,
    parallelism: result.parallelism,
    reportMode: result.reportMode,
    outcomes: result.taskOutcomes,
    usage: result.usage,
    cost: result.cost,
    timing: result.timing,
    display: started.display,
  }, null, 2)}\n`);
} finally {
  child.kill();
}
