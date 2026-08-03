import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  APP_SERVER_WINDOWS_HIDDEN,
  AppServerClient,
  BURST_THREADS_EPHEMERAL,
  compactStatusExplanation,
  resolveCodexExecutable,
} from "./app-server-client.mjs";
import {
  compareModelCost,
  dashboardData,
  DEFAULT_ACTUAL_MODEL,
  DEFAULT_BASELINE_MODEL,
  normalizeUsage,
  pricingCatalog,
  recordMetrics,
  renderDashboard,
  sumUsage,
} from "./pricing.mjs";
import { classifyTurnFailure, compactSupervisorPrompt, createInactivityCircuitBreaker, shouldConsultSupervisor, supervisionSchedule } from "./supervision.mjs";
import { compactSchemaRecoveryPrompt } from "./schema-recovery.mjs";
import { buildControllerResult, compactCost, compactLeaderPrompt, compactUsage, shouldUseLeader } from "./leader.mjs";
import { createProgressReporter, weightedWorkstreamProgress, workerProgress } from "./progress.mjs";
import { createJobAwareShutdown, JobStore } from "./jobs.mjs";
import { appendRunnerDiagnostic, jobDirectory, readJobRecord, removeJobRequest, writeJobRecord, writeJobRequest } from "./job-files.mjs";
import { launchJobRunner } from "./job-runner-launch.mjs";
import { detectSystemLanguage, launchStatusWindow } from "./status-window.mjs";
import {
  SPEED_FIRST,
  TOKEN_FIRST,
  DEFAULT_PROFILE,
  adaptiveBudgets,
  batchSupervisionSchedule,
  burstLanes,
  compactBatchLeaderPrompt,
  compactBatchSupervisorPrompt,
  compactBurstTask,
  defaultParallelWorkstreams,
  mapWithConcurrency,
  speedParallelism,
  validateSpeedWorkstreams,
} from "./profiles.mjs";
import { contractGuardEscalations, withRecoveryMetadata } from "./orchestration-policy.mjs";
import {
  batchNeedsWorktrees,
  cleanupParallelWriteBatch,
  collectWorktreePatch,
  integrateParallelWriteBatch,
  prepareParallelWriteBatch,
  worktreeFor,
} from "./worktrees.mjs";

export const VERSION = "0.6.5";
export const BUILD_ID = "0.6.5-owner-heartbeat-r2";
const PROMPT_VERSION = "mcp-v15-owner-heartbeat";
const JOB_HEARTBEAT_INTERVAL_MS = 5_000;
const RUNTIME_ID = randomUUID();
const jobs = new JobStore();
const SERVER_IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const STATUS_LANGUAGE = detectSystemLanguage() === "zh-CN"
  ? "Simplified Chinese"
  : "English";
const LANES = ["core", "tests", "integration", "verifier", "supervisor"];
const LANE_FOCUS = {
  core: "Own bounded production-code analysis and implementation across the core domain.",
  tests: "Own test design, test failures, fixtures, and regression validation.",
  integration: "Own build, configuration, dependency, CLI, and cross-component integration work.",
  verifier: "Independently verify claims and patches. Do not implement unless the task explicitly asks for repair.",
  supervisor: "Act as the shared operations leader: track worker liveness and compress completed worker/verifier bundles for Sol. Never inspect the repository, plan work, assign tasks, judge correctness beyond a supplied verifier verdict, or make reserved decisions.",
};

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "evidence", "changes", "checks", "risks", "needsVerifier", "needsSol"],
  properties: {
    status: {
      type: "string",
      enum: ["completed", "partial", "blocked"],
      description: "Use completed when scoped work is finished and every supplied, runnable acceptance check passes after the last edit. Unknown hidden tests are risks, not missing work. Use partial only for unfinished supplied work or a supplied check that is missing, stale, or not run.",
    },
    summary: { type: "string", maxLength: 1200 },
    evidence: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["path", "line", "claim"], properties: {
        path: { type: "string", maxLength: 300 }, line: { type: ["integer", "null"] }, claim: { type: "string", maxLength: 500 },
      } },
    },
    changes: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["path", "summary"], properties: {
        path: { type: "string", maxLength: 300 }, summary: { type: "string", maxLength: 400 },
      } },
    },
    checks: {
      type: "array", maxItems: 6,
      items: { type: "object", additionalProperties: false, required: ["name", "status", "detail"], properties: {
        name: { type: "string", maxLength: 200 }, status: { type: "string", enum: ["passed", "failed", "not_run"] }, detail: { type: "string", maxLength: 500 },
      } },
    },
    risks: {
      type: "array", maxItems: 6,
      items: { type: "object", additionalProperties: false, required: ["severity", "issue"], properties: {
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] }, issue: { type: "string", maxLength: 500 },
      } },
    },
    needsVerifier: { type: "boolean" },
    needsSol: {
      type: "array", maxItems: 4,
      items: { type: "object", additionalProperties: false, required: ["decision", "reason"], properties: {
        decision: { type: "string", maxLength: 300 }, reason: { type: "string", maxLength: 500 },
      } },
    },
  },
};

const REVIEW_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "evidence", "checks", "risks", "needsSol"],
  properties: {
    status: RESULT_SCHEMA.properties.status,
    summary: { type: "string", maxLength: 800 },
    evidence: { ...RESULT_SCHEMA.properties.evidence, maxItems: 4 },
    checks: { ...RESULT_SCHEMA.properties.checks, maxItems: 4 },
    risks: { ...RESULT_SCHEMA.properties.risks, maxItems: 4 },
    needsSol: { ...RESULT_SCHEMA.properties.needsSol, maxItems: 2 },
  },
};

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "findings", "checks", "needsSol"],
  properties: {
    verdict: { type: "string", enum: ["pass", "fail", "inconclusive"] },
    summary: { type: "string" },
    findings: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["severity", "path", "line", "issue"], properties: {
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        path: { type: "string" }, line: { type: ["integer", "null"] }, issue: { type: "string" },
      } },
    },
    checks: {
      type: "array", maxItems: 6,
      items: { type: "object", additionalProperties: false, required: ["name", "status", "detail"], properties: {
        name: { type: "string" }, status: { type: "string", enum: ["passed", "failed", "not_run"] }, detail: { type: "string" },
      } },
    },
    needsSol: {
      type: "array", maxItems: 4,
      items: { type: "object", additionalProperties: false, required: ["decision", "reason"], properties: {
        decision: { type: "string" }, reason: { type: "string" },
      } },
    },
  },
};

const SUPERVISOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "confidence", "reason"],
  properties: {
    action: { type: "string", enum: ["continue", "interrupt"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    reason: { type: "string", maxLength: 500 },
  },
};

const LEADER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "brief", "evidence", "changes", "checks", "risks", "escalations", "confidence"],
  properties: {
    status: { type: "string", enum: ["completed", "partial", "blocked", "verification_failed"] },
    brief: { type: "string", maxLength: 400 },
    evidence: {
      type: "array", maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["path", "line", "claim"], properties: {
        path: { type: "string" }, line: { type: ["integer", "null"] }, claim: { type: "string" },
      } },
    },
    changes: {
      type: "array", maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["path", "summary"], properties: {
        path: { type: "string" }, summary: { type: "string" },
      } },
    },
    checks: {
      type: "array", maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["name", "status", "detail"], properties: {
        name: { type: "string" }, status: { type: "string", enum: ["passed", "failed", "not_run"] }, detail: { type: "string" },
      } },
    },
    risks: {
      type: "array", maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["severity", "issue"], properties: {
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] }, issue: { type: "string" },
      } },
    },
    escalations: {
      type: "array", maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["decision", "reason"], properties: {
        decision: { type: "string" }, reason: { type: "string" },
      } },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

const BATCH_LEADER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brief", "outcomes", "evidence", "risks", "escalations", "confidence"],
  properties: {
    brief: { type: "string", maxLength: 1200 },
    outcomes: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["id", "status", "summary"], properties: {
        id: { type: "string", maxLength: 80 }, status: { type: "string", enum: ["completed", "partial", "blocked", "failed"] }, summary: { type: "string", maxLength: 400 },
      } },
    },
    evidence: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["path", "line", "claim"], properties: {
        path: { type: "string", maxLength: 300 }, line: { type: ["integer", "null"] }, claim: { type: "string", maxLength: 500 },
      } },
    },
    risks: {
      type: "array", maxItems: 6,
      items: { type: "object", additionalProperties: false, required: ["severity", "issue"], properties: {
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] }, issue: { type: "string", maxLength: 500 },
      } },
    },
    escalations: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["decision", "reason"], properties: {
        decision: { type: "string", maxLength: 300 }, reason: { type: "string", maxLength: 500 },
      } },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

const BATCH_SUPERVISOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "decisions"],
  properties: {
    summary: { type: "string", maxLength: 500 },
    decisions: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["slot", "action", "confidence", "reason"], properties: {
        slot: { type: "string", maxLength: 40 },
        action: { type: "string", enum: ["continue", "interrupt"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        reason: { type: "string", maxLength: 300 },
      } },
    },
  },
};

const RUN_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cwd", "lane", "mode", "objective", "acceptance", "scope"],
  properties: {
    cwd: { type: "string", description: "Absolute repository path." },
    lane: { type: "string", enum: ["core", "tests", "integration"] },
    mode: { type: "string", enum: ["analyze", "implement", "repair"] },
    objective: { type: "string", maxLength: 2000, description: "Compact outcome; omit file contents and stable background." },
    acceptance: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 500 } },
    repoState: { type: "string", maxLength: 1000, description: "Only volatile state such as commit, failing command, or dirty paths." },
    scope: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", maxLength: 300 } },
    risk: { type: "string", enum: ["low", "moderate", "high"], default: "moderate" },
    reservedBoundary: { type: "boolean", default: false, description: "True for architecture, security boundary, public API, or irreversible migration." },
    profile: { type: "string", enum: ["speed-first", "token-first"], default: "speed-first", description: "Use token-first only when isolated writes are unsafe." },
    maxFiles: { type: "integer", minimum: 3, maximum: 30 },
    maxCommands: { type: "integer", minimum: 3, maximum: 50 },
  },
};

