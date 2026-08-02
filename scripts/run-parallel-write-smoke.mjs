import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { waitForJobRecord } from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", "scripts", "server.mjs");
const fixture = await mkdtemp(path.join(os.tmpdir(), "heliolune-parallel-write-smoke-"));
const localAppData = await mkdtemp(path.join(os.tmpdir(), "heliolune-parallel-write-state-"));

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
await command("git", ["config", "user.name", "Heliolune Smoke"], fixture);
await writeFile(path.join(fixture, "alpha.txt"), "alpha=old\n");
await writeFile(path.join(fixture, "beta.txt"), "beta=old\n");
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
      parallelism: 4,
      timeoutSeconds: 120,
      workstreams: [
        {
          id: "alpha",
          lane: "core",
          mode: "implement",
          objective: "Change alpha.txt from alpha=old to alpha=new and make no other changes.",
          acceptance: ["alpha.txt contains exactly alpha=new"],
          scope: ["alpha.txt"],
          risk: "low",
          reservedBoundary: false
        },
        {
          id: "beta",
          lane: "tests",
          mode: "repair",
          objective: "Change beta.txt from beta=old to beta=new and make no other changes.",
          acceptance: ["beta.txt contains exactly beta=new"],
          scope: ["beta.txt"],
          risk: "low",
          reservedBoundary: false
        }
      ]
    },
  });
  if (startedResponse.result?.isError) throw new Error(startedResponse.result.content?.[0]?.text ?? "start_batch failed");
  const started = startedResponse.result.structuredContent;
  const result = await waitForJobRecord(started.jobId, { root: localAppData, timeoutMs: 240_000 });
  const alpha = (await readFile(path.join(fixture, "alpha.txt"), "utf8")).replaceAll("\r\n", "\n");
  const beta = (await readFile(path.join(fixture, "beta.txt"), "utf8")).replaceAll("\r\n", "\n");
  const staged = await command("git", ["diff", "--cached", "--name-only"], fixture);
  const worktrees = await command("git", ["worktree", "list", "--porcelain"], fixture);
  if (result.status !== "completed" || !result.integration?.applied) throw new Error(`Parallel integration failed: ${JSON.stringify(result.integration)}`);
  if (alpha.trim() !== "alpha=new" || beta.trim() !== "beta=new") throw new Error(`Unexpected integrated contents: ${JSON.stringify({ alpha, beta })}`);
  if (staged) throw new Error(`Parallel integration left staged paths: ${staged}`);
  if ((worktrees.match(/^worktree /gm) ?? []).length !== 1) throw new Error(`Temporary worktrees were not cleaned: ${worktrees}`);
  process.stdout.write(`${JSON.stringify({
    jobId: started.jobId,
    status: result.status,
    parallelism: result.parallelism,
    integration: result.integration,
    outcomes: result.taskOutcomes,
    usage: result.usage,
    cost: result.cost,
    timing: result.timing,
    stagedPaths: staged,
    remainingWorktrees: 1,
  }, null, 2)}\n`);
} finally {
  child.kill();
  await rm(fixture, { recursive: true, force: true });
  await rm(localAppData, { recursive: true, force: true });
}
