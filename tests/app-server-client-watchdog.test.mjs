import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_SERVER_WINDOWS_HIDDEN,
  AppServerClient,
  BURST_THREADS_EPHEMERAL,
  compactStatusExplanation,
  notificationTurnId,
  workerShellPath,
} from "../plugins/luna-pool-orchestrator/scripts/app-server-client.mjs";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-app-server.mjs");
const schema = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } };

test("worker status explanations are compact natural-language summaries", () => {
  assert.equal(compactStatusExplanation("  Inspecting   the repository now.  "), "Inspecting the repository now.");
  const bounded = compactStatusExplanation("x".repeat(500), 80);
  assert.equal(bounded.length, 80);
  assert.match(bounded, /…$/);
});

test("turn completion IDs support both app-server notification shapes", () => {
  assert.equal(notificationTurnId({ params: { turn: { id: "nested" } } }), "nested");
  assert.equal(notificationTurnId({ params: { turnId: "top-level", turn: {} } }), "top-level");
});

test("standalone app-server stays hidden and burst threads stay ephemeral", () => {
  assert.equal(APP_SERVER_WINDOWS_HIDDEN, true);
  assert.equal(BURST_THREADS_EPHEMERAL, true);
});

test("worker PATH prefers the bundled Codex runtime over stale environment shims", () => {
  const inherited = [
    "C:\\Users\\person\\.gaia\\venv\\Scripts",
    "C:\\Users\\person\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\bin\\override",
    "C:\\Program Files\\Git\\cmd",
  ].join(path.delimiter);
  const entries = workerShellPath(inherited).split(path.delimiter);
  assert.equal(entries[1], "C:\\Users\\person\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python");
  assert.ok(entries.indexOf("C:\\Users\\person\\.gaia\\venv\\Scripts") > entries.indexOf("C:\\Users\\person\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python"));
});

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

test("top-level turnId completion does not wait until the hard timeout", async (t) => {
  const client = await clientForTest(t);
  const startedAt = Date.now();
  const run = await client.runTurn({
    threadId: "fake-thread", text: "TOP_LEVEL_TURN_ID", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
  });
  assert.equal(run.output.ok, true);
  assert.ok(Date.now() - startedAt < 400);
  assert.equal(run.activity.lastMethod, "turn/completed");
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
    (error) => error.code === "TURN_HARD_TIMEOUT"
      && error.missingCompletion === true
      && error.activity.eventCount === 0,
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
      return error.code === "TURN_HARD_TIMEOUT"
        && error.missingCompletion === true
        && error.activity.eventCount > 0
        && error.usage.last.inputTokens === 100;
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

test("a worker that ignores finalization steering is interrupted early for bounded synthesis", async (t) => {
  const client = await clientForTest(t);
  await assert.rejects(
    client.runTurn({
      threadId: "fake-thread", text: "ACTIVE_TIMEOUT IGNORE_STEER", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 3_000,
      steer: { afterMs: 50, forceAfterMs: 40, text: "FINALIZE_NOW" },
    }),
    (error) => error.code === "FINALIZATION_INTERRUPTED"
      && error.steering.accepted === true
      && error.steering.forced === true,
  );
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
