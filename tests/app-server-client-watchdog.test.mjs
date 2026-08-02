import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AppServerClient } from "../plugins/luna-pool-orchestrator/scripts/app-server-client.mjs";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-app-server.mjs");
const schema = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } };

async function clientForTest(t) {
  const client = new AppServerClient({ executable: process.execPath, executableArgs: [fixture] });
  await client.start();
  t.after(() => client.close());
  return client;
}

test("recent app-server events prove a worker is live at soft timeout", async (t) => {
  const client = await clientForTest(t);
  let snapshot;
  const run = await client.runTurn({
    threadId: "fake-thread", text: "LIVE", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
    watchdog: { afterMs: 50, onCheck: async (value) => {
      snapshot = value;
      return { action: "continue", confidence: "high", reason: "recent activity", source: "activity" };
    } },
  });
  assert.equal(run.output.ok, true);
  assert.ok(snapshot.eventCount >= 1);
  assert.ok(snapshot.silentMs < 50);
  assert.equal(run.supervision.action, "continue");
});

test("supervisor can interrupt a silent worker before hard timeout", async (t) => {
  const client = await clientForTest(t);
  await assert.rejects(
    client.runTurn({
      threadId: "fake-thread", text: "STALL", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
      watchdog: { afterMs: 40, onCheck: async (snapshot) => {
        assert.equal(snapshot.eventCount, 0);
        return { action: "interrupt", confidence: "high", reason: "sustained silence", source: "test-supervisor" };
      } },
    }),
    (error) => error.code === "SUPERVISOR_INTERRUPTED" && error.activity.silentMs >= 40,
  );
});

test("a worker that completes while the supervisor thinks is not interrupted", async (t) => {
  const client = await clientForTest(t);
  const run = await client.runTurn({
    threadId: "fake-thread", text: "LIVE", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
    watchdog: { afterMs: 30, onCheck: async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { action: "interrupt", confidence: "high", reason: "stale snapshot", source: "test-supervisor" };
    } },
  });
  assert.equal(run.output.ok, true);
  assert.equal(run.supervision.action, "continue");
  assert.equal(run.supervision.originalAction, "interrupt");
});

test("hard timeout is classified when no supervisor is configured", async (t) => {
  const client = await clientForTest(t);
  await assert.rejects(
    client.runTurn({
      threadId: "fake-thread", text: "STALL", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 50,
    }),
    (error) => error.code === "TURN_HARD_TIMEOUT" && error.activity.eventCount === 0,
  );
});

test("active work can be interrupted and followed by synthesis on the same thread", async (t) => {
  const client = await clientForTest(t);
  let firstUsage;
  await assert.rejects(
    client.runTurn({
      threadId: "fake-thread", text: "ACTIVE_TIMEOUT", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 100,
    }),
    (error) => {
      firstUsage = error.activity.usage;
      return error.code === "TURN_HARD_TIMEOUT" && error.activity.eventCount > 0;
    },
  );
  const synthesis = await client.runTurn({
    threadId: "fake-thread", text: "SYNTHESIZE", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
  });
  assert.equal(synthesis.output.ok, true);
  assert.equal(firstUsage.last.inputTokens, 100);
});

test("an active turn can be steered to finalize before its hard deadline", async (t) => {
  const client = await clientForTest(t);
  const run = await client.runTurn({
    threadId: "fake-thread", text: "ACTIVE_TIMEOUT", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
    steer: { afterMs: 80, text: "FINALIZE_NOW" },
  });
  assert.equal(run.output.ok, true);
  assert.equal(run.steering.attempted, true);
  assert.equal(run.steering.accepted, true);
});

test("a turn that completes before the reserve window is never steered", async (t) => {
  const client = await clientForTest(t);
  const run = await client.runTurn({
    threadId: "fake-thread", text: "LIVE", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
    steer: { afterMs: 200, text: "FINALIZE_NOW" },
  });
  assert.equal(run.output.ok, true);
  assert.equal(run.steering.attempted, false);
});

test("a stale turn skips finalization steering", async (t) => {
  const client = await clientForTest(t);
  await assert.rejects(
    client.runTurn({
      threadId: "fake-thread", text: "STALL", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 100,
      steer: { afterMs: 40, text: "FINALIZE_NOW", shouldSteer: (snapshot) => snapshot.silentMs < 10 },
    }),
    (error) => error.code === "TURN_HARD_TIMEOUT"
      && error.steering.attempted === false
      && error.steering.skippedReason === "worker_not_active",
  );
});

test("invalid structured output preserves usage for bounded recovery", async (t) => {
  const client = await clientForTest(t);
  await assert.rejects(
    client.runTurn({
      threadId: "fake-thread", text: "INVALID", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
    }),
    (error) => error.code === "INVALID_STRUCTURED_OUTPUT" && error.usage.last.inputTokens === 100,
  );
});
