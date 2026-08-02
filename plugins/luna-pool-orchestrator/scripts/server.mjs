import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { AppServerClient, resolveCodexExecutable } from "./app-server-client.mjs";
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
import { classifyTurnFailure, compactSupervisorPrompt, shouldConsultSupervisor, supervisionSchedule } from "./supervision.mjs";
import { compactSteerPrompt, compactSynthesisPrompt, finalizationSchedule, shouldAttemptSynthesis } from "./finalization.mjs";
import { buildControllerResult, compactLeaderPrompt, shouldUseLeader } from "./leader.mjs";
import { createProgressReporter, workerProgress } from "./progress.mjs";
import { JobStore } from "./jobs.mjs";
import { jobDirectory, writeJobRecord } from "./job-files.mjs";
import { detectSystemLanguage, launchStatusWindow, supportsInlineStatus } from "./status-window.mjs";

const VERSION = "0.5.2";
const PROMPT_VERSION = "mcp-v7-natural-status";
const RUNTIME_ID = randomUUID();
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const STATUS_TEMPLATE_URI = "ui://heliolune/leader-status.html";
const STATUS_TEMPLATE_PATH = path.join(SCRIPT_DIRECTORY, "..", "assets", "status.html");
const jobs = new JobStore();
let clientSupportsInlineStatus = false;
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
    status: { type: "string", enum: ["completed", "partial", "blocked"] },
    summary: { type: "string" },
    evidence: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["path", "line", "claim"], properties: {
        path: { type: "string" }, line: { type: ["integer", "null"] }, claim: { type: "string" },
      } },
    },
    changes: {
      type: "array", maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["path", "summary"], properties: {
        path: { type: "string" }, summary: { type: "string" },
      } },
    },
    checks: {
      type: "array", maxItems: 6,
      items: { type: "object", additionalProperties: false, required: ["name", "status", "detail"], properties: {
        name: { type: "string" }, status: { type: "string", enum: ["passed", "failed", "not_run"] }, detail: { type: "string" },
      } },
    },
    risks: {
      type: "array", maxItems: 6,
      items: { type: "object", additionalProperties: false, required: ["severity", "issue"], properties: {
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] }, issue: { type: "string" },
      } },
    },
    needsVerifier: { type: "boolean" },
    needsSol: {
      type: "array", maxItems: 4,
      items: { type: "object", additionalProperties: false, required: ["decision", "reason"], properties: {
        decision: { type: "string" }, reason: { type: "string" },
      } },
    },
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

