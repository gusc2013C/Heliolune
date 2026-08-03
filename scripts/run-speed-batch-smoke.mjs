import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { readJobRecord, waitForJobRecord, waitForProcessExit } from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", "scripts", "server.mjs");
const showWindow = process.argv.includes("--show-window");
const fastStart = process.argv.includes("--fast-start");
const queuedWork = process.argv.includes("--queued");
const eightWay = process.argv.includes("--eight");
const targetArgument = process.argv.find((argument) => argument.startsWith("--target="));
const checkpointArgument = process.argv.find((argument) => argument.startsWith("--checkpoint="));
const checkpointSeconds = checkpointArgument ? Number(checkpointArgument.slice("--checkpoint=".length)) : 90;
const parallelism = eightWay ? 8 : 4;
const taskRoot = targetArgument ? path.resolve(targetArgument.slice("--target=".length)) : repoRoot;
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
if (queuedWork) {
  workstreams.push({
    id: "job-records",
    lane: "integration",
    objective: "Confirm how running job records distinguish a live owner from an orphan without a wall-clock expiry.",
    acceptance: ["Cite the owner-process check and confirm that legacy expiry timestamps are not enforced."],
    scope: ["plugins/luna-pool-orchestrator/scripts/job-files.mjs"],
    risk: "low",
    reservedBoundary: false,
  });
}
if (eightWay) {
  workstreams.push(
    {
      id: "await-contract",
      lane: "integration",
      objective: "Confirm that await_task has no wall-clock timeout field and waits for a terminal or orphaned job record.",
      acceptance: ["Cite the tool schema and wait call."],
      scope: ["plugins/luna-pool-orchestrator/scripts/await-server.mjs"],
      risk: "low",
      reservedBoundary: false,
    },
    {
      id: "renewable-policy",
      lane: "core",
      objective: "Confirm the renewable checkpoint, repeat interval, and high-confidence liveness boundary.",
      acceptance: ["Cite the schedule and supervisor prompt."],
      scope: ["plugins/luna-pool-orchestrator/scripts/supervision.mjs"],
      risk: "low",
      reservedBoundary: false,
    },
    {
      id: "schema-recovery",
      lane: "verifier",
      objective: "Confirm that schema recovery cannot continue repository exploration or implementation.",
      acceptance: ["Cite the no-tools recovery instruction."],
      scope: ["plugins/luna-pool-orchestrator/scripts/schema-recovery.mjs"],
      risk: "low",
      reservedBoundary: false,
    },
    {
      id: "cost-model",
      lane: "integration",
      objective: "Confirm that reasoning output is not billed twice and cached input uses its own rate.",
      acceptance: ["Cite the pricing calculation."],
      scope: ["plugins/luna-pool-orchestrator/scripts/pricing.mjs"],
      risk: "low",
      reservedBoundary: false,
    },
  );
}

try {
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
  const invocation = fastStart ? {
    name: "start_task",
    arguments: targetArgument ? {
      cwd: taskRoot,
      lane: "core",
      mode: "repair",
      objective: "Repair mergeMaintenanceWindows so it validates safe-integer half-open windows and a non-negative safe-integer maxGapMs, never mutates input, returns fresh sorted pairs, and merges overlap, adjacency, or a gap less than or equal to maxGapMs.",
      acceptance: [
        "Only src/merge-windows.mjs changes",
        "Invalid containers, pairs, endpoint order, endpoints, and maxGapMs throw TypeError",
        "Frozen input and fresh output pairs are supported",
        "node --test passes",
      ],
      scope: ["src/merge-windows.mjs"],
      risk: "low",
      reservedBoundary: false,
    } : {
      cwd: taskRoot,
      lane: "integration",
      mode: "analyze",
      objective: "Confirm how Heliolune reports bounded worker progress and avoids Sol polling.",
      acceptance: ["Cite decisive implementation evidence", "Identify the one-await controller contract"],
      scope: [
        "plugins/luna-pool-orchestrator/scripts/progress.mjs",
        "plugins/luna-pool-orchestrator/scripts/await-server.mjs",
      ],
      risk: "low",
      reservedBoundary: false,
    },
  } : {
    name: "start_batch",
    arguments: {
      cwd: repoRoot,
      parallelism,
      workstreams,
      checkpointSeconds,
    },
  };
  const response = await request("tools/call", {
    ...invocation,
  });
  if (response.result?.isError) throw new Error(response.result.content?.[0]?.text ?? `${invocation.name} failed`);
  const started = response.result.structuredContent;
  const result = await waitForJobRecord(started.jobId);
  const finalRecord = await readJobRecord(started.jobId);
  const runnerAutoExited = await waitForProcessExit(finalRecord?.ownerPid);
  if (result.priority !== "speed-first" || result.parallelism !== parallelism) throw new Error("Unexpected speed-first routing result");
  if (result.taskOutcomes?.length !== (fastStart ? 4 : workstreams.length)) throw new Error("Not every workstream reached a terminal outcome");
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
    entrypoint: invocation.name,
    taskRoot,
    runnerAutoExited,
  }, null, 2)}\n`);
} catch (error) {
  error.message = `${error.message}; server stderr=${stderr}`;
  throw error;
} finally {
  child.kill();
}
