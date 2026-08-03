import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", "scripts", "server.mjs");

test("plugin default prompts satisfy the Codex manifest length limit", async () => {
  const manifestPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.ok(manifest.interface.defaultPrompt.length <= 3);
  for (const prompt of manifest.interface.defaultPrompt) assert.ok(prompt.length <= 128);
});

test("stdio MCP exposes cost dashboard without starting a model", async (t) => {
  const localAppData = await mkdtemp(path.join(os.tmpdir(), "heliolune-mcp-test-"));
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, LOCALAPPDATA: localAppData },
  });
  t.after(async () => {
    child.kill();
    await rm(localAppData, { recursive: true, force: true });
  });

  const pending = new Map();
  let nextId = 1;
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    waiter.resolve(message);
  });

  function request(method, params = {}) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}; stderr=${stderr}`));
      }, 5000);
      pending.set(id, {
        resolve: (message) => { clearTimeout(timer); resolve(message); },
      });
    });
  }

  const initialized = await request("initialize", { protocolVersion: "2025-06-18" });
  assert.equal(initialized.result.serverInfo.name, "luna-pool-orchestrator");

  const listed = await request("tools/list");
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "runtime_info", "initialize_pool", "start_batch", "start_task", "pool_status", "cost_dashboard",
  ]);
  const runtimeResponse = await request("tools/call", { name: "runtime_info", arguments: {} });
  const runtime = JSON.parse(runtimeResponse.result.content[0].text);
  assert.equal(runtime.version, "0.6.5");
  assert.equal(runtime.buildId, "0.6.5-owner-heartbeat-r2");
  assert.equal(runtime.promptVersion, "mcp-v15-owner-heartbeat");
  assert.equal(runtime.defaultProfile, "speed-first");
  assert.equal(runtime.defaultParallelism, 4);
  assert.equal(runtime.burstThreadsEphemeral, true);
  assert.equal(runtime.appServerWindowHidden, true);
  const startTool = listed.result.tools.find((tool) => tool.name === "start_task");
  assert.equal(startTool._meta, undefined);
  assert.equal(startTool.inputSchema.properties.profile.default, "speed-first");
  assert.deepEqual(startTool.inputSchema.required, ["cwd", "lane", "mode", "objective", "acceptance", "scope"]);
  assert.deepEqual(Object.keys(startTool.inputSchema.properties), [
    "cwd", "lane", "mode", "objective", "acceptance", "repoState", "scope", "risk", "reservedBoundary", "profile", "maxFiles", "maxCommands",
  ]);
  assert.equal(startTool.inputSchema.properties.timeoutSeconds, undefined);
  assert.equal(startTool.inputSchema.properties.checkpointSeconds, undefined);
  assert.equal(startTool.inputSchema.properties.maxFiles.maximum, 30);
  assert.equal(startTool.inputSchema.properties.verification, undefined);
  assert.equal(initialized.result.capabilities.resources, undefined);
  const batchTool = listed.result.tools.find((tool) => tool.name === "start_batch");
  assert.deepEqual(batchTool.inputSchema.properties.parallelism.enum, [4, 8]);
  assert.equal(batchTool.inputSchema.properties.workstreams.maxItems, 8);
  assert.deepEqual(Object.keys(batchTool.inputSchema.properties), ["cwd", "parallelism", "workstreams", "checkpointSeconds", "maxFiles", "maxCommands"]);

  const dashboardResponse = await request("tools/call", {
    name: "cost_dashboard",
    arguments: { cwd: repoRoot, format: "json", includePricing: true },
  });
  const dashboard = JSON.parse(dashboardResponse.result.content[0].text);
  assert.equal(dashboard.status, "ok");
  assert.equal(dashboard.data.counts.taskRuns, 0);
  assert.equal(dashboard.data.cost.actual.model, "gpt-5.6-luna");
  assert.equal(dashboard.pricing.models["gpt-5.6-sol"].output, 750);
});