const BATCH_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cwd", "workstreams"],
  properties: {
    cwd: { type: "string", description: "Absolute repository path." },
    parallelism: { type: "integer", enum: [4, 8], default: 4, description: "Eight is experimental and has higher tail variance." },
    workstreams: {
      type: "array", minItems: 2, maxItems: 8, description: "Independent Sol-defined streams; writes need clean Git and disjoint scopes.",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "lane", "objective", "acceptance", "scope"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80 },
          lane: { type: "string", enum: ["core", "tests", "integration", "verifier"] },
          mode: { type: "string", enum: ["analyze", "implement", "repair"], default: "analyze" },
          objective: { type: "string", maxLength: 1200 },
          acceptance: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", maxLength: 300 } },
          scope: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", maxLength: 300 } },
          repoState: { type: "string", maxLength: 500 },
          risk: { type: "string", enum: ["low", "moderate", "high"], default: "moderate" },
          reservedBoundary: { type: "boolean", default: false },
        },
      },
    },
    checkpointSeconds: { type: "integer", minimum: 30, maximum: 90, default: 90, description: "First renewable liveness check; never an execution deadline." },
    maxFiles: { type: "integer", minimum: 3, maximum: 30 },
    maxCommands: { type: "integer", minimum: 3, maximum: 50 },
  },
};

const DASHBOARD_INPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["cwd"],
  properties: {
    cwd: { type: "string", description: "Absolute repository path." },
    baselineModel: { type: "string", default: DEFAULT_BASELINE_MODEL, description: "Model used only for the raw same-token pricing-sensitivity field; visible savings use the historical benchmark profile." },
    format: { type: "string", enum: ["markdown", "json"], default: "markdown" },
    includePricing: { type: "boolean", default: false, description: "Include the full pricing catalog in JSON output." },
  },
};

const INIT_INPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["cwd"],
  properties: {
    cwd: { type: "string", description: "Absolute repository path." },
    priority: { type: "string", enum: ["token-first", "speed-first"], default: "speed-first", description: "Four-way speed-first is the default; token-first is an explicit safety fallback." },
    parallelism: { type: "integer", enum: [4, 8], default: 4, description: "Only used when priority=speed-first." },
    healthTurn: { type: "boolean", default: false, description: "Run a minimal paid Luna turn on every selected lane. False checks availability and creates/resumes sessions without a model turn." },
    checkpointSeconds: { type: "integer", minimum: 30, maximum: 90, default: 90, description: "First renewable liveness checkpoint for optional paid health turns." },
  },
};

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const LOCAL_WORK_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false };

const TOOLS = [
  {
    name: "runtime_info",
    title: "Read Heliolune runtime identity",
    description: "Return loaded version and routing identity without invoking a model.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "initialize_pool",
    title: "Initialize Heliolune pool",
    description: "Create or resume the default four/eight-worker speed-first pool or an explicit token-first fallback pool plus one shared Luna/high Leader, without changing code.",
    inputSchema: INIT_INPUT_SCHEMA,
    annotations: LOCAL_WORK_ANNOTATIONS,
  },
  {
    name: "start_batch",
    title: "Start default parallel Heliolune batch",
    description: "Advanced: run 2-8 Sol-defined streams on four or eight Luna/max slots. Writes use isolated Git worktrees. Await once.",
    inputSchema: BATCH_INPUT_SCHEMA,
    annotations: LOCAL_WORK_ANNOTATIONS,
  },
  {
    name: "start_task",
    title: "Start Heliolune task",
    description: "Default: expand one compact task into four Luna/max streams; use token-first only when write isolation is unsafe. Await once.",
    inputSchema: RUN_INPUT_SCHEMA,
    annotations: LOCAL_WORK_ANNOTATIONS,
  },
  {
    name: "pool_status",
    title: "Read Heliolune pool status",
    description: "Return persistent Luna lane IDs, prompt versions, reuse counts, context-debt metrics, and last usage without invoking a model.",
    inputSchema: { type: "object", additionalProperties: false, properties: { cwd: { type: "string" } } },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "cost_dashboard",
    title: "Read Heliolune cost dashboard",
    description: "Return cumulative worker usage, estimated cost, history-calibrated Sol-only projection and savings, cache rate, timing, and per-lane totals without invoking a model.",
    inputSchema: DASHBOARD_INPUT_SCHEMA,
    annotations: READ_ONLY_ANNOTATIONS,
  },
];

function baseInstructions(lane) {
  const burst = lane.startsWith("burst-");
  const effortGuidance = lane === "supervisor"
    ? "Use high reasoning effort for liveness classification and faithful reporting compression; do not inspect repository contents."
    : "Use maximum reasoning effort on every substantive turn.";
  const workBoundary = lane === "supervisor"
    ? "Never inspect or modify the repository, call tools, plan or assign work, or perform final acceptance. Report and compress only the task/liveness data supplied by the MCP."
    : burst
      ? "Obey the supplied workstream mode and exact scope. Mutating workstreams run only in detached isolated worktrees. Never commit, branch, merge, delegate, or coordinate other workstreams."
      : "Inspect the repository directly instead of requesting broad context from Sol. Prefer rg/rg --files and shell reads. Never use apply_patch or view_image merely to read or enumerate text files. Stop exploring as soon as acceptance has enough evidence. You may choose bounded implementation details inside the assigned objective.";
  const focus = burst
    ? "Own one Sol-defined isolated workstream in a speed-first batch. Never decompose or coordinate the wider task."
    : LANE_FOCUS[lane];
  return `You are the persistent GPT-5.6 Luna worker for lane '${lane}' under a GPT-5.6 Sol controller.\n${focus}\n${effortGuidance} ${workBoundary} Keep findings evidence-based and outputs compact. Write concise reasoning summaries in ${STATUS_LANGUAGE} so the local operations panel can explain your current work naturally. You MUST NOT independently decide architecture, security boundaries, public API contracts, or irreversible migrations; report supplied escalation needs without resolving them. Never broaden scope. Never claim a check passed unless the supplied record or a worker-run check supports it. Preserve unrelated user changes. Return only the requested JSON schema.\nPrompt contract: ${PROMPT_VERSION}. This stable role prompt must not be reinterpreted by incremental task text.`;
}

function projectKey(cwd) {
  return createHash("sha256").update(path.resolve(cwd).toLowerCase()).digest("hex").slice(0, 16);
}

function registryPath() {
  return path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "OpenAI", "Codex", "luna-pool-orchestrator", "registry.json");
}

async function readRegistry() {
  try { return JSON.parse(await fs.readFile(registryPath(), "utf8")); }
  catch { return { version: 1, projects: {} }; }
}

async function writeRegistry(registry) {
  const file = registryPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file).catch(async (error) => {
    await fs.rm(temporary, { force: true });
    throw error;
  });
}

function sandboxFor(mode, cwd) {
  return mode === "analyze"
    ? { legacy: "read-only", policy: { type: "readOnly", networkAccess: false } }
    : { legacy: "workspace-write", policy: { type: "workspaceWrite", writableRoots: [cwd], networkAccess: false } };
}

function usageBreakdown(run) {
  return normalizeUsage(run?.usage);
}

function compactTask(args) {
  return [
    `TASK_DELTA ${JSON.stringify({
      mode: args.mode,
      objective: args.objective,
      acceptance: args.acceptance,
      repoState: args.repoState || undefined,
      scope: args.scope?.length ? args.scope : undefined,
      risk: args.risk ?? "moderate",
      reservedBoundary: args.reservedBoundary ?? false,
      budget: { maxFiles: args.maxFiles ?? 12, maxCommands: args.maxCommands ?? 20 },
    })}`,
    `Work end-to-end within scope. Inspect exact repository state first. Treat scope entries as hard search boundaries. For analyze mode use shell reads only; do not use apply_patch or view_image. After ${(args.maxCommands ?? 20) - Math.ceil((args.maxCommands ?? 20) * 0.25)} tool calls at latest, stop exploration and synthesize. If scope is too broad for the budget, return status=partial with the decisive evidence already found instead of broadening or exhausting the deadline. Set needsSol=[] unless an actual reserved Sol decision blocks or materially conditions the result. Return the schema only.`,
  ].join("\n");
}

function compactVerification(args, owner) {
  const maxFiles = Math.min(args.maxFiles ?? 12, 8);
  const maxCommands = Math.min(args.maxCommands ?? 20, 12);
  return [
    `VERIFY_DELTA ${JSON.stringify({
      objective: args.objective,
      acceptance: args.acceptance,
      repoState: args.repoState || undefined,
      scope: args.scope?.length ? args.scope : undefined,
      budget: { maxFiles, maxCommands },
      owner: {
        status: owner.status,
        summary: owner.summary,
        changePaths: owner.changes?.map((change) => change.path) ?? [],
        failedChecks: owner.checks?.filter((check) => check.status === "failed").map((check) => check.name) ?? [],
        risks: owner.risks ?? [],
      },
    })}`,
    `Independently inspect repository state and try to falsify the owner's decisive claims. Treat scope as a hard boundary. Use shell reads only. Stop after at most ${maxFiles} files or ${maxCommands} tool calls. Set needsSol=[] unless an actual reserved Sol decision blocks or materially conditions the verdict; never add a no-action entry. Return the schema only.`,
  ].join("\n");
}

function shouldVerify(args, owner) {
  if (args.verification === "always") return true;
  if (args.verification === "never") return false;
  if (args.risk === "high" || args.reservedBoundary || owner.needsVerifier || owner.status !== "completed") return true;
  return owner.risks?.some((risk) => ["high", "critical"].includes(risk.severity)) ?? false;
}