const RUN_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cwd", "lane", "mode", "objective", "acceptance"],
  properties: {
    cwd: { type: "string", description: "Absolute repository path." },
    lane: { type: "string", enum: ["core", "tests", "integration"], description: "Stable function-affine owner lane." },
    mode: { type: "string", enum: ["analyze", "implement", "repair"], description: "Whether Luna may modify repository files." },
    objective: { type: "string", maxLength: 4000, description: "Compact task objective; omit background Luna can inspect itself." },
    acceptance: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 500 } },
    repoState: { type: "string", maxLength: 1000, description: "Only volatile state such as commit, failing command, or dirty paths." },
    scope: { type: "array", maxItems: 12, items: { type: "string", maxLength: 300 } },
    risk: { type: "string", enum: ["low", "moderate", "high"], default: "moderate" },
    reservedBoundary: { type: "boolean", default: false, description: "True for architecture, security boundary, public API, or irreversible migration." },
    verification: { type: "string", enum: ["auto", "always", "never"], default: "auto" },
    timeoutSeconds: { type: "integer", minimum: 30, maximum: 3600, default: 900 },
    maxFiles: { type: "integer", minimum: 3, maximum: 30, default: 12, description: "Soft cap on distinct files inspected before Luna must synthesize." },
    maxCommands: { type: "integer", minimum: 3, maximum: 50, default: 20, description: "Soft cap on repository tool calls before Luna must synthesize." },
    baselineModel: { type: "string", default: DEFAULT_BASELINE_MODEL, description: "Model used only for the raw same-token pricing-sensitivity field; visible savings use the historical benchmark profile." },
    supervision: { type: "string", enum: ["auto", "always", "off"], default: "auto", description: "Use the shared Luna supervisor at soft timeout only when stale, always, or never." },
    softTimeoutSeconds: { type: "integer", minimum: 30, maximum: 3300, description: "Optional supervisor checkpoint before the hard timeout." },
    staleAfterSeconds: { type: "integer", minimum: 15, maximum: 600, default: 45, description: "Silence required before auto supervision consults Luna." },
    supervisorEffort: { type: "string", enum: ["high", "xhigh"], default: "high" },
    finalization: { type: "string", enum: ["auto", "off"], default: "auto", description: "Reserve time for in-turn finalization steering and invalid-JSON fallback before the hard deadline." },
    synthesisReserveSeconds: { type: "integer", minimum: 20, maximum: 300, description: "Optional portion of the existing hard deadline reserved for final structured synthesis." },
    synthesisEffort: { type: "string", enum: ["high", "xhigh", "max"], default: "high", description: "Reasoning effort for schema-only finalization; owner work remains max." },
    reporting: { type: "string", enum: ["auto", "leader", "direct"], default: "auto", description: "Compress large/risky bundles with the shared leader, force leader reporting, or return raw bundles." },
    leaderThresholdChars: { type: "integer", minimum: 1000, maximum: 20000, default: 3200, description: "Raw owner/verifier JSON size that wakes the leader in auto mode." },
    includeRawResults: { type: "boolean", default: false, description: "Include owner and verifier bundles alongside a leader report for audit/debug only." },
    leaderEffort: { type: "string", enum: ["high", "xhigh"], default: "high" },
    leaderTimeoutSeconds: { type: "integer", minimum: 20, maximum: 180, default: 60 },
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
    healthTurn: { type: "boolean", default: false, description: "Run a real minimal Luna/max turn on every lane. False only checks model availability and creates/resumes all four persistent sessions." },
    timeoutSeconds: { type: "integer", minimum: 30, maximum: 900, default: 300 },
  },
};

const JOB_INPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["jobId"],
  properties: { jobId: { type: "string", minLength: 1, maxLength: 100 } },
};

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const LOCAL_WORK_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false };

