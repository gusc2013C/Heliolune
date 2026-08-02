import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const APP_NAME = "luna-pool-orchestrator";
const APP_VERSION = "0.6.0";
const COMPACT_BASE_INSTRUCTIONS = `You are a bounded repository worker controlled by another model. Work directly in the assigned repository using available local tools. Inspect before changing, preserve unrelated edits, keep scope narrow, and validate claims with evidence. Obey the active sandbox and approval policy. Do not contact external systems or delegate work. Your final response must satisfy the supplied JSON schema exactly.`;

export function compactStatusExplanation(value, maxLength = 360) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function notificationTurnId(message) {
  return message?.params?.turn?.id ?? message?.params?.turnId ?? null;
}

function exists(file) {
  return fs.access(file).then(() => true, () => false);
}

export async function resolveCodexExecutable() {
  for (const candidate of [process.env.CODEX_APP_SERVER_EXECUTABLE, process.env.CODEX_EXECUTABLE, process.env.CODEX_CLI_PATH]) {
    if (!candidate || !(await exists(candidate))) continue;
    if (candidate.toLowerCase().includes("\\windowsapps\\")) continue;
    return candidate;
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    const architecture = process.arch === "arm64" ? ["arm64", "aarch64-pc-windows-msvc"] : ["x64", "x86_64-pc-windows-msvc"];
    const npmNative = path.join(
      process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "node_modules", "@openai",
      `codex-win32-${architecture[0]}`, "vendor", architecture[1], "bin", "codex.exe",
    );
    if (await exists(npmNative)) return npmNative;
  }
  return "codex";
}

export class AppServerClient {
  constructor({ executable, executableArgs = [], log = () => {} }) {
    this.executable = executable;
    this.executableArgs = executableArgs;
    this.log = log;
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = new Set();
    this.latestUsage = new Map();
    this.turnActivity = new Map();
    this.completedTurns = new Map();
    this.child = null;
  }

  async start() {
    if (this.child) return;
    const inheritedPath = process.env.PATH ?? "";
    const safePath = [
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
      ...inheritedPath.split(path.delimiter).filter((entry) => entry && !entry.toLowerCase().includes("windowsapps")),
    ].join(path.delimiter);
    this.child = spawn(this.executable, [
      ...this.executableArgs,
      "-c", "mcp_servers.node_repl.enabled=false",
      "-c", "mcp_servers.serena.enabled=false",
      "-c", "mcp_servers.context7.enabled=false",
      "app-server", "--listen", "stdio://",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, PATH: safePath },
    });
    this.child.on("error", (error) => {
      const wrapped = new Error(`Unable to start a standalone Codex CLI (${this.executable}). Install the official @openai/codex CLI outside WindowsApps or set CODEX_APP_SERVER_EXECUTABLE. ${error.message}`);
      for (const pending of this.pending.values()) pending.reject(wrapped);
      this.pending.clear();
    });
    this.child.on("exit", (code, signal) => {
      const error = new Error(`Codex app-server exited (code=${code}, signal=${signal})`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      for (const waiter of this.waiters) waiter.reject(error);
      this.waiters.clear();
      this.child = null;
    });
    this.child.stderr.on("data", (chunk) => this.log(`app-server: ${String(chunk).trimEnd()}`));
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => this.#onLine(line));

    await this.request("initialize", {
      clientInfo: { name: APP_NAME, version: APP_VERSION },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  #onLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.log(`invalid app-server JSON: ${error.message}`);
      return;
    }
    if (message.id != null && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (message.id != null && message.method) {
      this.child?.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Unsupported app-server callback: ${message.method}` },
      })}\n`);
      return;
    }
    if (message.method === "thread/tokenUsage/updated") {
      this.latestUsage.set(message.params.turnId, message.params.tokenUsage);
    }
    const activityTurnId = notificationTurnId(message);
    if (message.method === "turn/completed" && activityTurnId) {
      this.completedTurns.set(activityTurnId, message);
      while (this.completedTurns.size > 32) this.completedTurns.delete(this.completedTurns.keys().next().value);
    }
    if (activityTurnId && this.turnActivity.has(activityTurnId)) {
      const activity = this.turnActivity.get(activityTurnId);
      if (message.method === "item/reasoning/summaryPartAdded") {
        activity.summaryIndex = message.params?.summaryIndex ?? 0;
        activity.summaryText = "";
      } else if (message.method === "item/reasoning/summaryTextDelta") {
        const summaryIndex = message.params?.summaryIndex ?? 0;
        if (activity.summaryIndex !== summaryIndex) {
          activity.summaryIndex = summaryIndex;
          activity.summaryText = "";
        }
        activity.summaryText = `${activity.summaryText}${message.params?.delta ?? ""}`.slice(-2_000);
        activity.explanation = compactStatusExplanation(activity.summaryText);
      }
      activity.lastEventAt = Date.now();
      activity.lastMethod = message.method;
      activity.eventCount += 1;
      activity.usage = this.latestUsage.get(activityTurnId) ?? activity.usage;
      try { activity.onActivity?.(this.turnSnapshot(activityTurnId)); }
      catch (error) { this.log(`activity callback failed: ${error.message}`); }
    }
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(message)) continue;
      this.waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }

