import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppServerClient, resolveCodexExecutable } from "../plugins/luna-pool-orchestrator/scripts/app-server-client.mjs";
import { compareModelCost, normalizeUsage, sumUsage } from "../plugins/luna-pool-orchestrator/scripts/pricing.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["taskId", "verdict", "summary", "evidence"],
  properties: {
    taskId: { type: "string" },
    verdict: { type: "string", enum: ["pass", "fail", "uncertain"] },
    summary: { type: "string" },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["path", "line", "claim"],
      properties: {
        path: { type: "string" },
        line: { type: ["integer", "null"] },
        claim: { type: "string" },
      },
    },
  },
};

const leaderSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overall", "passedTaskIds", "failedTaskIds", "summary"],
  properties: {
    overall: { type: "string", enum: ["pass", "partial", "fail"] },
    passedTaskIds: { type: "array", maxItems: 8, items: { type: "string" } },
    failedTaskIds: { type: "array", maxItems: 8, items: { type: "string" } },
    summary: { type: "string" },
  },
};

const workstreams = [
  {
    id: "completion-shapes",
    file: "plugins/luna-pool-orchestrator/scripts/app-server-client.mjs",
    question: "Does completion matching accept both nested params.turn.id and top-level params.turnId notification shapes?",
    signals: ["params.turn.id", "params.turnid"],
  },
  {
    id: "finalization-budget",
    file: "plugins/luna-pool-orchestrator/scripts/finalization.mjs",
    question: "For the default 120-second example, does the schedule reserve 40 seconds and leave an 80-second work budget?",
    signals: ["40", "80"],
  },
  {
    id: "stale-supervision",
    file: "plugins/luna-pool-orchestrator/scripts/supervision.mjs",
    question: "In auto mode, is the Luna supervisor consulted only when the worker snapshot is absent or silent for at least staleMs?",
    signals: ["silentms", "stalems"],
  },
  {
    id: "leader-routing",
    file: "plugins/luna-pool-orchestrator/scripts/leader.mjs",
    question: "Does automatic Leader reporting trigger for an independent verifier result or a reserved boundary?",
    signals: ["verifier", "reservedboundary"],
  },
  {
    id: "historical-cost",
    file: "plugins/luna-pool-orchestrator/scripts/pricing.mjs",
    question: "Is the visible Sol-only projection based on a versioned historical scale factor rather than same-token repricing?",
    signals: ["scalefactor", "historical"],
  },
  {
    id: "monotonic-progress",
    file: "plugins/luna-pool-orchestrator/scripts/jobs.mjs",
    question: "While a job is running, is reported progress monotonic and capped below the terminal 100 percent?",
    signals: ["math.max", "99.9"],
  },
  {
    id: "native-status",
    file: "plugins/luna-pool-orchestrator/scripts/status-window.mjs",
    question: "On Windows auto mode, is the native status window now the sole project-rendered live status surface unless explicitly disabled?",
    signals: ["win32", "true"],
  },
  {
    id: "blocking-await",
    file: "plugins/luna-pool-orchestrator/scripts/await-server.mjs",
    question: "Does await_task block on the job record and return the terminal result without a model polling loop?",
    signals: ["waitforjobrecord", "await_task"],
  },
];

function parseArguments(argv) {
  const options = { parallelism: [1, 4, 8], repeats: 1, output: null };
  for (const argument of argv) {
    if (argument.startsWith("--parallelism=")) {
      options.parallelism = argument.slice("--parallelism=".length).split(",").map(Number).filter((value) => [1, 4, 8].includes(value));
    } else if (argument.startsWith("--repeats=")) {
      options.repeats = Math.max(1, Math.min(3, Number(argument.slice("--repeats=".length)) || 1));
    } else if (argument.startsWith("--output=")) {
      options.output = path.resolve(argument.slice("--output=".length));
    }
  }
  if (!options.parallelism.length) throw new Error("Choose at least one of parallelism 1, 4, or 8.");
  return options;
}

function usageOf(run) {
  return normalizeUsage(run?.usage);
}

function scoreResult(workstream, run) {
  const output = run?.output;
  const searchable = JSON.stringify(output ?? {}).toLowerCase();
  const checks = {
    schema: Boolean(output && output.taskId === workstream.id),
    verdict: output?.verdict === "pass",
    path: String(output?.evidence?.path ?? "").replaceAll("\\", "/").endsWith(workstream.file),
    line: Number.isInteger(output?.evidence?.line) && output.evidence.line > 0,
    signals: workstream.signals.every((signal) => searchable.includes(signal)),
  };
  return { score: Object.values(checks).filter(Boolean).length, maximum: Object.keys(checks).length, checks };
}