const TOOLS = [
  {
    name: "initialize_pool",
    title: "Initialize Heliolune pool",
    description: "Create or resume four Luna/max worker lanes plus one shared Luna/high operations-leader session for one repository and perform a health check without changing code.",
    inputSchema: INIT_INPUT_SCHEMA,
    annotations: LOCAL_WORK_ANNOTATIONS,
  },
  {
    name: "run_task",
    title: "Run Heliolune task (blocking)",
    description: "Run one bounded repository task on a persistent Luna/max owner lane, reserve time for structured finalization, conditionally verify it, and adaptively compress large or risky handoffs through the shared Luna leader.",
    inputSchema: RUN_INPUT_SCHEMA,
    annotations: LOCAL_WORK_ANNOTATIONS,
  },
  {
    name: "start_task",
    title: "Start Heliolune task with live status",
    description: "Start one bounded Luna task and immediately render the host-supported inline Leader panel or automatic Windows fallback. Always call luna-await.await_task once with the returned jobId; do not poll job_status from the model.",
    inputSchema: RUN_INPUT_SCHEMA,
    annotations: LOCAL_WORK_ANNOTATIONS,
    _meta: {
      ui: { resourceUri: STATUS_TEMPLATE_URI, visibility: ["model", "app"] },
      "ui/resourceUri": STATUS_TEMPLATE_URI,
      "openai/outputTemplate": STATUS_TEMPLATE_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Starting Luna work…",
      "openai/toolInvocation/invoked": "Leader status is live",
    },
  },
  {
    name: "job_status",
    title: "Read Heliolune job status",
    description: "Return one transcript-free operational snapshot for the inline Heliolune status panel. This tool is app-only; the model must not poll it.",
    inputSchema: JOB_INPUT_SCHEMA,
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: {
      ui: { visibility: ["app"] },
      "openai/visibility": "private",
    },
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
  const effortGuidance = lane === "supervisor"
    ? "Use high reasoning effort for liveness classification and faithful reporting compression; do not inspect repository contents."
    : "Use maximum reasoning effort on every substantive turn.";
  const workBoundary = lane === "supervisor"
    ? "Never inspect or modify the repository, call tools, plan or assign work, or perform final acceptance. Report and compress only the task/liveness data supplied by the MCP."
    : "Inspect the repository directly instead of requesting broad context from Sol. Prefer rg/rg --files and shell reads. Never use apply_patch or view_image merely to read or enumerate text files. Stop exploring as soon as acceptance has enough evidence. You may choose bounded implementation details inside the assigned objective.";
  return `You are the persistent GPT-5.6 Luna worker for lane '${lane}' under a GPT-5.6 Sol controller.\n${LANE_FOCUS[lane]}\n${effortGuidance} ${workBoundary} Keep findings evidence-based and outputs compact. Write concise reasoning summaries in ${STATUS_LANGUAGE} so the local operations panel can explain your current work naturally. You MUST NOT independently decide architecture, security boundaries, public API contracts, or irreversible migrations; report supplied escalation needs without resolving them. Never broaden scope. Never claim a check passed unless the supplied record or a worker-run check supports it. Preserve unrelated user changes. Return only the requested JSON schema.\nPrompt contract: ${PROMPT_VERSION}. This stable role prompt must not be reinterpreted by incremental task text.`;
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
    const instance = new AppServerClient({ executable, log: (message) => process.stderr.write(`[luna-pool] ${message}\n`) });
    await instance.start();
    const models = await instance.request("model/list", { limit: 100 });
    const list = models.data ?? models.models ?? [];
    if (!list.some((model) => (model.id ?? model.model) === "gpt-5.6-luna")) throw new Error("gpt-5.6-luna is not available");
    return instance;
  })();
  return clientPromise;
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
  const timeoutMs = (args.timeoutSeconds ?? 300) * 1000;
  const health = [];
  for (const lane of LANES) {
    context.progress?.report(8 + health.length * 15, `Heliolune Leader · initializing ${lane} lane`, { force: true });
    const sandbox = sandboxFor("analyze", cwd);
    const state = await ensureLane(instance, registry, project, lane, cwd, sandbox.legacy);
    let run = null;
    if (args.healthTurn) {
      const schema = { type: "object", additionalProperties: false, required: ["ok", "lane"], properties: { ok: { type: "boolean" }, lane: { type: "string", enum: [lane] } } };
      const healthText = lane === "supervisor"
        ? "HEALTH_DELTA Do not inspect repository contents. Return ok=true and your lane name."
        : "HEALTH_DELTA Inspect the repository root read-only, then return ok=true and your lane name.";
      run = await instance.runTurn({ threadId: state.threadId, text: healthText, cwd, sandboxPolicy: sandbox.policy, outputSchema: schema, timeoutMs, effort: lane === "supervisor" ? "high" : "max" });
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
  return { status: "healthy", model: "gpt-5.6-luna", workerEffort: "max", supervisorEffort: "high", promptVersion: PROMPT_VERSION, healthTurn: Boolean(args.healthTurn), lanes: health };
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
    const timeoutSeconds = args.timeoutSeconds ?? 900;
    const timeoutMs = timeoutSeconds * 1000;
    const deadlineAt = startedAt + timeoutMs;
    const finalizationPlan = finalizationSchedule({
      timeoutSeconds,
      synthesisReserveSeconds: args.synthesisReserveSeconds,
      finalization: args.finalization,
    });
    context.progress?.report(2, `Heliolune Leader · routed to ${args.lane} Luna/max · ${args.scope?.length ?? 0} scope entries · execution starting`, {
      force: true, workerLane: args.lane, workerStatus: "working", workerProgress: 2,
    });
    const schedule = supervisionSchedule({
      timeoutSeconds,
      softTimeoutSeconds: args.softTimeoutSeconds,
      staleAfterSeconds: args.staleAfterSeconds,
      supervision: args.supervision,
    });
    let supervisorRun = null;
    let supervisorAttempted = false;
    let supervisorError = null;
    let supervisorFailureUsage = null;
    let softTimeoutReached = false;
    let ownerWorkUsage = null;
    let fallbackTurnAttempted = false;
    let finalization = {
      enabled: finalizationPlan.enabled,
      attempted: false,
      recovered: false,
      reserveMs: finalizationPlan.reserveMs,
      trigger: null,
    };
    let ownerRun;
    try {
      ownerRun = await instance.runTurn({
        threadId: ownerLane.threadId, text: compactTask(args), cwd,
        sandboxPolicy: sandbox.policy, outputSchema: RESULT_SCHEMA, timeoutMs,
        onActivity: (snapshot) => {
          const update = workerProgress({ lane: args.lane, snapshot, hardMs: timeoutMs });
          context.progress?.report(update.progress, update.message, {
            workerLane: args.lane,
            workerStatus: "working",
            workerProgress: update.progress,
            explanation: update.explanation,
          });
        },
        steer: finalizationPlan.enabled ? {
          afterMs: finalizationPlan.workMs,
          text: compactSteerPrompt({ objective: args.objective, acceptance: args.acceptance }),
          shouldSteer: (snapshot) => Boolean(snapshot) && snapshot.silentMs < (schedule.staleMs ?? 45_000),
          onStatus: ({ phase }) => {
            const messages = {
              attempted: `Heliolune Leader · ${args.lane} work budget reached · requesting in-turn structured finalization`,
              accepted: `Heliolune Leader · ${args.lane} accepted finalization steering · waiting for its compact result`,
              skipped: `Heliolune Leader · ${args.lane} is stale · finalization steering skipped`,
              failed: `Heliolune Leader · ${args.lane} finalization steering was not accepted · hard deadline remains active`,
            };
            context.progress?.report(66, messages[phase] ?? `Heliolune Leader · ${args.lane} finalization status: ${phase}`, { force: true });
          },
        } : null,
        watchdog: schedule.enabled ? {
          afterMs: schedule.softMs,
          onCheck: async (rawSnapshot) => {
            softTimeoutReached = true;
            const snapshot = rawSnapshot ?? {
              elapsedMs: schedule.softMs, silentMs: schedule.softMs, eventCount: 0,
              lastMethod: "unknown", usage: null,
            };
            if (!shouldConsultSupervisor(snapshot, schedule, args.supervision ?? "auto")) {
              return { action: "continue", confidence: "high", reason: "Recent app-server activity indicates the worker is still live.", source: "activity" };
            }
            supervisorAttempted = true;
            try {
              context.progress?.report(64, `Heliolune Leader · supervisor checking ${args.lane} liveness`, {
                force: true, workerLane: "supervisor", workerStatus: "supervising", workerProgress: 20,
              });
              const supervisorResult = await withLaneLock(`${key}:supervisor`, async () => {
                const supervisorLane = await ensureLane(instance, registry, project, "supervisor", cwd, "read-only");
                supervisorRun = await instance.runTurn({
                  threadId: supervisorLane.threadId,
                  text: compactSupervisorPrompt({ lane: args.lane, mode: args.mode, objective: args.objective, snapshot, schedule }),
                  cwd,
                  sandboxPolicy: { type: "readOnly", networkAccess: false },
                  outputSchema: SUPERVISOR_SCHEMA,
                  timeoutMs: schedule.supervisorTimeoutMs,
                  effort: args.supervisorEffort ?? "high",
                  onActivity: (activity) => {
                    const update = workerProgress({ lane: "supervisor", snapshot: activity, hardMs: schedule.supervisorTimeoutMs });
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
                return { ...supervisorRun.output, source: "luna-supervisor", snapshot };
              });
              context.progress?.report(65, "Heliolune Leader · supervisor liveness report received", {
                force: true, workerLane: "supervisor", workerStatus: "completed", workerProgress: 100,
                explanation: supervisorResult.reason,
              });
              return supervisorResult;
            } catch (error) {
              supervisorError = error.message;
              supervisorFailureUsage = error.activity?.usage ?? null;
              return { action: "continue", confidence: "low", reason: "Supervisor did not return before its bounded deadline; deterministic hard timeout remains active.", source: "supervisor-error" };
            }
          },
        } : null,
      });
    } catch (initialError) {
      let error = initialError;
      if (error.steering?.attempted) {
        finalization = {
          ...finalization,
          attempted: true,
          trigger: "in_turn_steer",
          steerAccepted: error.steering.accepted,
          steerError: error.steering.error,
        };
      }
      const staleMs = schedule.staleMs ?? 45_000;
      if (shouldAttemptSynthesis(error, finalizationPlan, staleMs)) {
        fallbackTurnAttempted = true;
        ownerWorkUsage = error.usage ?? error.activity?.usage ?? null;
        finalization = {
          ...finalization,
          attempted: true,
          trigger: error.code === "INVALID_STRUCTURED_OUTPUT" ? "invalid_structured_output" : "active_work_budget_exhausted",
        };
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs >= 10_000) {
          try {
            const synthesisRun = await instance.runTurn({
              threadId: ownerLane.threadId,
              text: compactSynthesisPrompt({
                mode: args.mode,
                objective: args.objective,
                acceptance: args.acceptance,
                scope: args.scope,
                activity: error.activity,
              }),
              cwd,
              sandboxPolicy: { type: "readOnly", networkAccess: false },
              outputSchema: RESULT_SCHEMA,
              timeoutMs: remainingMs,
              effort: args.synthesisEffort ?? "high",
            });
            ownerRun = {
              ...synthesisRun,
              durationMs: (error.activity?.elapsedMs ?? finalizationPlan.workMs) + synthesisRun.durationMs,
              usage: sumUsage([ownerWorkUsage, usageBreakdown(synthesisRun)]),
              supervision: error.supervision ?? synthesisRun.supervision,
            };
            finalization.recovered = true;
          } catch (synthesisError) {
            synthesisError.priorUsage = ownerWorkUsage;
            synthesisError.finalizationTrigger = finalization.trigger;
            error = synthesisError;
          }
        } else {
          error.finalizationTrigger = finalization.trigger;
        }
      }
      if (ownerRun) {
        // The same warm worker thread converted interrupted work into a bounded structured result.
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
          finalization,
        };
        project.metrics = recordMetrics(project.metrics, {
          kind: "failed",
          wallMs: Date.now() - startedAt,
          verifierUsed: false,
          softTimeout: softTimeoutReached,
          supervisorChecked: supervisorAttempted,
          supervisorInterrupted: error.code === "SUPERVISOR_INTERRUPTED",
          hardTimeout: error.code === "TURN_HARD_TIMEOUT",
          synthesisAttempted: finalization.attempted,
          synthesisRecovered: false,
          diagnostic,
          laneRuns: [
            ...(ownerFailureUsage.totalTokens ? [{ lane: args.lane, usage: ownerFailureUsage }] : []),
            ...(supervisorRun ? [{ lane: "supervisor", usage: usageBreakdown(supervisorRun) }] : []),
            ...(!supervisorRun && supervisorFailureUsage ? [{ lane: "supervisor", usage: supervisorFailureUsage }] : []),
          ],
        });
        await writeRegistry(registry);
        context.progress?.report(100, `Heliolune Leader · ${args.lane} failed · ${classification}`, {
          force: true, workerLane: args.lane, workerStatus: "failed", workerProgress: 100,
        });
        if (error.code === "TURN_HARD_TIMEOUT") {
          error.message = `${error.message}; classification=${classification}; lastEvent=${diagnostic.lastEvent ?? "unknown"}; silentMs=${diagnostic.silentMs ?? "unknown"}; supervisor=${diagnostic.supervision?.action ?? "not-used"}; finalization=${finalization.attempted ? "failed" : "not-attempted"}`;
        }
        throw error;
      }
    }
    if (ownerRun.steering?.attempted) {
      finalization = {
        ...finalization,
        attempted: true,
        recovered: ownerRun.steering.accepted,
        trigger: "in_turn_steer",
        steerAccepted: ownerRun.steering.accepted,
        steerError: ownerRun.steering.error,
        steerSkippedReason: ownerRun.steering.skippedReason,
      };
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
          sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: VERIFY_SCHEMA, timeoutMs,
          onActivity: (activity) => {
            const update = workerProgress({ lane: "verifier", snapshot: activity, hardMs: timeoutMs });
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
              finalization,
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
              const update = workerProgress({ lane: "supervisor", snapshot: activity, hardMs: leaderTimeoutMs });
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
      usageBreakdown(supervisorRun),
      supervisorFailureUsage,
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
      wallMs: Date.now() - startedAt,
      verifierUsed: Boolean(verifierRun),
      softTimeout: softTimeoutReached,
      supervisorChecked: supervisorAttempted,
      supervisorInterrupted: false,
      hardTimeout: false,
      synthesisAttempted: finalization.attempted,
      synthesisRecovered: finalization.recovered,
      leaderReported: Boolean(leaderRun),
      leaderReportFailed: Boolean(leaderError),
      leaderDeferred: !useLeader,
      laneRuns: [
        { lane: args.lane, usage: usageBreakdown(ownerRun) },
        ...(verifierRun ? [{ lane: "verifier", usage: usageBreakdown(verifierRun) }] : []),
        ...(supervisorRun ? [{ lane: "supervisor", usage: usageBreakdown(supervisorRun) }] : []),
        ...(!supervisorRun && supervisorFailureUsage ? [{ lane: "supervisor", usage: supervisorFailureUsage }] : []),
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
        synthesisEffort: args.synthesisEffort ?? "high",
      },
      supervision: ownerRun.supervision,
      finalization,
      usage,
      cost,
      timing: { ownerMs: ownerRun.durationMs, verifierMs: verifierRun?.durationMs ?? 0, leaderMs: leaderRun?.durationMs ?? 0, wallMs: Date.now() - startedAt },
    });
    context.progress?.report(100, `Heliolune Leader · task complete · ${status} · handing off to Sol`, { force: true });
    return controllerResult;
  });
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

async function startTask(args) {
  let jobId;
  let latestSnapshot = null;
  let persistence = Promise.resolve();
  const persist = (record) => {
    persistence = persistence.catch(() => {}).then(() => writeJobRecord(record.snapshot?.jobId ?? jobId, record));
    return persistence;
  };
  const started = jobs.start({
    lane: args.lane,
    effort: "max",
    workerLanes: LANES,
    onSnapshot: (snapshot) => {
      latestSnapshot = snapshot;
      if (snapshot.status === "running") {
        void persist({ status: "running", startedAt: snapshot.startedAt, lane: snapshot.lane, snapshot });
      }
    },
    run: async (progress) => {
      try {
        const result = await runTask(args, { progress });
        await persistence;
        const completedAt = new Date().toISOString();
        await writeJobRecord(jobId, {
          status: "completed",
          completedAt,
          lane: args.lane,
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
            workers: latestSnapshot?.workers?.map((worker) => worker.lane === args.lane
              ? { ...worker, status: "completed", progress: 100, updatedAt: completedAt }
              : worker) ?? [],
          },
          result,
        });
        return result;
      } catch (error) {
        await persistence.catch(() => {});
        const completedAt = new Date().toISOString();
        await writeJobRecord(jobId, {
          status: "failed",
          completedAt,
          lane: args.lane,
          snapshot: {
            ...latestSnapshot,
            status: "failed",
            progress: 100,
            message: `Heliolune Leader · task failed · ${error.message}`,
            updatedAt: completedAt,
            elapsedMs: Date.now() - new Date(latestSnapshot?.startedAt ?? completedAt).getTime(),
            error: error.message,
            workers: latestSnapshot?.workers?.map((worker) => worker.lane === args.lane
              ? { ...worker, status: "failed", progress: 100, updatedAt: completedAt }
              : worker) ?? [],
          },
          error: error.message,
        });
        throw error;
      }
    },
  });
  jobId = started.jobId;
  await persistence;
  const display = launchStatusWindow({
    jobId,
    jobRoot: jobDirectory(),
    inlineUiSupported: clientSupportsInlineStatus,
  });
  return {
    ...started,
    display: {
      mode: clientSupportsInlineStatus ? "inline-mcp-app" : display.launched ? "native-window" : "silent",
      fallbackLaunched: display.launched,
    },
  };
}

