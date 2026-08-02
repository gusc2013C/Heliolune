import readline from "node:readline";
import { waitForJobRecord } from "./job-files.mjs";

const VERSION = "0.6.3";
const TOOL = {
  name: "await_task",
  title: "Await Heliolune task",
  description: "Block once on a job returned by luna-pool.start_task or start_batch and return its compact terminal bundle to Sol. Never call more than once for the same job.",
  inputSchema: {
    type: "object", additionalProperties: false,
    required: ["jobId"],
    properties: {
      jobId: { type: "string", minLength: 36, maxLength: 36 },
      timeoutSeconds: { type: "integer", minimum: 30, maximum: 4200, default: 3900 },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  if (message.id == null) return;
  try {
    if (message.method === "initialize") {
      send({ jsonrpc: "2.0", id: message.id, result: {
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "heliolune-await", version: VERSION },
      } });
      return;
    }
    if (message.method === "ping") {
      send({ jsonrpc: "2.0", id: message.id, result: {} });
      return;
    }
    if (message.method === "tools/list") {
      send({ jsonrpc: "2.0", id: message.id, result: { tools: [TOOL] } });
      return;
    }
    if (message.method === "tools/call" && message.params?.name === "await_task") {
      const args = message.params.arguments ?? {};
      const result = await waitForJobRecord(args.jobId, { timeoutMs: (args.timeoutSeconds ?? 3900) * 1000 });
      send({ jsonrpc: "2.0", id: message.id, result: {
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: false,
      } });
      return;
    }
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
  } catch (error) {
    send({ jsonrpc: "2.0", id: message.id, result: {
      content: [{ type: "text", text: JSON.stringify({ status: "error", message: error.message }) }],
      isError: true,
    } });
  }
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  try { void handle(JSON.parse(line)); } catch { /* ignore malformed transport lines */ }
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