function taskDigest({ taskId, lane, status, owner, verifier }) {
  return {
    taskId,
    lane,
    status,
    changePaths: owner.changes?.map((change) => change.path).slice(0, 4) ?? [],
    failedChecks: owner.checks?.filter((check) => check.status === "failed").map((check) => check.name).slice(0, 3) ?? [],
    risks: owner.risks?.length ?? 0,
    escalations: owner.needsSol?.length ?? 0,
    verifier: verifier?.verdict ?? "not_used",
  };
}

let clientPromise;
async function client() {
  if (!clientPromise) clientPromise = (async () => {
    const executable = await resolveCodexExecutable();
    const instance = new AppServerClient({ executable, log: (message) => {
      appendRunnerDiagnostic("app-server-log", { message });
      process.stderr.write(`[luna-pool] ${message}\n`);
    } });
    await instance.start();
    const models = await instance.request("model/list", { limit: 100 });
    const list = models.data ?? models.models ?? [];
    if (!list.some((model) => (model.id ?? model.model) === "gpt-5.6-luna")) throw new Error("gpt-5.6-luna is not available");
    return instance;
  })();
  return clientPromise;
}

export async function closeClient() {
  const pending = clientPromise;
  clientPromise = null;
  if (!pending) return;
  const instance = await pending.catch(() => null);
  await instance?.close();
}

const laneLocks = new Map();
function withLaneLock(key, work) {
  const prior = laneLocks.get(key) ?? Promise.resolve();
  const current = prior.catch(() => {}).then(work);
  const tracked = current.then(() => undefined, () => undefined).finally(() => {
    if (laneLocks.get(key) === tracked) laneLocks.delete(key);
  });
  laneLocks.set(key, tracked);
  return current;
}

async function ensureLane(instance, registry, project, lane, cwd, sandbox) {
  const existing = project.lanes[lane];
  if (existing?.threadId && existing.promptVersion === PROMPT_VERSION && existing.runtimeId === RUNTIME_ID) {
    existing.lastReusedAt = new Date().toISOString();
    return existing;
  }
  const threadId = await instance.startThread({ cwd, sandbox, developerInstructions: baseInstructions(lane) });
  const laneState = {
    threadId, promptVersion: PROMPT_VERSION, runtimeId: RUNTIME_ID, visibility: "ephemeral", createdAt: new Date().toISOString(),
    lastResumedAt: new Date().toISOString(), turns: 0, uncachedInputTokens: 0, invalidOutputs: 0,
  };
  project.lanes[lane] = laneState;
  await writeRegistry(registry);
  return laneState;
}

async function startEphemeralLane(instance, lane, cwd, sandbox) {
  const threadId = await instance.startThread({ cwd, sandbox, developerInstructions: baseInstructions(lane) });
  return {
    threadId, promptVersion: PROMPT_VERSION, runtimeId: RUNTIME_ID, visibility: "ephemeral", createdAt: new Date().toISOString(),
    lastResumedAt: new Date().toISOString(), turns: 0, uncachedInputTokens: 0, invalidOutputs: 0,
  };
}