  request(method, params = {}, timeoutMs = 30_000) {
    if (!this.child) throw new Error("app-server is not running");
    const id = this.nextId++;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`app-server request timed out: ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  notify(method, params = {}) {
    if (!this.child) throw new Error("app-server is not running");
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  waitFor(predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error("Timed out waiting for app-server notification"));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  turnSnapshot(turnId) {
    const activity = this.turnActivity.get(turnId);
    if (!activity) return null;
    const now = Date.now();
    return {
      turnId,
      startedAt: activity.startedAt,
      lastEventAt: activity.lastEventAt,
      elapsedMs: now - activity.startedAt,
      silentMs: now - activity.lastEventAt,
      eventCount: activity.eventCount,
      lastMethod: activity.lastMethod,
      explanation: activity.explanation ?? null,
      usage: this.latestUsage.get(turnId) ?? activity.usage ?? null,
    };
  }

  async startThread({ cwd, sandbox, developerInstructions, model = "gpt-5.6-luna", ephemeral = true }) {
    const response = await this.request("thread/start", {
      model,
      ephemeral,
      cwd,
      runtimeWorkspaceRoots: [cwd],
      sandbox,
      approvalPolicy: "never",
      approvalsReviewer: "auto_review",
      baseInstructions: COMPACT_BASE_INSTRUCTIONS,
      developerInstructions,
      dynamicTools: [],
      environments: [],
      selectedCapabilityRoots: [],
    }, 60_000);
    return response.thread.id;
  }

  async resumeThread({ threadId, cwd, sandbox, developerInstructions, model = "gpt-5.6-luna" }) {
    const response = await this.request("thread/resume", {
      threadId,
      model,
      cwd,
      runtimeWorkspaceRoots: [cwd],
      sandbox,
      approvalPolicy: "never",
      approvalsReviewer: "auto_review",
      baseInstructions: COMPACT_BASE_INSTRUCTIONS,
      developerInstructions,
      excludeTurns: true,
    }, 60_000);
    return response.thread.id;
  }

  async runTurn({ threadId, text, cwd, sandboxPolicy, outputSchema, timeoutMs, model = "gpt-5.6-luna", effort = "max", watchdog = null, steer = null, onActivity = null }) {
    const startedAt = Date.now();
    const response = await this.request("turn/start", {
      threadId,
      input: [{ type: "text", text }],
      model,
      effort,
      summary: "concise",
      cwd,
      runtimeWorkspaceRoots: [cwd],
      approvalPolicy: "never",
      approvalsReviewer: "auto_review",
      sandboxPolicy,
      outputSchema,
      responsesapiClientMetadata: { orchestrator: APP_NAME, lane: model },
    }, 60_000);
    const turnId = response.turn.id;
    this.turnActivity.set(turnId, {
      startedAt,
      lastEventAt: Date.now(),
      lastMethod: "turn/start",
      eventCount: 0,
      usage: null,
      summaryIndex: null,
      summaryText: "",
      explanation: null,
      onActivity,
    });
    let completed;
    let supervision = null;
    let completionOutcome = null;
    const steering = {
      scheduled: Boolean(steer?.afterMs && steer?.text),
      attempted: false,
      accepted: false,
      error: null,
      skippedReason: null,
    };
    let steerTimer = null;
    try {
      const alreadyCompleted = this.completedTurns.get(turnId);
      const completion = (alreadyCompleted
        ? Promise.resolve(alreadyCompleted)
        : this.waitFor(
          (message) => message.method === "turn/completed" && notificationTurnId(message) === turnId,
          timeoutMs,
        )).then(
        (message) => (completionOutcome = { kind: "completed", message }),
        (error) => (completionOutcome = { kind: "error", error }),
      );
      if (steering.scheduled) {
        steerTimer = setTimeout(async () => {
          if (completionOutcome) return;
          if (steer.shouldSteer && !steer.shouldSteer(this.turnSnapshot(turnId))) {
            steering.skippedReason = "worker_not_active";
            try { steer.onStatus?.({ phase: "skipped", steering, snapshot: this.turnSnapshot(turnId) }); }
            catch (error) { this.log(`steering status callback failed: ${error.message}`); }
            return;
          }
          steering.attempted = true;
          try { steer.onStatus?.({ phase: "attempted", steering, snapshot: this.turnSnapshot(turnId) }); }
          catch (error) { this.log(`steering status callback failed: ${error.message}`); }
          try {
            await this.request("turn/steer", {
              threadId,
              expectedTurnId: turnId,
              input: [{ type: "text", text: steer.text }],
              responsesapiClientMetadata: { orchestrator: APP_NAME, phase: "reserved-finalization" },
            }, 5_000);
            steering.accepted = true;
            try { steer.onStatus?.({ phase: "accepted", steering, snapshot: this.turnSnapshot(turnId) }); }
            catch (error) { this.log(`steering status callback failed: ${error.message}`); }
          } catch (error) {
            steering.error = error.message;
            try { steer.onStatus?.({ phase: "failed", steering, snapshot: this.turnSnapshot(turnId) }); }
            catch (callbackError) { this.log(`steering status callback failed: ${callbackError.message}`); }
          }
        }, steer.afterMs);
        steerTimer.unref?.();
      }
      if (watchdog?.afterMs && watchdog?.onCheck) {
        let softTimer;
        const soft = new Promise((resolve) => {
          softTimer = setTimeout(() => resolve({ kind: "soft-timeout" }), watchdog.afterMs);
          softTimer.unref?.();
        });
        const first = await Promise.race([completion, soft]);
        clearTimeout(softTimer);
        if (first.kind === "soft-timeout") {
          supervision = await watchdog.onCheck(this.turnSnapshot(turnId));
          if (completionOutcome?.kind === "completed") {
            if (supervision?.action === "interrupt") {
              supervision = {
                ...supervision,
                action: "continue",
                originalAction: "interrupt",
                reason: "Worker completed before the supervisor decision returned; no interrupt was sent.",
              };
            }
            completed = completionOutcome.message;
          } else if (completionOutcome?.kind === "error") {
            throw completionOutcome.error;
          } else if (supervision?.action === "interrupt") {
            if (steering.accepted) {
              supervision = {
                ...supervision,
                action: "continue",
                originalAction: "interrupt",
                reason: "The active turn accepted finalization steering after the supervisor snapshot; keep the original hard deadline.",
              };
            }
          }
          if (!completed && supervision?.action === "interrupt") {
            await this.request("turn/interrupt", { threadId, turnId }, 30_000).catch(() => {});
            const error = new Error(`Luna supervisor interrupted a likely stalled turn: ${supervision.reason}`);
            error.code = "SUPERVISOR_INTERRUPTED";
            error.supervision = supervision;
            throw error;
          }
          if (!completed) {
            const final = await completion;
            if (final.kind === "error") throw final.error;
            completed = final.message;
          }
        } else if (first.kind === "error") {
          throw first.error;
        } else {
          completed = first.message;
        }
      } else {
        const final = await completion;
        if (final.kind === "error") throw final.error;
        completed = final.message;
      }
    } catch (error) {
      clearTimeout(steerTimer);
      await this.request("turn/interrupt", { threadId, turnId }, 30_000).catch(() => {});
      if (error.message === "Timed out waiting for app-server notification") error.code = "TURN_HARD_TIMEOUT";
      error.activity = this.turnSnapshot(turnId);
      error.supervision ??= supervision;
      error.steering = steering;
      this.latestUsage.delete(turnId);
      this.turnActivity.delete(turnId);
      this.completedTurns.delete(turnId);
      throw error;
    }
    clearTimeout(steerTimer);
    const turn = completed.params.turn;
    const usage = this.latestUsage.get(turnId) ?? null;
    this.latestUsage.delete(turnId);
    const activity = this.turnSnapshot(turnId);
    this.turnActivity.delete(turnId);
    this.completedTurns.delete(turnId);
    const finalItems = turn.items.filter((item) => item.type === "agentMessage" && item.phase === "final_answer");
    const fallbackItems = turn.items.filter((item) => item.type === "agentMessage");
    const textOutput = (finalItems.at(-1) ?? fallbackItems.at(-1))?.text ?? "";
    if (turn.status !== "completed") {
      const error = new Error(turn.error?.message ?? `Luna turn ended with status ${turn.status}`);
      error.code = "TURN_NOT_COMPLETED";
      error.activity = activity;
      error.usage = usage;
      error.steering = steering;
      throw error;
    }
    let structured;
    try {
      structured = JSON.parse(textOutput);
    } catch (error) {
      const invalid = new Error(`Luna returned invalid JSON: ${error.message}; output=${textOutput.slice(0, 500)}`);
      invalid.code = "INVALID_STRUCTURED_OUTPUT";
      invalid.activity = activity;
      invalid.usage = usage;
      invalid.steering = steering;
      throw invalid;
    }
    return {
      turnId,
      durationMs: turn.durationMs ?? Date.now() - startedAt,
      usage,
      activity,
      supervision,
      steering,
      output: structured,
    };
  }

  close() {
    this.child?.kill();
    this.child = null;
  }
}