async function mapWithConcurrency(items, parallelism, work) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(parallelism, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function runProfile({ executable, parallelism, repeat }) {
  const client = new AppServerClient({ executable });
  const profileStartedAt = Date.now();
  try {
    await client.start();
    const sessionStartedAt = Date.now();
    const workerThreads = await Promise.all(workstreams.map((workstream) => client.startThread({
      cwd: repoRoot,
      sandbox: "read-only",
      developerInstructions: `You are a cold benchmark worker ${workstream.id}. Inspect only the supplied file. Do not modify files, use external systems, or broaden scope. Return only the requested JSON schema.`,
    })));
    const leaderThread = await client.startThread({
      cwd: repoRoot,
      sandbox: "read-only",
      developerInstructions: "You are a benchmark aggregation leader. Do not inspect the repository, plan work, or use tools. Faithfully compress only the supplied worker results and return the requested JSON schema.",
    });
    const initializationMs = Date.now() - sessionStartedAt;
    const executionStartedAt = Date.now();
    const runs = await mapWithConcurrency(workstreams, parallelism, async (workstream, index) => {
      const run = await client.runTurn({
        threadId: workerThreads[index],
        text: `BENCHMARK_DELTA ${JSON.stringify({ taskId: workstream.id, file: workstream.file, question: workstream.question })}\nInspect the one scoped file with at most two read-only shell commands. Answer the question from exact code evidence. Use verdict=pass only when the claim is supported; otherwise fail or uncertain. Keep the summary and claim under 240 characters.`,
        cwd: repoRoot,
        sandboxPolicy: { type: "readOnly", networkAccess: false },
        outputSchema,
        timeoutMs: 120_000,
        effort: "max",
      });
      process.stderr.write(`[p${parallelism} r${repeat}] ${workstream.id} ${run.durationMs}ms\n`);
      return run;
    });
    const workerMs = Date.now() - executionStartedAt;
    const compactResults = runs.map((run) => run.output);
    const leaderStartedAt = Date.now();
    const leaderRun = await client.runTurn({
      threadId: leaderThread,
      text: `AGGREGATE_DELTA ${JSON.stringify(compactResults)}\nReport pass only when every supplied worker verdict is pass and every task ID is accounted for. Do not inspect files or call tools. Keep the summary under 300 characters.`,
      cwd: repoRoot,
      sandboxPolicy: { type: "readOnly", networkAccess: false },
      outputSchema: leaderSchema,
      timeoutMs: 60_000,
      effort: "high",
    });
    const leaderMs = Date.now() - leaderStartedAt;
    const scores = workstreams.map((workstream, index) => scoreResult(workstream, runs[index]));
    const usage = sumUsage([...runs.map(usageOf), usageOf(leaderRun)]);
    const cost = compareModelCost(usage);
    const coldInputCost = usage.inputTokens * 5 / 1_000_000;
    const outputCost = usage.outputTokens * 30 / 1_000_000;
    return {
      parallelism,
      repeat,
      initializationMs,
      workerMs,
      leaderMs,
      measuredWallMs: workerMs + leaderMs,
      totalWallMs: Date.now() - profileStartedAt,
      quality: {
        score: scores.reduce((sum, item) => sum + item.score, 0),
        maximum: scores.reduce((sum, item) => sum + item.maximum, 0),
        rate: scores.reduce((sum, item) => sum + item.score, 0) / scores.reduce((sum, item) => sum + item.maximum, 0),
        leaderOverall: leaderRun.output.overall,
        tasks: workstreams.map((workstream, index) => ({ id: workstream.id, ...scores[index] })),
      },
      usage,
      cost: {
        observed: cost.actual.amount,
        cacheRate: usage.cacheRate,
        cacheIgnoredColdEquivalent: coldInputCost + outputCost,
      },
    };
  } finally {
    client.close();
  }
}

function summarize(runs) {
  const serialRuns = runs.filter((run) => run.parallelism === 1);
  const serialWall = serialRuns.length
    ? serialRuns.reduce((sum, run) => sum + run.measuredWallMs, 0) / serialRuns.length
    : null;
  return [...new Set(runs.map((run) => run.parallelism))].map((parallelism) => {
    const group = runs.filter((run) => run.parallelism === parallelism);
    const average = (key) => group.reduce((sum, run) => sum + run[key], 0) / group.length;
    const measuredWallMs = average("measuredWallMs");
    return {
      parallelism,
      repeats: group.length,
      measuredWallMs,
      workerMs: average("workerMs"),
      leaderMs: average("leaderMs"),
      speedup: serialWall ? serialWall / measuredWallMs : null,
      qualityRate: group.reduce((sum, run) => sum + run.quality.rate, 0) / group.length,
      observedCost: group.reduce((sum, run) => sum + run.cost.observed, 0) / group.length,
      cacheIgnoredColdEquivalent: group.reduce((sum, run) => sum + run.cost.cacheIgnoredColdEquivalent, 0) / group.length,
      cacheRate: group.reduce((sum, run) => sum + run.cost.cacheRate, 0) / group.length,
    };
  });
}

const options = parseArguments(process.argv.slice(2));
const executable = await resolveCodexExecutable();
const runs = [];
for (let repeat = 1; repeat <= options.repeats; repeat += 1) {
  for (const parallelism of options.parallelism) {
    runs.push(await runProfile({ executable, parallelism, repeat }));
  }
}
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository: repoRoot,
  model: "gpt-5.6-luna",
  workerEffort: "max",
  leaderEffort: "high",
  taskCount: workstreams.length,
  cachePolicy: "Observed cache is reported, but cacheIgnoredColdEquivalent prices every input token at the uncached Luna rate.",
  summary: summarize(runs),
  runs,
};
if (options.output) {
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ generatedAt: report.generatedAt, output: options.output, summary: report.summary }, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
