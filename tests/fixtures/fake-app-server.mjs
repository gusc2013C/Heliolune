import readline from "node:readline";

let nextTurn = 1;
const timers = new Map();

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
    return result(message.id, {});
  }
  if (message.method !== "turn/start") return result(message.id, {});

  const turnId = `fake-turn-${nextTurn++}`;
  const text = message.params.input?.[0]?.text ?? "";
  result(message.id, { turn: { id: turnId } });
  if (text.includes("STALL")) return;

  const scheduled = [];
  for (const delay of [10, 25, 40, 55, 70]) {
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
  scheduled.push(setTimeout(() => {
    send({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        turn: {
          id: turnId,
          status: "completed",
          durationMs: 90,
          items: [{ type: "agentMessage", phase: "final_answer", text: JSON.stringify({ ok: true }) }],
        },
      },
    });
    timers.delete(turnId);
  }, 90));
  timers.set(turnId, scheduled);
});
