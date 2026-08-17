import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import path from "node:path";
import { PassThrough } from "node:stream";
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

class LateUsageChild extends EventEmitter {
  constructor({ completionDelay = 10, usageDelay = 25, orphanDelay = 180, activityDelays = [] } = {}) {
    super();
    this.pid = 42_424;
    this.exitCode = null;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.turnId = "late-usage-turn";
    this.completionDelay = completionDelay;
    this.usageDelay = usageDelay;
    this.orphanDelay = orphanDelay;
    this.activityDelays = activityDelays;
    this.interrupts = 0;
    this.timers = [];
    this.stdin = { write: (line) => this.#handle(JSON.parse(line)) };
  }

  #send(message) {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify(message)}\n`));
  }

  #handle(message) {
    if (message.id == null) return;
    if (message.method === "initialize") return this.#send({ jsonrpc: "2.0", id: message.id, result: {} });
    if (message.method === "thread/start") return this.#send({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "late-thread" } } });
    if (message.method === "turn/interrupt") {
      this.interrupts += 1;
      return this.#send({ jsonrpc: "2.0", id: message.id, result: {} });
    }
    if (message.method !== "turn/start") return this.#send({ jsonrpc: "2.0", id: message.id, result: {} });

    this.#send({ jsonrpc: "2.0", id: message.id, result: { turn: { id: this.turnId } } });
    const usage = { last: { inputTokens: 321, cachedInputTokens: 300, outputTokens: 21, reasoningOutputTokens: 7, totalTokens: 342 } };
    const schedule = (delay, notification) => {
      const timer = setTimeout(() => this.#send(notification()), delay);
      this.timers.push(timer);
    };
    if (this.completionDelay != null) {
      schedule(this.completionDelay, () => ({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {
          turn: {
            id: this.turnId,
            status: "completed",
            durationMs: this.completionDelay,
            items: [{ type: "agentMessage", phase: "final_answer", text: JSON.stringify({ ok: true }) }],
          },
        },
      }));
    }
    schedule(this.usageDelay, () => ({
      jsonrpc: "2.0",
      method: "thread/tokenUsage/updated",
      params: { turnId: this.turnId, tokenUsage: usage },
    }));
    if (this.orphanDelay != null) {
      schedule(this.orphanDelay, () => ({
        jsonrpc: "2.0",
        method: "thread/tokenUsage/updated",
        params: { turnId: this.turnId, tokenUsage: { last: { inputTokens: 999 } } },
      }));
    }
    for (const delay of this.activityDelays) {
      schedule(delay, () => ({
        jsonrpc: "2.0",
        method: "item/started",
        params: { turnId: this.turnId, item: { id: `item-${delay}` } },
      }));
    }
  }

  kill() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.exitCode = 0;
    queueMicrotask(() => this.emit("exit", 0, "SIGTERM"));
  }
}

test("a renewable turn cannot outlive its total execution budget", async (t) => {
  const child = new LateUsageChild({
    completionDelay: 220,
    usageDelay: 45,
    orphanDelay: null,
    activityDelays: [10, 30, 50, 70, 90, 110],
  });
  const client = new AppServerClient({
    executable: "fake-app-server",
    platform: "linux",
    spawnImpl: () => child,
  });
  await client.start();
  t.after(() => client.close());
  const maxElapsedMs = 85;
  const checkElapsed = [];
  await assert.rejects(
    client.runTurn({
      threadId: "late-thread", text: "BUDGET", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
      watchdog: {
        renewable: true,
        afterMs: 20,
        repeatMs: 20,
        maxElapsedMs,
        onCheck: async (snapshot) => {
          checkElapsed.push(snapshot.elapsedMs);
          return { action: "continue", confidence: "high", reason: "recent activity", source: "test-supervisor" };
        },
      },
    }),
    (error) => {
      assert.equal(error.code, "EXECUTION_BUDGET_EXCEEDED");
      assert.ok(error.activity.elapsedMs >= maxElapsedMs);
      assert.ok(error.activity.eventCount >= 1);
      assert.equal(error.usage.last.inputTokens, 321);
      return true;
    },
  );
  assert.ok(checkElapsed.length >= 1);
  assert.ok(checkElapsed.every((elapsedMs) => elapsedMs < maxElapsedMs));
  assert.equal(child.interrupts, 1);
});

