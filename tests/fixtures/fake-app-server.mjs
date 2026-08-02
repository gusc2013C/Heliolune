import readline from "node:readline";

let nextTurn = 1;
const timers = new Map();
const activeByThread = new Map();

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  if (message.id == null) return;
  if (message.method === "initialize") return result(message.id, {});
  if (message.method === "thread/start") return result(message.id, { thread: { id: "fake-thread" } });
  if (message.method === "turn/interrupt") {
    for (const timer of timers.get(message.params.turnId) ?? []) clearTimeout(timer);
    timers.delete(message.params.turnId);
    activeByThread.delete(message.params.threadId);
    return result(message.id, {});
  }
  if (message.method === "turn/steer") {
    const turnId = activeByThread.get(message.params.threadId);
    if (!turnId || turnId !== message.params.expectedTurnId) {
      return send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "active turn mismatch" } });
    }
    result(message.id, { turnId });
    for (const timer of timers.get(turnId) ?? []) clearTimeout(timer);
    const scheduled = [];
    scheduled.push(setTimeout(() => send({
      jsonrpc: "2.0",
      method: "thread/tokenUsage/updated",
      params: {
        threadId: message.params.threadId,
        turnId,
        tokenUsage: { last: { inputTokens: 140, cachedInputTokens: 100, outputTokens: 15, reasoningOutputTokens: 7, totalTokens: 155 } },
      },
    }), 10));
    scheduled.push(setTimeout(() => {
      send({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {
          turn: {
            id: turnId,
            status: "completed",
            durationMs: 140,
            items: [{ type: "agentMessage", phase: "final_answer", text: JSON.stringify({ ok: true }) }],
          },
        },
      });
      activeByThread.delete(message.params.threadId);
      timers.delete(turnId);
    }, 30));
    timers.set(turnId, scheduled);
    return;
  }
  if (message.method !== "turn/start") return result(message.id, {});

  const turnId = `fake-turn-${nextTurn++}`;
  const text = message.params.input?.[0]?.text ?? "";
  result(message.id, { turn: { id: turnId } });
  activeByThread.set(message.params.threadId, turnId);
  if (text.includes("STALL")) return;

  const scheduled = [];
  const activityDelays = text.includes("ACTIVE_TIMEOUT") ? [10, 25, 40, 55, 70, 85, 100, 115] : [10, 25, 40, 55, 70];
  for (const delay of activityDelays) {
    scheduled.push(setTimeout(() => send({
      jsonrpc: "2.0",
      method: "item/started",
      params: { threadId: message.params.threadId, turnId, item: { id: `item-${delay}` } },
    }), delay));
  }
  scheduled.push(setTimeout(() => {
    send({
      jsonrpc: "2.0",
      method: "thread/tokenUsage/updated",
      params: {
        threadId: message.params.threadId,
        turnId,
        tokenUsage: { last: { inputTokens: 100, cachedInputTokens: 80, outputTokens: 10, reasoningOutputTokens: 5, totalTokens: 110 } },
      },
    });
  }, 75));
  if (text.includes("ACTIVE_TIMEOUT")) {
    timers.set(turnId, scheduled);
    return;
  }
  scheduled.push(setTimeout(() => {
    const topLevelTurnId = text.includes("TOP_LEVEL_TURN_ID");
    send({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        ...(topLevelTurnId ? { turnId } : {}),
        turn: {
          ...(topLevelTurnId ? {} : { id: turnId }),
          status: "completed",
          durationMs: 90,
          items: [{ type: "agentMessage", phase: "final_answer", text: text.includes("INVALID") ? "not-json" : JSON.stringify({ ok: true }) }],
        },
      },
    });
    timers.delete(turnId);
    activeByThread.delete(message.params.threadId);
  }, 90));
  timers.set(turnId, scheduled);
});