async function initializePool(args, context = {}) {
  const startedAt = Date.now();
  context.progress?.report(2, "Heliolune Leader · validating Luna availability and hidden lane sessions", { force: true });
  const cwd = path.resolve(args.cwd);
  const stat = await fs.stat(cwd);
  if (!stat.isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
  const instance = await client();
  const registry = await readRegistry();
  const key = projectKey(cwd);
  const project = registry.projects[key] ??= { cwd, lanes: {}, createdAt: new Date().toISOString() };
  const checkpointMs = (args.checkpointSeconds ?? 90) * 1000;
  const priority = args.priority ?? DEFAULT_PROFILE.id;
  const parallelism = priority === SPEED_FIRST.id ? speedParallelism(args.parallelism) : TOKEN_FIRST.defaultParallelism;
  const poolLanes = priority === SPEED_FIRST.id ? [...burstLanes(parallelism), "supervisor"] : LANES;
  const health = [];
  for (const lane of poolLanes) {
    context.progress?.report(8 + health.length * 84 / poolLanes.length, `Heliolune Leader · initializing ${lane} lane`, { force: true });
    const sandbox = sandboxFor("analyze", cwd);
    const state = await ensureLane(instance, registry, project, lane, cwd, sandbox.legacy);
    let run = null;
    if (args.healthTurn) {
      const schema = { type: "object", additionalProperties: false, required: ["ok", "lane"], properties: { ok: { type: "boolean" }, lane: { type: "string", enum: [lane] } } };
      const healthText = lane === "supervisor"
        ? "HEALTH_DELTA Do not inspect repository contents. Return ok=true and your lane name."
        : "HEALTH_DELTA Inspect the repository root read-only, then return ok=true and your lane name.";
      let previousEvents = -1;
      let silentChecks = 0;
      run = await instance.runTurn({
        threadId: state.threadId, text: healthText, cwd, sandboxPolicy: sandbox.policy,
        outputSchema: schema, timeoutMs: checkpointMs, effort: lane === "supervisor" ? "high" : "max",
        watchdog: {
          renewable: true,
          afterMs: checkpointMs,
          repeatMs: 30_000,
          onCheck: async (snapshot) => {
            if (snapshot?.eventCount > previousEvents || snapshot?.silentMs < 45_000) {
              previousEvents = snapshot?.eventCount ?? previousEvents;
              silentChecks = 0;
              return { action: "continue", confidence: "high", reason: "Health turn activity renewed its lease.", source: "activity" };
            }
            silentChecks += 1;
            return silentChecks >= 2
              ? { action: "interrupt", confidence: "high", reason: "Health turn remained silent across consecutive liveness checks.", source: "deterministic-health" }
              : { action: "continue", confidence: "low", reason: "One silent health sample is ambiguous.", source: "deterministic-health" };
          },
        },
      });
      state.turns += 1;
      state.lastUsage = usageBreakdown(run);
      state.uncachedInputTokens += Math.max(0, state.lastUsage.inputTokens - state.lastUsage.cachedInputTokens);
    }
    health.push({ lane, threadId: state.threadId, resumed: state.turns > 0, effort: lane === "supervisor" ? "high" : "max", turn: run?.output ?? null, usage: run ? usageBreakdown(run) : null });
  }
  project.lastUsedAt = new Date().toISOString();
  if (args.healthTurn) {
    project.metrics = recordMetrics(project.metrics, {
      kind: "health",
      wallMs: Date.now() - startedAt,
      verifierUsed: false,
      laneRuns: health.map((item) => ({ lane: item.lane, usage: item.usage })),
    });
  }
  await writeRegistry(registry);
  context.progress?.report(100, "Heliolune Leader · pool health check complete", { force: true });
  return { status: "healthy", priority, parallelism, model: "gpt-5.6-luna", workerEffort: "max", supervisorEffort: "high", promptVersion: PROMPT_VERSION, healthTurn: Boolean(args.healthTurn), lanes: health };
}

async function runTask(args, context = {}) {
  const cwd = path.resolve(args.cwd);
  const stat = await fs.stat(cwd);
  if (!stat.isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
  const ownerKey = `${projectKey(cwd)}:${args.lane}`;
  return withLaneLock(ownerKey, async () => {
    const taskId = randomUUID();
    const startedAt = Date.now();
    const instance = await client();
    const registry = await readRegistry();
    const key = projectKey(cwd);
    const project = registry.projects[key] ??= { cwd, lanes: {}, createdAt: new Date().toISOString() };
    const sandbox = sandboxFor(args.mode, cwd);
    const ownerLane = await ensureLane(instance, registry, project, args.lane, cwd, sandbox.legacy);
    const checkpointSeconds = args.checkpointSeconds ?? 90;
    const checkpointMs = checkpointSeconds * 1000;
    context.progress?.report(2, `Heliolune Leader · routed to ${args.lane} Luna/max · ${args.scope?.length ?? 0} scope entries · execution starting`, {
      force: true, workerLane: args.lane, workerStatus: "working", workerProgress: 2,
    });
    const schedule = supervisionSchedule({
      checkpointSeconds,
      staleAfterSeconds: args.staleAfterSeconds,
      supervision: args.supervision,
    });
    let supervisorRun = null;
    const supervisorRuns = [];
    let supervisorAttempted = false;
    let supervisorError = null;
    const supervisorFailureUsages = [];
    let softTimeoutReached = false;
    let fallbackTurnAttempted = false;
    let schemaRecovery = {
      attempted: false,
      recovered: false,
      trigger: null,
    };
    const livenessWatchdog = (workerLane, workerMode, objective) => {
      const observeInactivity = createInactivityCircuitBreaker(schedule);
      return {
        renewable: true,
        afterMs: schedule.checkpointMs,
        repeatMs: schedule.repeatMs,
        onCheck: async (rawSnapshot) => {
          softTimeoutReached = true;
          const snapshot = rawSnapshot ?? {
            elapsedMs: schedule.checkpointMs, silentMs: schedule.checkpointMs, eventCount: 0,
            lastMethod: "unknown", usage: null,
          };
          const circuitDecision = observeInactivity(snapshot);
          if (!shouldConsultSupervisor(snapshot, schedule, args.supervision ?? "auto")) {
            return { action: "continue", confidence: "high", reason: "Recent app-server activity renewed the worker lease.", source: "activity" };
          }
          if (circuitDecision) return circuitDecision;
          supervisorAttempted = true;
          try {
            context.progress?.report(64, `Heliolune Leader · supervisor checking ${workerLane} after sustained silence`, {
              force: true, workerLane: "supervisor", workerStatus: "supervising", workerProgress: 20,
            });
            const supervisorResult = await withLaneLock(`${key}:supervisor`, async () => {
              const supervisorLane = await ensureLane(instance, registry, project, "supervisor", cwd, "read-only");
              supervisorRun = await instance.runTurn({
                threadId: supervisorLane.threadId,
                text: compactSupervisorPrompt({ lane: workerLane, mode: workerMode, objective, snapshot, schedule }),
                cwd,
                sandboxPolicy: { type: "readOnly", networkAccess: false },
                outputSchema: SUPERVISOR_SCHEMA,
                timeoutMs: schedule.supervisorTimeoutMs,
                effort: args.supervisorEffort ?? "high",
                onActivity: (activity) => {
                  const update = workerProgress({ lane: "supervisor", snapshot: activity, targetMs: schedule.supervisorTimeoutMs });
                  context.progress?.report(64.5, update.message, {
                    workerLane: "supervisor", workerStatus: "supervising", workerProgress: update.progress,
                    explanation: update.explanation,
                  });
                },
              });
              supervisorLane.turns += 1;
              supervisorLane.lastUsedAt = new Date().toISOString();
              supervisorLane.lastUsage = usageBreakdown(supervisorRun);
              supervisorLane.uncachedInputTokens += supervisorLane.lastUsage.uncachedInputTokens;
              supervisorRuns.push(supervisorRun);
              const decision = { ...supervisorRun.output, source: "luna-supervisor", snapshot };
              if (decision.action === "interrupt" && decision.confidence !== "high") {
                return { ...decision, action: "continue", originalAction: "interrupt", reason: "Only a high-confidence liveness judgment may stop a silent worker." };
              }
              return decision;
            });
            context.progress?.report(65, "Heliolune Leader · supervisor liveness report received", {
              force: true, workerLane: "supervisor", workerStatus: "completed", workerProgress: 100,
              explanation: supervisorResult.reason,
            });
            return supervisorResult;
          } catch (error) {
            supervisorError = error.message;
            const failureUsage = error.activity?.usage ?? null;
            if (failureUsage) supervisorFailureUsages.push(failureUsage);
            return { action: "continue", confidence: "low", reason: "Supervisor check was unavailable; the worker lease remains active and will be checked again.", source: "supervisor-error" };
          }
        },
      };
    };
    const ownerWatchdog = livenessWatchdog(args.lane, args.mode, args.objective);
    let ownerRun;
    try {
      ownerRun = await instance.runTurn({
        threadId: ownerLane.threadId, text: compactTask(args), cwd,
        sandboxPolicy: sandbox.policy, outputSchema: RESULT_SCHEMA, timeoutMs: checkpointMs,
        onActivity: (snapshot) => {
          const update = workerProgress({ lane: args.lane, snapshot, targetMs: schedule.sizingTargetMs });
          context.progress?.report(update.progress, update.message, {
            workerLane: args.lane,
            workerStatus: "working",
            workerProgress: update.progress,
            explanation: update.explanation,
          });
        },
        watchdog: ownerWatchdog,
      });
    } catch (initialError) {
      let error = initialError;
      if (error.code === "INVALID_STRUCTURED_OUTPUT") {
        fallbackTurnAttempted = true;
        const ownerWorkUsage = error.usage ?? error.activity?.usage ?? null;
        schemaRecovery = {
          ...schemaRecovery,
          attempted: true,
          trigger: "invalid_structured_output",
        };
        try {
          const synthesisRun = await instance.runTurn({
            threadId: ownerLane.threadId,
            text: compactSchemaRecoveryPrompt({
              mode: args.mode,
              objective: args.objective,
              acceptance: args.acceptance,
              scope: args.scope,
              activity: error.activity,
            }),
            cwd,
            sandboxPolicy: { type: "readOnly", networkAccess: false },
            outputSchema: RESULT_SCHEMA,
            timeoutMs: checkpointMs,
            effort: args.schemaRepairEffort ?? "high",
            watchdog: ownerWatchdog,
          });
          ownerRun = {
            ...synthesisRun,
            durationMs: (error.activity?.elapsedMs ?? 0) + synthesisRun.durationMs,
            usage: sumUsage([ownerWorkUsage, usageBreakdown(synthesisRun)]),
            supervision: error.supervision ?? synthesisRun.supervision,
          };
          schemaRecovery.recovered = true;
        } catch (synthesisError) {
          synthesisError.priorUsage = ownerWorkUsage;
          synthesisError.schemaRecoveryTrigger = schemaRecovery.trigger;
          error = synthesisError;
        }
      }
      if (ownerRun) {
        // The same warm worker thread converted an invalid final payload into the required schema.
      } else {
        ownerLane.invalidOutputs += 1;
        const classification = classifyTurnFailure(error, schedule);
        const ownerFailureUsage = sumUsage([error.priorUsage, error.usage ?? error.activity?.usage]);
        const diagnostic = {
          occurredAt: new Date().toISOString(),
          classification,
          code: error.code ?? "TURN_ERROR",
          lastEvent: error.activity?.lastMethod ?? null,
          silentMs: error.activity?.silentMs ?? null,
          eventCount: error.activity?.eventCount ?? null,
          supervision: error.supervision ? {
            action: error.supervision.action,
            confidence: error.supervision.confidence,
            source: error.supervision.source,
            reason: error.supervision.reason,
          } : null,
          supervisorError,
          schemaRecovery,
        };
        project.metrics = recordMetrics(project.metrics, {
          kind: "failed",
          wallMs: Date.now() - startedAt,
          verifierUsed: false,
          softTimeout: softTimeoutReached,
          supervisorChecked: supervisorAttempted,
          supervisorInterrupted: error.code === "SUPERVISOR_INTERRUPTED",
          hardTimeout: error.code === "TURN_HARD_TIMEOUT",
          synthesisAttempted: schemaRecovery.attempted,
          synthesisRecovered: false,
          diagnostic,
          laneRuns: [
            ...(ownerFailureUsage.totalTokens ? [{ lane: args.lane, usage: ownerFailureUsage }] : []),
            ...supervisorRuns.map((run) => ({ lane: "supervisor", usage: usageBreakdown(run) })),
            ...supervisorFailureUsages.map((usage) => ({ lane: "supervisor", usage })),
          ],
        });
        await writeRegistry(registry);
        context.progress?.report(100, `Heliolune Leader · ${args.lane} failed · ${classification}`, {
          force: true, workerLane: args.lane, workerStatus: "failed", workerProgress: 100,
        });
        throw error;
      }
    }
    ownerLane.turns += fallbackTurnAttempted ? 2 : 1;
    ownerLane.lastUsedAt = new Date().toISOString();
    ownerLane.lastUsage = usageBreakdown(ownerRun);
    ownerLane.uncachedInputTokens += Math.max(0, ownerLane.lastUsage.inputTokens - ownerLane.lastUsage.cachedInputTokens);
    context.progress?.report(72, `Heliolune Leader · ${args.lane} owner result received · status ${ownerRun.output.status}`, {
      force: true, workerLane: args.lane, workerStatus: "completed", workerProgress: 100,
      explanation: ownerRun.output.summary,
    });

    let verifierRun = null;
    if (shouldVerify(args, ownerRun.output)) {
      context.progress?.report(76, "Heliolune Leader · independent verifier Luna/max starting", {
        force: true, workerLane: "verifier", workerStatus: "verifying", workerProgress: 8,
      });
      verifierRun = await withLaneLock(`${key}:verifier`, async () => {
        const verifierLane = await ensureLane(instance, registry, project, "verifier", cwd, "read-only");
        const run = await instance.runTurn({
          threadId: verifierLane.threadId, text: compactVerification(args, ownerRun.output), cwd,
          sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: VERIFY_SCHEMA, timeoutMs: checkpointMs,
          watchdog: livenessWatchdog("verifier", "analyze", `Verify: ${args.objective}`),
          onActivity: (activity) => {
            const update = workerProgress({ lane: "verifier", snapshot: activity, targetMs: schedule.sizingTargetMs });
            const overall = 76 + Math.max(0, update.progress - 8) / 54 * 9;
            context.progress?.report(overall, update.message, {
              workerLane: "verifier", workerStatus: "verifying", workerProgress: update.progress,
              explanation: update.explanation,
            });
          },
        });
        verifierLane.turns += 1;
        verifierLane.lastUsedAt = new Date().toISOString();
        verifierLane.lastUsage = usageBreakdown(run);
        verifierLane.uncachedInputTokens += Math.max(0, verifierLane.lastUsage.inputTokens - verifierLane.lastUsage.cachedInputTokens);
        return run;
      });
      context.progress?.report(86, `Heliolune Leader · verifier result received · verdict ${verifierRun.output.verdict}`, {
        force: true, workerLane: "verifier", workerStatus: "completed", workerProgress: 100,
        explanation: verifierRun.output.summary,
      });
    }
    const status = verifierRun?.output.verdict === "fail" ? "verification_failed" : ownerRun.output.status;
    const leaderBacklog = Array.isArray(project.leaderBacklog) ? project.leaderBacklog.slice(-12) : [];
    const currentDigest = taskDigest({ taskId, lane: args.lane, status, owner: ownerRun.output, verifier: verifierRun?.output ?? null });
    const useLeader = shouldUseLeader(args, ownerRun.output, verifierRun?.output ?? null);
    let leaderRun = null;
    let leaderError = null;
    let leaderFailureUsage = null;
    if (useLeader) {
      context.progress?.report(90, `Heliolune Leader · compressing ${leaderBacklog.length} deferred digests plus current worker bundle`, {
        force: true, workerLane: "supervisor", workerStatus: "reporting", workerProgress: 20,
      });
      try {
        leaderRun = await withLaneLock(`${key}:supervisor`, async () => {
          const leaderLane = await ensureLane(instance, registry, project, "supervisor", cwd, "read-only");
          const run = await instance.runTurn({
            threadId: leaderLane.threadId,
            text: compactLeaderPrompt({
              taskId,
              lane: args.lane,
              objective: args.objective,
              acceptance: args.acceptance,
              owner: ownerRun.output,
              verifier: verifierRun?.output ?? null,
              schemaRecovery,
              timing: { ownerMs: ownerRun.durationMs, verifierMs: verifierRun?.durationMs ?? 0 },
              backlog: leaderBacklog,
            }),
            cwd,
            sandboxPolicy: { type: "readOnly", networkAccess: false },
            outputSchema: LEADER_SCHEMA,
            timeoutMs: (args.leaderTimeoutSeconds ?? 60) * 1000,
            effort: args.leaderEffort ?? "high",
            onActivity: (activity) => {
              const leaderTimeoutMs = (args.leaderTimeoutSeconds ?? 60) * 1000;
              const update = workerProgress({ lane: "supervisor", snapshot: activity, targetMs: leaderTimeoutMs });
              const overall = 90 + Math.max(0, update.progress - 8) / 54 * 7;
              context.progress?.report(overall, update.message, {
                workerLane: "supervisor", workerStatus: "reporting", workerProgress: update.progress,
                explanation: update.explanation,
              });
            },
          });
          leaderLane.turns += 1;
          leaderLane.lastUsedAt = new Date().toISOString();
          leaderLane.lastUsage = usageBreakdown(run);
          leaderLane.uncachedInputTokens += leaderLane.lastUsage.uncachedInputTokens;
          return run;
        });
      } catch (error) {
        leaderError = error.message;
        leaderFailureUsage = error.usage ?? error.activity?.usage ?? null;
      }
      context.progress?.report(97, leaderRun
        ? "Heliolune Leader · compact handoff ready for Sol review"
        : "Heliolune Leader · compression unavailable · returning direct audited bundle", {
        force: true, workerLane: "supervisor", workerStatus: leaderRun ? "completed" : "failed", workerProgress: 100,
        explanation: leaderRun?.output?.brief ?? leaderError,
      });
    }
    if (leaderRun) project.leaderBacklog = [];
    else project.leaderBacklog = [...leaderBacklog, currentDigest].slice(-12);
    const usage = sumUsage([
      usageBreakdown(ownerRun),
      usageBreakdown(verifierRun),
      ...supervisorRuns.map(usageBreakdown),
      ...supervisorFailureUsages,
      usageBreakdown(leaderRun),
      leaderFailureUsage,
    ]);
    const catalog = pricingCatalog();
    const cost = compareModelCost(usage, {
      actualModel: DEFAULT_ACTUAL_MODEL,
      baselineModel: args.baselineModel ?? DEFAULT_BASELINE_MODEL,
      catalog,
    });
    project.metrics = recordMetrics(project.metrics, {
      kind: "task",
      priority: TOKEN_FIRST.id,
      wallMs: Date.now() - startedAt,
      verifierUsed: Boolean(verifierRun),
      softTimeout: softTimeoutReached,
      supervisorChecked: supervisorAttempted,
      supervisorInterrupted: false,
      hardTimeout: false,
      synthesisAttempted: schemaRecovery.attempted,
      synthesisRecovered: schemaRecovery.recovered,
      leaderReported: Boolean(leaderRun),
      leaderReportFailed: Boolean(leaderError),
      leaderDeferred: !useLeader,
      laneRuns: [
        { lane: args.lane, usage: usageBreakdown(ownerRun) },
        ...(verifierRun ? [{ lane: "verifier", usage: usageBreakdown(verifierRun) }] : []),
        ...supervisorRuns.map((run) => ({ lane: "supervisor", usage: usageBreakdown(run) })),
        ...supervisorFailureUsages.map((usage) => ({ lane: "supervisor", usage })),
        ...(leaderRun ? [{ lane: "supervisor", usage: usageBreakdown(leaderRun) }] : []),
        ...(!leaderRun && leaderFailureUsage ? [{ lane: "supervisor", usage: leaderFailureUsage }] : []),
      ],
    });
    project.lastUsedAt = new Date().toISOString();
    await writeRegistry(registry);
    const controllerResult = buildControllerResult({
      status,
      owner: ownerRun.output,
      verifier: verifierRun?.output ?? null,
      leader: leaderRun?.output ?? null,
      leaderError,
      includeRawResults: Boolean(args.includeRawResults),
      routing: {
        ownerLane: args.lane, ownerThreadId: ownerLane.threadId,
        verifierUsed: Boolean(verifierRun), verifierThreadId: verifierRun ? project.lanes.verifier.threadId : null,
        supervisorUsed: supervisorAttempted, supervisorThreadId: supervisorAttempted ? project.lanes.supervisor?.threadId ?? null : null,
        supervisorEffort: args.supervisorEffort ?? "high", supervisorError,
        leaderThreadId: leaderRun ? project.lanes.supervisor?.threadId ?? null : null,
        leaderEffort: args.leaderEffort ?? "high", leaderError,
        leaderDeferred: !useLeader,
        model: "gpt-5.6-luna", effort: "max", promptVersion: PROMPT_VERSION,
        schemaRepairEffort: args.schemaRepairEffort ?? "high",
      },
      supervision: ownerRun.supervision,
      schemaRecovery,
      usage,
      cost,
      timing: { ownerMs: ownerRun.durationMs, verifierMs: verifierRun?.durationMs ?? 0, leaderMs: leaderRun?.durationMs ?? 0, wallMs: Date.now() - startedAt },
    });
    context.progress?.report(100, `Heliolune Leader · task complete · ${status} · handing off to Sol`, { force: true });
    return controllerResult;
  });
}

async function runBatch(args, context = {}) {
  const cwd = path.resolve(args.cwd);
  const stat = await fs.stat(cwd);
  if (!stat.isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
  const workstreams = validateSpeedWorkstreams(args.workstreams);
  const mutatingBatch = batchNeedsWorktrees(workstreams);
  const parallelism = speedParallelism(args.parallelism);
  const slots = burstLanes(parallelism);
  const batchId = randomUUID();
  const startedAt = Date.now();
  const instance = await client();
  const registry = await readRegistry();
  const key = projectKey(cwd);
  const project = registry.projects[key] ??= { cwd, lanes: {}, createdAt: new Date().toISOString() };
  const slotStates = {};
  if (!mutatingBatch) {
    for (const slot of slots) {
      slotStates[slot] = await ensureLane(instance, registry, project, slot, cwd, "read-only");
    }
  }
  const leaderLane = await ensureLane(instance, registry, project, "supervisor", cwd, "read-only");
  const worktreeSession = mutatingBatch
    ? await prepareParallelWriteBatch({
      cwd,
      batchId,
      workstreams,
      artifactDirectory: path.join(jobDirectory(), "patches", batchId),
    })
    : null;
  const checkpointSeconds = args.checkpointSeconds ?? 90;
  const checkpointMs = checkpointSeconds * 1000;
  const batchSchedule = batchSupervisionSchedule(checkpointSeconds);
  const budgetOwner = workstreams.find((workstream) => workstream.mode !== "analyze") ?? workstreams[0];
  const riskRank = { low: 0, moderate: 1, high: 2 };
  const highestRisk = workstreams.reduce((highest, workstream) => (
    riskRank[workstream.risk ?? "moderate"] > riskRank[highest] ? (workstream.risk ?? "moderate") : highest
  ), "low");
  const budgets = adaptiveBudgets({
    mode: budgetOwner?.mode ?? "analyze",
    risk: highestRisk,
    maxFiles: args.maxFiles,
    maxCommands: args.maxCommands,
  });
  const { maxFiles, maxCommands } = budgets;
  let completedCount = 0;
  const progressById = new Map(workstreams.map((workstream) => [workstream.id, 0]));
  const statusById = new Map(workstreams.map((workstream) => [workstream.id, "idle"]));
  const activeTurns = new Map();
  const ownerId = workstreams.find((workstream) => workstream.id === "owner" && workstream.mode !== "analyze")?.id
    ?? workstreams.find((workstream) => workstream.mode !== "analyze")?.id
    ?? null;
  let contractEscalation = [];
  const workerPhaseProgress = () => 4 + weightedWorkstreamProgress(workstreams, progressById, statusById) * 0.76;
  const liveSnapshots = new Map();
  let managerPromise = null;
  const managerRuns = [];
  const managerErrors = [];
  const managerFailureUsages = [];
  let managerChecks = 0;
  const manageActiveWorkers = () => {
    if (managerPromise) return managerPromise;
    managerPromise = withLaneLock(`${key}:supervisor`, async () => {
      const snapshots = [...liveSnapshots.entries()].map(([slot, entry]) => ({
        slot,
        workstreamId: entry.workstreamId,
        elapsedMs: entry.snapshot.elapsedMs,
        silentMs: entry.snapshot.silentMs,
        eventCount: entry.snapshot.eventCount,
        lastEvent: entry.snapshot.lastMethod,
      }));
      managerChecks += 1;
      context.progress?.report(workerPhaseProgress(), `Heliolune Leader · managing ${snapshots.length} long-running parallel Luna sessions`, {
        force: true, workerLane: "supervisor", workerStatus: "supervising", workerProgress: 20,
      });
      try {
        const managerRun = await instance.runTurn({
          threadId: leaderLane.threadId,
          text: compactBatchSupervisorPrompt({ batchId, snapshots, schedule: batchSchedule }),
          cwd,
          sandboxPolicy: { type: "readOnly", networkAccess: false },
          outputSchema: BATCH_SUPERVISOR_SCHEMA,
          timeoutMs: batchSchedule.leaderTimeoutMs,
          effort: "high",
          onActivity: (snapshot) => {
            const update = workerProgress({ lane: "supervisor", snapshot, targetMs: batchSchedule.leaderTimeoutMs });
            context.progress?.report(workerPhaseProgress(), update.message, {
              workerLane: "supervisor", workerStatus: "supervising", workerProgress: update.progress,
              explanation: update.explanation,
            });
          },
        });
        leaderLane.turns += 1;
        leaderLane.lastUsedAt = new Date().toISOString();
        leaderLane.lastUsage = usageBreakdown(managerRun);
        leaderLane.uncachedInputTokens += leaderLane.lastUsage.uncachedInputTokens;
        managerRuns.push(managerRun);
        context.progress?.report(workerPhaseProgress(), "Heliolune Leader · parallel liveness decisions returned", {
          force: true, workerLane: "supervisor", workerStatus: "completed", workerProgress: 100,
          explanation: managerRun.output.summary,
        });
        return managerRun.output.decisions;
      } catch (error) {
        const managerError = compactStatusExplanation(error.message, 500);
        managerErrors.push(managerError);
        const failureUsage = error.usage ?? error.activity?.usage ?? null;
        if (failureUsage) managerFailureUsages.push(failureUsage);
        context.progress?.report(workerPhaseProgress(), "Heliolune Leader · management check unavailable · worker leases remain active", {
          force: true, workerLane: "supervisor", workerStatus: "failed", workerProgress: 100,
          explanation: managerError,
        });
        return [];
      }
    }).finally(() => { managerPromise = null; });
    return managerPromise;
  };
  const workerWatchdog = (slot, workstream) => {
    const observeInactivity = createInactivityCircuitBreaker(batchSchedule);
    return {
      renewable: true,
      afterMs: batchSchedule.checkpointMs,
      repeatMs: batchSchedule.repeatMs,
      onCheck: async (snapshot) => {
        liveSnapshots.set(slot, { workstreamId: workstream.id, snapshot });
        const circuitDecision = observeInactivity(snapshot);
        if (snapshot?.silentMs < batchSchedule.staleMs) {
          return { action: "continue", confidence: "high", reason: "Recent app-server activity renewed this worker lease.", source: "activity" };
        }
        if (circuitDecision) return circuitDecision;
        const decisions = await manageActiveWorkers();
        const decision = decisions.find((item) => item.slot === slot);
        if (decision?.action === "interrupt" && decision.confidence !== "high") {
          return { ...decision, action: "continue", originalAction: "interrupt", reason: "Only a high-confidence liveness judgment may stop a silent worker.", source: "batch-leader" };
        }
        return decision
          ? { ...decision, source: "batch-leader" }
          : { action: "continue", confidence: "low", reason: "The shared Leader did not flag this slot; its renewable lease remains active.", source: "batch-leader-default" };
      },
    };
  };
  context.progress?.report(2, `Heliolune Leader · speed-first batch ${batchId.slice(0, 8)} · ${workstreams.length} ${mutatingBatch ? "isolated write" : "read-only"} workstreams · ${parallelism} Luna/max slots`, { force: true });

  let executions;
  let patchRecords = [];
  let integration = { applied: true, reason: "not-required", changedPaths: [] };
  try {
    executions = await mapWithConcurrency(workstreams, parallelism, async (workstream, _itemIndex, slotIndex) => {
    const slot = slots[slotIndex];
    return withLaneLock(`${key}:${slot}`, async () => {
      const streamStartedAt = Date.now();
      const workerCwd = worktreeSession ? worktreeFor(worktreeSession, workstream.id) : cwd;
      const workerSandbox = sandboxFor(workstream.mode, workerCwd);
      const laneState = worktreeSession
        ? await startEphemeralLane(instance, slot, workerCwd, workerSandbox.legacy)
        : slotStates[slot];
      statusById.set(workstream.id, "working");
      progressById.set(workstream.id, 2);
      context.progress?.report(workerPhaseProgress(), `Heliolune Leader · ${slot} starting ${workstream.id}`, {
        force: true, workerLane: slot, workerStatus: "working", workerProgress: 2,
      });
      try {
        let run;
        const outputSchema = workstream.mode === "analyze" ? REVIEW_RESULT_SCHEMA : RESULT_SCHEMA;
        try {
          run = await instance.runTurn({
            threadId: laneState.threadId,
            text: compactBurstTask(workstream, { maxFiles, maxCommands }),
            cwd: workerCwd,
            sandboxPolicy: workerSandbox.policy,
            outputSchema,
            timeoutMs: checkpointMs,
            effort: "max",
            onStarted: (handle) => {
              activeTurns.set(workstream.id, handle);
              if (workstream.id === ownerId && contractEscalation.length) {
                void instance.interruptTurn(handle).catch(() => {});
              }
            },
            onActivity: (snapshot) => {
              liveSnapshots.set(slot, { workstreamId: workstream.id, snapshot });
              const update = workerProgress({ lane: slot, snapshot, targetMs: batchSchedule.sizingTargetMs });
              progressById.set(workstream.id, update.progress);
              context.progress?.report(workerPhaseProgress(), `Heliolune Leader · ${slot} · ${workstream.id} · ${update.message}`, {
                workerLane: slot, workerStatus: "working", workerProgress: update.progress,
                explanation: update.explanation,
              });
            },
            watchdog: workerWatchdog(slot, workstream),
          });
        } catch (workError) {
          if (workError.code !== "INVALID_STRUCTURED_OUTPUT") throw workError;
          const priorUsage = workError.usage ?? workError.activity?.usage ?? null;
          progressById.set(workstream.id, 94);
          context.progress?.report(workerPhaseProgress(), `Heliolune Leader · ${slot} · ${workstream.id} repairing invalid structured output with Luna/high`, {
            force: true, workerLane: slot, workerStatus: "working", workerProgress: 94,
          });
          try {
            const synthesisRun = await instance.runTurn({
              threadId: laneState.threadId,
              text: compactSchemaRecoveryPrompt({
                mode: workstream.mode,
                objective: workstream.objective,
                acceptance: workstream.acceptance,
                scope: workstream.scope,
                activity: workError.activity,
              }),
              cwd: workerCwd,
              sandboxPolicy: { type: "readOnly", networkAccess: false },
              outputSchema,
              timeoutMs: checkpointMs,
              effort: "high",
              watchdog: workerWatchdog(slot, workstream),
            });
            run = {
              ...synthesisRun,
              durationMs: Date.now() - streamStartedAt,
              usage: sumUsage([priorUsage, usageBreakdown(synthesisRun)]),
              schemaRecoveryRecovered: true,
            };
          } catch (synthesisError) {
            synthesisError.priorUsage = priorUsage;
            synthesisError.originalFailure = {
              code: workError.code ?? "UNKNOWN",
              missingCompletion: Boolean(workError.missingCompletion),
              activity: workError.activity ?? null,
            };
            throw synthesisError;
          }
        }
        run.output = {
          changes: [],
          needsVerifier: false,
          ...run.output,
        };
        const escalations = contractGuardEscalations(workstream.id, run.output);
        if (escalations.length) {
          contractEscalation = escalations;
          const ownerHandle = ownerId ? activeTurns.get(ownerId) : null;
          if (ownerHandle && workstream.id !== ownerId) {
            await instance.interruptTurn(ownerHandle).catch(() => {});
          }
          context.progress?.report(workerPhaseProgress(), `Heliolune Leader · concurrent contract guard requires Sol · writer integration will be held`, {
            force: true,
            workerLane: slot,
            workerStatus: "completed",
            workerProgress: 100,
            explanation: escalations[0].reason,
          });
        }
        laneState.turns += 1;
        laneState.lastUsedAt = new Date().toISOString();
        laneState.lastUsage = usageBreakdown(run);
        laneState.uncachedInputTokens += laneState.lastUsage.uncachedInputTokens;
        liveSnapshots.delete(slot);
        activeTurns.delete(workstream.id);
        completedCount += 1;
        progressById.set(workstream.id, 100);
        statusById.set(workstream.id, "completed");
        context.progress?.report(workerPhaseProgress(), `Heliolune Leader · ${slot} completed ${workstream.id} · ${completedCount}/${workstreams.length}`, {
          force: true, workerLane: slot, workerStatus: "completed", workerProgress: 100,
          explanation: run.output.summary,
        });
        return { id: workstream.id, requestedLane: workstream.lane, slot, status: run.output.status, run, durationMs: Date.now() - streamStartedAt };
      } catch (error) {
        const failureUsage = normalizeUsage(error.usage ?? error.activity?.usage);
        const originalFailure = error.originalFailure ?? error;
        laneState.turns += 1;
        laneState.invalidOutputs += 1;
        laneState.lastUsedAt = new Date().toISOString();
        laneState.lastUsage = failureUsage;
        laneState.uncachedInputTokens += failureUsage.uncachedInputTokens;
        liveSnapshots.delete(slot);
        activeTurns.delete(workstream.id);
        completedCount += 1;
        progressById.set(workstream.id, 100);
        statusById.set(workstream.id, "failed");
        context.progress?.report(workerPhaseProgress(), `Heliolune Leader · ${slot} failed ${workstream.id} · continuing batch`, {
          force: true, workerLane: slot, workerStatus: "failed", workerProgress: 100,
          explanation: compactStatusExplanation(error.message),
        });
        return {
          id: workstream.id,
          requestedLane: workstream.lane,
          slot,
          status: "failed",
          error: compactStatusExplanation(error.message, 500),
          usage: failureUsage,
          failure: {
            code: originalFailure.code ?? "UNKNOWN",
            missingCompletion: Boolean(originalFailure.missingCompletion),
            activity: originalFailure.activity ? {
              eventCount: originalFailure.activity.eventCount,
              lastMethod: originalFailure.activity.lastMethod,
              lastItemType: originalFailure.activity.lastItemType,
              lastItemPhase: originalFailure.activity.lastItemPhase,
              hasFinalAnswer: originalFailure.activity.hasFinalAnswer,
              silentMs: originalFailure.activity.silentMs,
            } : null,
            schemaRepair: error.originalFailure ? {
              code: error.code ?? "UNKNOWN",
              message: compactStatusExplanation(error.message, 300),
              activity: error.activity ? {
                eventCount: error.activity.eventCount,
                lastMethod: error.activity.lastMethod,
                lastItemType: error.activity.lastItemType,
                lastItemPhase: error.activity.lastItemPhase,
                hasFinalAnswer: error.activity.hasFinalAnswer,
                silentMs: error.activity.silentMs,
              } : null,
            } : null,
          },
          durationMs: Date.now() - streamStartedAt,
        };
      }
    });
    });
    if (worktreeSession) {
      context.progress?.report(84, "Heliolune Leader · validating isolated patches before main-worktree integration", { force: true });
      patchRecords = await Promise.all(workstreams.map((workstream) => collectWorktreePatch(worktreeSession, workstream)));
      integration = contractEscalation.length
        ? { applied: false, reason: "needs-sol", escalations: contractEscalation, changedPaths: [] }
        : await integrateParallelWriteBatch(worktreeSession, patchRecords, executions);
      integration = withRecoveryMetadata(integration, patchRecords);
      context.progress?.report(85, integration.applied
        ? `Heliolune Leader · safely applied ${integration.changedPaths.length} disjoint paths`
        : `Heliolune Leader · integration held for Sol · ${integration.reason}`, { force: true });
    }
  } finally {
    if (worktreeSession) await cleanupParallelWriteBatch(worktreeSession);
  }

  const workerWallMs = Date.now() - startedAt;
  const patchById = new Map(patchRecords.map((record) => [record.id, record]));
  const leaderInput = executions.map((execution) => execution.run ? {
    id: execution.id,
    lane: execution.requestedLane,
    slot: execution.slot,
    status: execution.status,
    summary: execution.run.output.summary,
    evidence: execution.run.output.evidence,
    changes: execution.run.output.changes,
    actualChangePaths: patchById.get(execution.id)?.changedPaths ?? [],
    failedChecks: execution.run.output.checks.filter((check) => check.status === "failed"),
    risks: execution.run.output.risks,
    needsSol: execution.run.output.needsSol,
    durationMs: execution.durationMs,
  } : {
    id: execution.id,
    lane: execution.requestedLane,
    slot: execution.slot,
    status: "failed",
    summary: execution.error,
    evidence: [], changes: [], failedChecks: [], risks: [], needsSol: [],
    durationMs: execution.durationMs,
  });
  context.progress?.report(86, `Heliolune Leader · aggregating ${workstreams.length} speed-first outcomes`, {
    force: true, workerLane: "supervisor", workerStatus: "reporting", workerProgress: 15,
  });
  let leaderRun = null;
  let leaderError = null;
  const leaderStartedAt = Date.now();
  try {
    leaderRun = await withLaneLock(`${key}:supervisor`, () => instance.runTurn({
      threadId: leaderLane.threadId,
      text: compactBatchLeaderPrompt({
        batchId,
        workstreams,
        outcomes: leaderInput,
        integration: { applied: integration.applied, reason: integration.reason, changedPaths: integration.changedPaths },
        timing: { workerWallMs },
      }),
      cwd,
      sandboxPolicy: { type: "readOnly", networkAccess: false },
      outputSchema: BATCH_LEADER_SCHEMA,
      timeoutMs: (args.leaderTimeoutSeconds ?? 60) * 1000,
      effort: args.leaderEffort ?? "high",
      onActivity: (snapshot) => {
        const update = workerProgress({ lane: "supervisor", snapshot, targetMs: (args.leaderTimeoutSeconds ?? 60) * 1000 });
        context.progress?.report(86 + update.progress / 100 * 11, update.message, {
          workerLane: "supervisor", workerStatus: "reporting", workerProgress: update.progress,
          explanation: update.explanation,
        });
      },
    }));
    leaderLane.turns += 1;
    leaderLane.lastUsedAt = new Date().toISOString();
    leaderLane.lastUsage = usageBreakdown(leaderRun);
    leaderLane.uncachedInputTokens += leaderLane.lastUsage.uncachedInputTokens;
    context.progress?.report(98, "Heliolune Leader · speed-first handoff ready for Sol", {
      force: true, workerLane: "supervisor", workerStatus: "completed", workerProgress: 100,
      explanation: leaderRun.output.brief,
    });
  } catch (error) {
    leaderError = compactStatusExplanation(error.message, 500);
    context.progress?.report(98, "Heliolune Leader · aggregation failed · returning direct bounded outcomes", {
      force: true, workerLane: "supervisor", workerStatus: "failed", workerProgress: 100,
      explanation: leaderError,
    });
  }
  const leaderMs = Date.now() - leaderStartedAt;
  const usage = sumUsage([
    ...executions.map((execution) => execution.run ? usageBreakdown(execution.run) : execution.usage),
    ...managerRuns.map(usageBreakdown),
    ...managerFailureUsages,
    usageBreakdown(leaderRun),
  ]);
  const cost = compareModelCost(usage, {
    actualModel: DEFAULT_ACTUAL_MODEL,
    baselineModel: args.baselineModel ?? DEFAULT_BASELINE_MODEL,
    catalog: pricingCatalog(),
  });
  const failed = executions.filter((execution) => execution.status === "failed");
  const incomplete = executions.filter((execution) => execution.status !== "completed");
  const integrationBlocked = mutatingBatch && !integration.applied;
  const status = failed.length === executions.length ? "blocked" : (incomplete.length || integrationBlocked) ? "partial" : "completed";
  project.metrics = recordMetrics(project.metrics, {
    kind: "task",
    priority: SPEED_FIRST.id,
    workstreamCount: workstreams.length,
    parallelWrite: mutatingBatch,
    parallelWriteApplied: mutatingBatch && integration.applied,
    wallMs: Date.now() - startedAt,
    verifierUsed: workstreams.some((workstream) => workstream.lane === "verifier"),
    supervisorChecked: managerChecks > 0,
    supervisorInterrupted: executions.some((execution) => execution.error?.includes("supervisor interrupted")),
    leaderReported: Boolean(leaderRun),
    leaderReportFailed: Boolean(leaderError),
    laneRuns: [
      ...executions.map((execution) => ({ lane: execution.slot, usage: execution.run ? usageBreakdown(execution.run) : execution.usage })),
      ...managerRuns.map((run) => ({ lane: "supervisor", usage: usageBreakdown(run) })),
      ...managerFailureUsages.map((failureUsage) => ({ lane: "supervisor", usage: failureUsage })),
      ...(leaderRun ? [{ lane: "supervisor", usage: usageBreakdown(leaderRun) }] : []),
    ],
  });
  project.lastUsedAt = new Date().toISOString();
  await writeRegistry(registry);
  const taskOutcomes = executions.map((execution) => ({
    id: execution.id, lane: execution.requestedLane, slot: execution.slot, status: execution.status,
    mode: workstreams.find((workstream) => workstream.id === execution.id)?.mode,
    durationMs: execution.durationMs,
    ...(execution.status === "failed" ? { error: execution.error, failure: execution.failure } : {}),
  }));
  context.progress?.report(100, `Heliolune Leader · speed-first batch complete · ${status} · handing off to Sol`, { force: true });
  return {
    status,
    priority: SPEED_FIRST.id,
    parallelism,
    reportMode: leaderRun ? "leader" : "direct-fallback",
    ...(leaderRun ? { leader: leaderRun.output } : { outcomes: leaderInput }),
    taskOutcomes,
    routing: {
      workerSlots: slots,
      workstreamCount: workstreams.length,
      model: "gpt-5.6-luna",
      workerEffort: "max",
      leaderEffort: args.leaderEffort ?? "high",
      cachePolicy: mutatingBatch ? "fresh-isolated-worktrees" : SPEED_FIRST.cachePolicy,
      readOnly: !mutatingBatch,
      leaderManagementUsed: managerChecks > 0,
      leaderManagementChecks: managerChecks,
      leaderManagementErrors: managerErrors,
      leaderError,
      contractGuard: {
        mode: "parallel",
        triggered: contractEscalation.length > 0,
        escalations: contractEscalation,
      },
      budgets,
    },
    integration: integration.applied || !mutatingBatch
      ? integration
      : {
        ...integration,
        patchArtifacts: patchRecords.map((record) => ({
          id: record.id,
          patchPath: record.patchPath,
          changedPaths: record.changedPaths,
          outOfScope: record.outOfScope,
        })),
      },
    usage: compactUsage(usage),
    cost: compactCost(cost),
    timing: {
      workerWallMs,
      workerSumMs: executions.reduce((sum, execution) => sum + execution.durationMs, 0),
      slowestWorkerMs: Math.max(...executions.map((execution) => execution.durationMs)),
      leaderMs,
      wallMs: Date.now() - startedAt,
    },
  };
}

function runtimeInfo() {
  return {
    status: "ok",
    version: VERSION,
    buildId: BUILD_ID,
    runtimeId: RUNTIME_ID,
    promptVersion: PROMPT_VERSION,
    defaultProfile: SPEED_FIRST.id,
    defaultParallelism: SPEED_FIRST.defaultParallelism,
    burstThreadsEphemeral: BURST_THREADS_EPHEMERAL,
    appServerWindowHidden: APP_SERVER_WINDOWS_HIDDEN,
    statusSurface: process.platform === "win32" ? "native-window" : "host-progress",
  };
}

async function costDashboard(args) {
  const cwd = path.resolve(args.cwd);
  const registry = await readRegistry();
  const project = registry.projects[projectKey(cwd)];
  const catalog = pricingCatalog();
  const data = dashboardData({
    cwd,
    metrics: project?.metrics,
    actualModel: DEFAULT_ACTUAL_MODEL,
    baselineModel: args.baselineModel ?? DEFAULT_BASELINE_MODEL,
    catalog,
  });
  if (args.format === "json") {
    return {
      status: "ok",
      data,
      ...(args.includePricing ? { pricing: { unit: "price_units_per_million_tokens", models: catalog } } : {}),
    };
  }
  return { status: "ok", format: "markdown", dashboard: renderDashboard(data) };
}

async function poolStatus(args) {
  const registry = await readRegistry();
  if (!args.cwd) return { projects: Object.values(registry.projects).map((project) => ({ cwd: project.cwd, lanes: Object.keys(project.lanes), lastUsedAt: project.lastUsedAt })) };
  const project = registry.projects[projectKey(path.resolve(args.cwd))];
  return project ?? { cwd: path.resolve(args.cwd), lanes: {}, initialized: false };
}

export async function startVisibleJob({
  lane,
  workerLanes,
  activeLanes,
  run,
  store = jobs,
  showStatusWindow = false,
  heartbeatIntervalMs = JOB_HEARTBEAT_INTERVAL_MS,
  writeRecord = writeJobRecord,
}) {
  let jobId;
  let latestSnapshot = null;
  let persistence = Promise.resolve();
  let terminalizing = false;
  const ownerStartedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
  const persist = (record) => {
    persistence = persistence.catch(() => {}).then(() => writeRecord(record.snapshot?.jobId ?? jobId, record));
    return persistence;
  };
  const runningRecord = () => ({
    status: "running",
    startedAt: latestSnapshot?.startedAt,
    lane: latestSnapshot?.lane ?? lane,
    ownerPid: process.pid,
    ownerStartedAt,
    heartbeatAt: new Date().toISOString(),
    snapshot: latestSnapshot,
  });
  const started = store.start({
    lane,
    effort: "max",
    workerLanes,
    activeLanes,
    onSnapshot: (snapshot) => {
      latestSnapshot = snapshot;
      if (snapshot.status === "running" && !terminalizing) {
        void persist(runningRecord());
      }
    },
    run: async (progress) => {
      try {
        const result = await run(progress);
        terminalizing = true;
        const completedAt = new Date().toISOString();
        await persist({
          status: "completed",
          startedAt: latestSnapshot?.startedAt,
          completedAt,
          lane,
          ownerPid: process.pid,
          ownerStartedAt,
          snapshot: {
            ...latestSnapshot,
            status: "completed",
            progress: 100,
            message: `Heliolune Leader · task complete · ${result?.status ?? "completed"} · ready for Sol`,
            updatedAt: completedAt,
            elapsedMs: Date.now() - new Date(latestSnapshot?.startedAt ?? completedAt).getTime(),
            usage: result?.usage ?? null,
            cost: result?.cost ? {
              actual: result.cost.actual?.amount ?? result.cost.actualLunaCost ?? null,
              projectedSolOnly: result.cost.historicalProjection?.estimatedSolOnlyCost ?? null,
              estimatedSavings: result.cost.historicalProjection?.estimatedSavings ?? null,
              savingsPercent: result.cost.historicalProjection?.estimatedSavingsRate == null ? null : result.cost.historicalProjection.estimatedSavingsRate * 100,
              profile: result.cost.historicalProjection?.profileId ?? null,
            } : null,
            workers: latestSnapshot?.workers ?? [],
          },
          result,
        });
        return result;
      } catch (error) {
        terminalizing = true;
        const completedAt = new Date().toISOString();
        await persist({
          status: "failed",
          startedAt: latestSnapshot?.startedAt,
          completedAt,
          lane,
          ownerPid: process.pid,
          ownerStartedAt,
          snapshot: {
            ...latestSnapshot,
            status: "failed",
            progress: 100,
            message: `Heliolune Leader · task failed · ${error.message}`,
            updatedAt: completedAt,
            elapsedMs: Date.now() - new Date(latestSnapshot?.startedAt ?? completedAt).getTime(),
            error: error.message,
            workers: latestSnapshot?.workers?.map((worker) => ["idle", "completed", "failed"].includes(worker.status)
              ? worker
              : { ...worker, status: "failed", progress: 100, updatedAt: completedAt }) ?? [],
          },
          error: error.message,
        });
        throw error;
      }
    },
  });
  jobId = started.jobId;
  const heartbeat = setInterval(() => {
    if (!terminalizing && latestSnapshot?.status === "running") void persist(runningRecord());
  }, heartbeatIntervalMs);
  heartbeat.unref?.();
  void store.wait(jobId).catch(() => {}).finally(() => clearInterval(heartbeat));
  await persistence;
  const display = showStatusWindow
    ? launchStatusWindow({ jobId, jobRoot: jobDirectory() })
    : { launched: false };
  return {
    ...started,
    display: {
      mode: display.launched ? "native-window" : "silent",
      fallbackLaunched: display.launched,
    },
  };
}

export async function startOwnedTask(args, { store = jobs } = {}) {
  if ((args.profile ?? DEFAULT_PROFILE.id) === SPEED_FIRST.id) {
    const budgets = adaptiveBudgets(args);
    return startOwnedBatch({
      cwd: args.cwd,
      parallelism: SPEED_FIRST.defaultParallelism,
      workstreams: defaultParallelWorkstreams(args),
      maxFiles: budgets.maxFiles,
      maxCommands: budgets.maxCommands,
    }, { store });
  }
  return startVisibleJob({
    lane: args.lane,
    workerLanes: LANES,
    activeLanes: [args.lane],
    run: (progress) => runTask(args, { progress }),
    store,
  });
}

export async function startOwnedBatch(args, { store = jobs } = {}) {
  const parallelism = speedParallelism(args.parallelism);
  const slots = burstLanes(parallelism);
  const activeLanes = slots.slice(0, Math.min(slots.length, args.workstreams?.length ?? 0));
  return startVisibleJob({
    lane: SPEED_FIRST.id,
    workerLanes: [...slots, "supervisor"],
    activeLanes,
    run: (progress) => runBatch({ ...args, parallelism }, { progress }),
    store,
  });
}

async function startDetachedJob(kind, args) {
  const jobId = randomUUID();
  const startedAt = new Date().toISOString();
  const lane = kind === "batch" || (args.profile ?? DEFAULT_PROFILE.id) === SPEED_FIRST.id
    ? SPEED_FIRST.id
    : args.lane;
  const startingSnapshot = {
    jobId,
    buildId: BUILD_ID,
    status: "starting",
    lane,
    effort: "max",
    progress: 0,
    message: "Heliolune Leader · detached job runner starting",
    sequence: 0,
    startedAt,
    updatedAt: startedAt,
    elapsedMs: 0,
    updates: [],
    workers: [],
    resultStatus: null,
    usage: null,
    cost: null,
    error: null,
  };
  const request = { version: VERSION, buildId: BUILD_ID, kind, args, createdAt: startedAt };
  await writeJobRecord(jobId, {
    status: "starting",
    startedAt,
    startupDeadline: new Date(Date.now() + 30_000).toISOString(),
    lane,
    snapshot: startingSnapshot,
  });
  try {
    await writeJobRequest(jobId, request);
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = `Unable to persist the detached Heliolune runner request: ${error.message}`;
    await writeJobRecord(jobId, {
      status: "failed",
      startedAt,
      completedAt,
      lane,
      error: message,
      snapshot: { ...startingSnapshot, status: "failed", progress: 100, message, updatedAt: completedAt, error: message },
    });
    throw error;
  }
  const failStartup = async (error) => {
    const current = await readJobRecord(jobId);
    if (current?.status !== "starting") return;
    const completedAt = new Date().toISOString();
    const message = `Unable to launch the detached Heliolune job runner: ${error.message}`;
    try {
      await writeJobRecord(jobId, {
        ...current,
        status: "failed",
        completedAt,
        error: message,
        snapshot: { ...startingSnapshot, status: "failed", progress: 100, message, updatedAt: completedAt, error: message },
      });
    } finally {
      await removeJobRequest(jobId);
    }
  };
  try {
    const runnerLaunch = launchJobRunner({ jobId });
    await runnerLaunch.ready;
    let display;
    try { display = launchStatusWindow({ jobId, jobRoot: jobDirectory() }); }
    catch (error) { display = { launched: false, reason: `status-window-error: ${error.message}` }; }
    return {
      ...startingSnapshot,
      display: {
        mode: display.launched ? "native-window" : "silent",
        fallbackLaunched: display.launched,
      },
    };
  } catch (error) {
    await failStartup(error);
    throw error;
  }
}

async function startTask(args) {
  return startDetachedJob("task", args);
}

async function startBatch(args) {
  return startDetachedJob("batch", args);
}

async function callTool(name, args, context = {}) {
  if (name === "runtime_info") return runtimeInfo();
  if (name === "initialize_pool") return initializePool(args, context);
  if (name === "start_task") return startTask(args, context);
  if (name === "start_batch") return startBatch(args, context);
  if (name === "pool_status") return poolStatus(args);
  if (name === "cost_dashboard") return costDashboard(args);
  throw new Error(`Unknown tool: ${name}`);
}

function toolResult(name, result) {
  if (name === "start_task" || name === "start_batch") {
    const displayText = result.display?.mode === "native-window"
        ? "The native Leader status window is live"
        : "This host did not expose a visible status surface";
    return {
      structuredContent: result,
      content: [{ type: "text", text: `Heliolune job ${result.jobId} started on ${result.lane}/max. ${displayText}; call luna-await.await_task once with this jobId.` }],
      isError: false,
    };
  }
  return { content: [{ type: "text", text: JSON.stringify(result) }], isError: false };
}

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
        serverInfo: { name: "luna-pool-orchestrator", version: VERSION },
      } });
      return;
    }
    if (message.method === "ping") {
      send({ jsonrpc: "2.0", id: message.id, result: {} });
      return;
    }
    if (message.method === "tools/list") {
      send({ jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } });
      return;
    }
    if (message.method === "tools/call") {
      const progress = createProgressReporter({ token: message.params?._meta?.progressToken, send });
      const result = await callTool(message.params.name, message.params.arguments ?? {}, { progress });
      send({ jsonrpc: "2.0", id: message.id, result: toolResult(message.params.name, result) });
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

if (SERVER_IS_MAIN) {
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); }
    catch { return; }
    void handle(message);
  });

  const requestShutdown = createJobAwareShutdown({
    store: jobs,
    log: (message) => process.stderr.write(`[luna-pool] ${message}\n`),
  });
  process.on("SIGINT", () => void requestShutdown("SIGINT"));
  process.on("SIGTERM", () => void requestShutdown("SIGTERM"));
}
