import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { writeJobRecord } from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "plugins", "luna-pool-orchestrator", "scripts", "await-server.mjs");
const jobId = "123e4567-e89b-42d3-a456-426614174001";

test("dedicated await MCP reads a completed job without blocking the status server", async (t) => {
  const localAppData = await mkdtemp(path.join(os.tmpdir(), "heliolune-await-test-"));
  await writeJobRecord(jobId, { status: "completed", result: { status: "completed", summary: "ok" } }, localAppData);
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    env: { ...process.env, LOCALAPPDATA: localAppData },
  });
  t.after(async () => { child.kill(); await rm(localAppData, { recursive: true, force: true }); });
  const pending = new Map();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  let id = 0;
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 5_000);
    pending.set(requestId, (message) => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
  });
  const initialized = await request("initialize", { protocolVersion: "2025-06-18" });
  assert.equal(initialized.result.serverInfo.name, "heliolune-await");
  const listed = await request("tools/list");
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["await_task"]);
  assert.deepEqual(Object.keys(listed.result.tools[0].inputSchema.properties), ["jobId", "buildId"]);
  assert.deepEqual(listed.result.tools[0].inputSchema.required, ["jobId", "buildId"]);
  const stale = await request("tools/call", { name: "await_task", arguments: { jobId, buildId: "0.7.0-alpha.1-stale" } });
  assert.equal(stale.result.isError, true);
  assert.match(JSON.parse(stale.result.content[0].text).message, /Stale Heliolune await runtime/);
  const response = await request("tools/call", { name: "await_task", arguments: { jobId, buildId: "0.7.0-alpha.1-adaptive-shadow-r1" } });
  assert.equal(JSON.parse(response.result.content[0].text).summary, "ok");
});