function jobStatus(args) {
  return jobs.status(args.jobId);
}

async function callTool(name, args, context = {}) {
  if (name === "initialize_pool") return initializePool(args, context);
  if (name === "run_task") return runTask(args, context);
  if (name === "start_task") return startTask(args, context);
  if (name === "job_status") return jobStatus(args);
  if (name === "pool_status") return poolStatus(args);
  if (name === "cost_dashboard") return costDashboard(args);
  throw new Error(`Unknown tool: ${name}`);
}

function toolResult(name, result) {
  if (name === "start_task") {
    const displayText = result.display?.mode === "inline-mcp-app"
      ? "The inline Leader panel is live"
      : result.display?.mode === "native-window"
        ? "A native Leader status window is live because this host did not advertise inline MCP Apps"
        : "This host did not expose a visible status surface";
    return {
      structuredContent: result,
      content: [{ type: "text", text: `Heliolune job ${result.jobId} started on ${result.lane}/max. ${displayText}; call luna-await.await_task once with this jobId.` }],
      isError: false,
    };
  }
  if (name === "job_status") {
    return { structuredContent: result, content: [], isError: false };
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
      clientSupportsInlineStatus = supportsInlineStatus(message.params?.capabilities);
      send({ jsonrpc: "2.0", id: message.id, result: {
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
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
    if (message.method === "resources/list") {
      send({ jsonrpc: "2.0", id: message.id, result: { resources: [{
        uri: STATUS_TEMPLATE_URI,
        name: "heliolune-leader-status",
        title: "Heliolune Leader status",
        description: "Live transcript-free Luna worker status for the active Heliolune job.",
        mimeType: "text/html;profile=mcp-app",
      }] } });
      return;
    }
    if (message.method === "resources/read") {
      if (message.params?.uri !== STATUS_TEMPLATE_URI) {
        send({ jsonrpc: "2.0", id: message.id, error: { code: -32002, message: `Unknown resource: ${message.params?.uri}` } });
        return;
      }
      const template = await fs.readFile(STATUS_TEMPLATE_PATH, "utf8");
      send({ jsonrpc: "2.0", id: message.id, result: { contents: [{
        uri: STATUS_TEMPLATE_URI,
        mimeType: "text/html;profile=mcp-app",
        text: template,
        _meta: {
          ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
          "openai/widgetDescription": "Shows live Heliolune Leader and Luna worker state without controller polling.",
          "openai/widgetPrefersBorder": true,
        },
      }] } });
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

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); }
  catch { return; }
  void handle(message);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
