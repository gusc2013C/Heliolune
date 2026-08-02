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
