import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { readJobRecord, waitForJobRecord, waitForProcessExit } from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", "scripts", "server.mjs");
const fixture = await mkdtemp(path.join(os.tmpdir(), "heliolune-dag-write-smoke-"));
const localAppData = await mkdtemp(path.join(os.tmpdir(), "heliolune-dag-write-state-"));

function command(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim())));
  });
}

await command("git", ["init"], fixture);
await command("git", ["config", "user.email", "heliolune@example.invalid"], fixture);
await command("git", ["config", "user.name", "Heliolune DAG Smoke"], fixture);
await writeFile(path.join(fixture, "feature.txt"), "state=old\n");
await command("git", ["add", "-A"], fixture);
await command("git", ["commit", "-m", "fixture"], fixture);

const child = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, LOCALAPPDATA: localAppData, HELIOLUNE_STATUS_WINDOW: "off" },
});
let nextId = 1;
let stderr = "";
const pending = new Map();
child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  waiter(message);
});

function request(method, params = {}, timeoutMs = 30_000) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}; ${stderr}`)), timeoutMs);
    pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
  });
}

try {
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
  const startedResponse = await request("tools/call", {
    name: "start_batch",
    arguments: {
      cwd: fixture,
      profile: "adaptive",
      parallelism: 2,
      checkpointSeconds: 90,
      workstreams: [
        {
          id: "owner",
          kind: "repair",
          lane: "core",
          mode: "repair",
          objective: "Change feature.txt from state=old to state=new and make no other changes.",
          acceptance: ["feature.txt contains exactly state=new"],
          scope: ["feature.txt"],
          writeLease: ["feature.txt"],
          preferredAffinity: "feature",
          priority: 90,
          risk: "moderate",
          reservedBoundary: false
        },
        {
          id: "challenge",
          kind: "challenge",
          lane: "verifier",
          mode: "analyze",
          objective: "Inspect the exact completed owner candidate, confirm feature.txt is exactly state=new, and look for any other changed path.",
          acceptance: ["Bind the verdict to the supplied candidate fingerprint", "Confirm no path except feature.txt changed"],
          scope: ["feature.txt"],
          dependsOn: ["owner"],
          candidateFrom: "owner",
          readLease: ["feature.txt"],
          preferredAffinity: "feature",
          priority: 80,
          risk: "moderate",
          reservedBoundary: false
        }
      ]
    },
  });
  if (startedResponse.result?.isError) throw new Error(startedResponse.result.content?.[0]?.text ?? "start_batch failed");
  const started = startedResponse.result.structuredContent;
  const result = await waitForJobRecord(started.jobId, { root: localAppData });
  const finalRecord = await readJobRecord(started.jobId, localAppData);
  const runnerAutoExited = await waitForProcessExit(finalRecord?.ownerPid);
  const contents = (await readFile(path.join(fixture, "feature.txt"), "utf8")).replaceAll("\r\n", "\n");
  const staged = await command("git", ["diff", "--cached", "--name-only"], fixture);
  const worktrees = await command("git", ["worktree", "list", "--porcelain"], fixture);
  const owner = result.taskOutcomes.find(({ id }) => id === "owner");
  const challenge = result.taskOutcomes.find(({ id }) => id === "challenge");
  if (result.status !== "completed" || !result.integration?.applied) throw new Error(`DAG integration failed: ${JSON.stringify(result)}`);
  if (contents.trim() !== "state=new") throw new Error(`Unexpected integrated contents: ${contents}`);
  if (!/^[0-9a-f]{64}$/.test(challenge?.candidateFingerprint ?? "")) throw new Error(`Challenge fingerprint missing: ${JSON.stringify(challenge)}`);
  if (!owner?.slot || !challenge?.slot || owner.slot === challenge.slot) throw new Error(`Challenge did not use an independent worker slot: ${JSON.stringify(result.taskOutcomes)}`);
  if (result.routing?.dag?.schema !== "TASK_DAG_V1" || result.routing.dag.initialWidth !== 1 || result.routing.dag.peakWidth !== 2) {
    throw new Error(`Adaptive DAG widening is incomplete: ${JSON.stringify(result.routing?.dag)}`);
  }
  if (result.telemetry?.metrics?.criticalPathMs !== result.timing.workerSumMs) throw new Error(`Dependent critical path is incorrect: ${JSON.stringify(result.telemetry?.metrics)}`);
  if (staged) throw new Error(`DAG integration left staged paths: ${staged}`);
  if ((worktrees.match(/^worktree /gm) ?? []).length !== 1) throw new Error(`Temporary worktrees were not cleaned: ${worktrees}`);
  process.stdout.write(`${JSON.stringify({
    jobId: started.jobId,
    status: result.status,
    integration: result.integration,
    outcomes: result.taskOutcomes,
    dag: result.routing.dag,
    telemetry: result.telemetry,
    usage: result.usage,
    cost: result.cost,
    timing: result.timing,
    stagedPaths: staged,
    remainingWorktrees: 1,
    runnerAutoExited,
  }, null, 2)}\n`);
} finally {
  child.kill();
  await rm(fixture, { recursive: true, force: true });
  await rm(localAppData, { recursive: true, force: true });
}