test("completion observed during a slow watchdog check wins over the execution budget", async (t) => {
  const child = new LateUsageChild({
    completionDelay: 45,
    usageDelay: 25,
    orphanDelay: null,
  });
  const client = new AppServerClient({
    executable: "fake-app-server",
    platform: "linux",
    spawnImpl: () => child,
  });
  await client.start();
  t.after(() => client.close());
  const run = await client.runTurn({
    threadId: "late-thread", text: "BUDGET_COMPLETION_RACE", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
    watchdog: {
      renewable: true,
      afterMs: 20,
      repeatMs: 20,
      maxElapsedMs: 85,
      onCheck: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { action: "continue", confidence: "high", reason: "slow check", source: "test-supervisor" };
      },
    },
  });
  assert.equal(run.output.ok, true);
  assert.equal(child.interrupts, 0);
});

test("a supervisor interruption is sent at most once during error cleanup", async (t) => {
  const child = new LateUsageChild({
    completionDelay: 220,
    usageDelay: 25,
    orphanDelay: null,
  });
  const client = new AppServerClient({
    executable: "fake-app-server",
    platform: "linux",
    spawnImpl: () => child,
  });
  await client.start();
  t.after(() => client.close());
  await assert.rejects(
    client.runTurn({
      threadId: "late-thread", text: "SUPERVISOR_INTERRUPT_ONCE", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
      watchdog: {
        afterMs: 20,
        onCheck: async () => ({ action: "interrupt", confidence: "high", reason: "stalled", source: "test-supervisor" }),
      },
    }),
    (error) => error.code === "SUPERVISOR_INTERRUPTED",
  );
  assert.equal(child.interrupts, 1);
});

test("completion settles briefly for late usage and drops post-finalization orphans", async (t) => {
  const client = new AppServerClient({
    executable: "fake-app-server",
    platform: "linux",
    spawnImpl: () => new LateUsageChild(),
  });
  await client.start();
  t.after(() => client.close());
  const startedAt = Date.now();
  const run = await client.runTurn({
    threadId: "late-thread", text: "LATE_USAGE", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 500,
  });
  assert.equal(run.usage.last.inputTokens, 321);
  assert.equal(run.activity.usage.last.inputTokens, 321);
  assert.ok(Date.now() - startedAt < 250);
  assert.equal(client.latestUsage.size, 0);
  assert.equal(client.completedTurns.size, 0);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(client.latestUsage.size, 0);
  assert.equal(client.completedTurns.size, 0);
});

test("a timed-out turn settles late failure usage before finalization", async (t) => {
  const client = new AppServerClient({
    executable: "fake-app-server",
    platform: "linux",
    spawnImpl: () => new LateUsageChild({ completionDelay: null, usageDelay: 60, orphanDelay: null }),
  });
  await client.start();
  t.after(() => client.close());
  await assert.rejects(
    client.runTurn({
      threadId: "late-thread", text: "NO_COMPLETION_LATE_USAGE", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 40,
    }),
    (error) => error.code === "TURN_HARD_TIMEOUT" && error.usage?.last?.inputTokens === 321,
  );
  assert.equal(client.latestUsage.size, 0);
  assert.equal(client.completedTurns.size, 0);
});

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

test("renewable liveness lets an active worker finish beyond the fixed completion window", async (t) => {
  const client = await clientForTest(t);
  let checks = 0;
  const startedAt = Date.now();
  const run = await client.runTurn({
    threadId: "fake-thread", text: "RENEWABLE_COMPLETE", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 80,
    watchdog: {
      renewable: true,
      afterMs: 50,
      repeatMs: 40,
      onCheck: async (snapshot) => {
        checks += 1;
        assert.ok(snapshot.eventCount > 0);
        return { action: "continue", confidence: "high", reason: "activity renews the lease", source: "activity" };
      },
    },
  });
  assert.equal(run.output.ok, true);
  assert.ok(Date.now() - startedAt >= 200);
  assert.ok(checks >= 3);
});

