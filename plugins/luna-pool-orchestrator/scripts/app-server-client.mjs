import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const APP_NAME = "luna-pool-orchestrator";
const APP_VERSION = "0.6.4";
const COMPACT_BASE_INSTRUCTIONS = `You are a bounded repository worker controlled by another model. Work directly in the assigned repository using available local tools. Inspect before changing, preserve unrelated edits, keep scope narrow, and validate claims with evidence. Obey the active sandbox and approval policy. Do not contact external systems or delegate work. Your final response must satisfy the supplied JSON schema exactly.`;

export const APP_SERVER_WINDOWS_HIDDEN = true;
export const BURST_THREADS_EPHEMERAL = true;

function uniquePathEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry) return false;
    const key = process.platform === "win32" ? entry.toLowerCase() : entry;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function workerShellPath(inheritedPath = process.env.PATH ?? "") {
  const inherited = inheritedPath.split(path.delimiter).filter(Boolean);
  const overrideBin = inherited.find((entry) => entry.replaceAll("/", "\\").toLowerCase().endsWith("\\dependencies\\bin\\override"));
  const dependencies = overrideBin ? path.dirname(path.dirname(overrideBin)) : null;
  const bundled = dependencies ? [
    path.join(dependencies, "python"),
    path.join(dependencies, "node", "bin"),
    path.join(dependencies, "bin", "override"),
    path.join(dependencies, "bin", "fallback"),
    path.join(dependencies, "native", "git", "cmd"),
  ] : [];
  const platformTools = process.platform === "win32"
    ? ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0"]
    : [];
  return uniquePathEntries([
    ...platformTools,
    ...bundled,
    ...inherited.filter((entry) => !entry.toLowerCase().includes("windowsapps")),
  ]).join(path.delimiter);
}

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
    const safePath = workerShellPath();
    this.child = spawn(this.executable, [
      ...this.executableArgs,
      "-c", `shell_environment_policy.set.PATH=${JSON.stringify(safePath)}`,
      "-c", "mcp_servers.node_repl.enabled=false",
      "-c", "mcp_servers.serena.enabled=false",
      "-c", "mcp_servers.context7.enabled=false",
      "app-server", "--listen", "stdio://",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: APP_SERVER_WINDOWS_HIDDEN,
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
      for (const waiter of this.waiters) {
        clearTimeout(waiter.timer);
        waiter.signal?.removeEventListener("abort", waiter.onAbort);
        waiter.reject(error);
      }
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
      if (message.method === "item/completed") {
        activity.lastItemType = message.params?.item?.type ?? null;
        activity.lastItemPhase = message.params?.item?.phase ?? null;
        if (message.params?.item?.type === "agentMessage" && message.params?.item?.phase === "final_answer") {
          activity.finalAnswerItem = message.params.item;
        }
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
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
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

  waitFor(predicate, timeoutMs, signal = null) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null, signal, onAbort: null };
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          this.waiters.delete(waiter);
          signal?.removeEventListener("abort", waiter.onAbort);
          reject(new Error("Timed out waiting for app-server notification"));
        }, timeoutMs);
      }
      if (signal) {
        waiter.onAbort = () => {
          this.waiters.delete(waiter);
          clearTimeout(waiter.timer);
          const error = new Error("Cancelled app-server notification wait");
          error.code = "WAIT_CANCELLED";
          reject(error);
        };
        if (signal.aborted) return waiter.onAbort();
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
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
      lastItemType: activity.lastItemType ?? null,
      lastItemPhase: activity.lastItemPhase ?? null,
      hasFinalAnswer: Boolean(activity.finalAnswerItem),
      usage: this.latestUsage.get(turnId) ?? activity.usage ?? null,
    };
  }

  async startThread({ cwd, sandbox, developerInstructions, model = "gpt-5.6-luna", ephemeral = BURST_THREADS_EPHEMERAL }) {
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

  async interruptTurn({ threadId, turnId }) {
    if (!threadId || !turnId) return false;
    await this.request("turn/interrupt", { threadId, turnId }, 10_000);
    return true;
  }

  async runTurn({ threadId, text, cwd, sandboxPolicy, outputSchema, timeoutMs, model = "gpt-5.6-luna", effort = "max", watchdog = null, onActivity = null, onStarted = null }) {
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
    }, Math.min(60_000, Math.max(1_000, timeoutMs)));
    const turnId = response.turn.id;
    const completionTimeoutMs = Math.max(1, timeoutMs - (Date.now() - startedAt));
    this.turnActivity.set(turnId, {
      startedAt,
      lastEventAt: Date.now(),
      lastMethod: "turn/start",
      eventCount: 0,
      usage: null,
      summaryIndex: null,
      summaryText: "",
      explanation: null,
      lastItemType: null,
      lastItemPhase: null,
      finalAnswerItem: null,
      onActivity,
    });
    try { onStarted?.({ threadId, turnId }); }
    catch (error) { this.log(`turn start callback failed: ${error.message}`); }
    let completed;
    let supervision = null;
    let completionOutcome = null;
    const completionAbort = new AbortController();
    try {
      const alreadyCompleted = this.completedTurns.get(turnId);
      const notificationCompletion = (alreadyCompleted
        ? Promise.resolve(alreadyCompleted)
        : this.waitFor(
          (message) => message.method === "turn/completed" && notificationTurnId(message) === turnId,
          watchdog?.renewable ? null : completionTimeoutMs,
          completionAbort.signal,
        )).then(
        (message) => ({ kind: "completed", message }),
        (error) => ({ kind: "error", error }),
      );
      const completion = notificationCompletion.then((outcome) => (completionOutcome = outcome));
      if (watchdog?.afterMs && watchdog?.onCheck) {
        let checkpointMs = watchdog.afterMs;
        while (!completed) {
          let checkpointTimer;
          const checkpoint = new Promise((resolve) => {
            checkpointTimer = setTimeout(() => resolve({ kind: "checkpoint" }), checkpointMs);
            checkpointTimer.unref?.();
          });
          const first = await Promise.race([completion, checkpoint]);
          clearTimeout(checkpointTimer);
          if (first.kind === "completed") {
            completed = first.message;
            break;
          }
          if (first.kind === "error") throw first.error;

          supervision = await watchdog.onCheck(this.turnSnapshot(turnId));
          if (completionOutcome?.kind === "completed") {
            if (supervision?.action === "interrupt") {
              supervision = {
                ...supervision,
                action: "continue",
                originalAction: "interrupt",
                reason: "Worker completed before the liveness decision returned; no interrupt was sent.",
              };
            }
            completed = completionOutcome.message;
            break;
          }
          if (completionOutcome?.kind === "error") throw completionOutcome.error;
          if (supervision?.action === "interrupt") {
            await this.request("turn/interrupt", { threadId, turnId }, 30_000).catch(() => {});
            const error = new Error(`Luna supervisor interrupted a likely stalled turn: ${supervision.reason}`);
            error.code = "SUPERVISOR_INTERRUPTED";
            error.supervision = supervision;
            throw error;
          }
          if (!watchdog.renewable) {
            const final = await completion;
            if (final.kind === "error") throw final.error;
            completed = final.message;
            break;
          }
          checkpointMs = watchdog.repeatMs ?? watchdog.afterMs;
        }
      } else {
        const final = await completion;
        if (final.kind === "error") throw final.error;
        completed = final.message;
      }
    } catch (error) {
      completionAbort.abort();
      const timedOut = error.message === "Timed out waiting for app-server notification";
      const lateCompletion = timedOut ? this.completedTurns.get(turnId) : null;
      const authoritativeFinalItem = timedOut ? this.turnActivity.get(turnId)?.finalAnswerItem : null;
      if (lateCompletion) {
        completed = lateCompletion;
      } else if (authoritativeFinalItem) {
        await this.request("turn/interrupt", { threadId, turnId }, 5_000).catch(() => {});
        completed = {
          method: "turn/completed",
          params: {
            threadId,
            turn: {
              id: turnId,
              status: "completed",
              durationMs: Date.now() - startedAt,
              items: [authoritativeFinalItem],
            },
          },
        };
      } else {
        await this.request("turn/interrupt", { threadId, turnId }, 5_000).catch(() => {});
      }
      if (timedOut && !completed) {
        error.code = "TURN_HARD_TIMEOUT";
        error.missingCompletion = !this.completedTurns.has(turnId);
      }
      if (!completed) {
        error.activity = this.turnSnapshot(turnId);
        error.usage ??= this.latestUsage.get(turnId) ?? error.activity?.usage ?? null;
        error.supervision ??= supervision;
        this.latestUsage.delete(turnId);
        this.turnActivity.delete(turnId);
        this.completedTurns.delete(turnId);
        throw error;
      }
    }
    completionAbort.abort();
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
      throw invalid;
    }
    return {
      turnId,
      durationMs: turn.durationMs ?? Date.now() - startedAt,
      usage,
      activity,
      supervision,
      output: structured,
    };
  }

  close() {
    this.child?.kill();
    this.child = null;
  }
}