test("renewable liveness repeats checks and interrupts only a judged stall", async (t) => {
  const client = await clientForTest(t);
  let checks = 0;
  await assert.rejects(
    client.runTurn({
      threadId: "fake-thread", text: "STALL", cwd: process.cwd(),
      sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 40,
      watchdog: {
        renewable: true,
        afterMs: 30,
        repeatMs: 30,
        onCheck: async () => {
          checks += 1;
          return checks < 2
            ? { action: "continue", confidence: "low", reason: "one silent sample is ambiguous", source: "test-supervisor" }
            : { action: "interrupt", confidence: "high", reason: "sustained silence across checks", source: "test-supervisor" };
        },
      },
    }),
    (error) => error.code === "SUPERVISOR_INTERRUPTED" && checks === 2,
  );
});

test("top-level turnId completion does not wait until the fixed completion window", async (t) => {
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

test("an authoritative final-answer item survives a missing turn completion", async (t) => {
  const client = await clientForTest(t);
  const run = await client.runTurn({
    threadId: "fake-thread", text: "FINAL_ITEM_ONLY", cwd: process.cwd(),
    sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: schema, timeoutMs: 100,
  });
  assert.equal(run.output.ok, true);
  assert.equal(run.activity.hasFinalAnswer, true);
  assert.equal(run.activity.lastItemType, "agentMessage");
  assert.equal(run.activity.lastItemPhase, "final_answer");
  assert.equal(run.usage.last.inputTokens, 120);
});

test("supervisor can interrupt a silent worker before the non-renewable completion window", async (t) => {
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

test("non-renewable turns retain a fixed completion window for bounded Leader calls", async (t) => {
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

test("a bounded non-renewable turn can be followed by schema recovery on the same thread", async (t) => {
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

test("Windows close terminates the standalone app-server process tree", async () => {
  const invocations = [];
  const killer = {
    once(event, listener) {
      if (event === "exit") queueMicrotask(() => listener(0, null));
      return this;
    },
  };
  const client = new AppServerClient({
    executable: "codex.exe",
    platform: "win32",
    spawnImpl(command, args, options) {
      invocations.push({ command, args, options });
      return killer;
    },
  });
  client.child = {
    pid: 4242,
    exitCode: null,
    once(event, listener) {
      if (event === "exit") queueMicrotask(() => { this.exitCode = 0; listener(0, null); });
      return this;
    },
  };
  await client.close();
  assert.deepEqual(invocations, [{
    command: "taskkill.exe",
    args: ["/PID", "4242", "/T", "/F"],
    options: { stdio: "ignore", windowsHide: true },
  }]);
  assert.equal(client.child, null);
});

test("Windows close fails loudly when the app-server never confirms exit", async () => {
  const killer = {
    once(event, listener) {
      if (event === "exit") queueMicrotask(() => listener(0, null));
      return this;
    },
  };
  const client = new AppServerClient({
    executable: "codex.exe",
    platform: "win32",
    closeTimeoutMs: 10,
    spawnImpl: () => killer,
  });
  client.child = { pid: 4242, exitCode: null, once() { return this; } };
  await assert.rejects(client.close(), /did not confirm exit/);
  assert.equal(client.child, null);
});

test("POSIX close waits for the standalone app-server exit event", async () => {
  const listeners = new Map();
  const signals = [];
  const child = {
    pid: 4242,
    exitCode: null,
    once(event, listener) { listeners.set(event, listener); return this; },
    kill(signal) {
      signals.push(signal ?? "SIGTERM");
      queueMicrotask(() => listeners.get("exit")?.(0, signal ?? "SIGTERM"));
      return true;
    },
  };
  const client = new AppServerClient({ executable: "codex", platform: "linux", closeTimeoutMs: 100 });
  client.child = child;
  await client.close();
  assert.deepEqual(signals, ["SIGTERM"]);
  assert.equal(client.child, null);
});
