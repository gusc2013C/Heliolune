import { randomUUID } from "node:crypto";

function publicSnapshot(job, now) {
  const usage = job.result?.usage ?? null;
  const cost = job.result?.cost ?? null;
  return {
    jobId: job.id,
    status: job.status,
    lane: job.lane,
    effort: job.effort,
    progress: job.progress,
    message: job.message,
    sequence: job.sequence,
    startedAt: new Date(job.startedAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
    elapsedMs: Math.max(0, now() - job.startedAt),
    updates: job.updates.slice(-8),
    workers: Object.values(job.workers).map((worker) => ({ ...worker })),
    resultStatus: job.result?.status ?? null,
    usage: usage ? {
      inputTokens: usage.inputTokens ?? 0,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    } : null,
    cost: cost ? {
      actual: cost.actual?.amount ?? cost.actualLunaCost ?? null,
      projectedSolOnly: cost.historicalProjection?.estimatedSolOnlyCost ?? null,
      estimatedSavings: cost.historicalProjection?.estimatedSavings ?? null,
      savingsPercent: cost.historicalProjection?.estimatedSavingsRate == null ? null : cost.historicalProjection.estimatedSavingsRate * 100,
      profile: cost.historicalProjection?.profileId ?? null,
    } : null,
    error: job.error,
  };
}

export class JobStore {
  constructor({ now = () => Date.now(), idFactory = randomUUID, maxJobs = 32, retentionMs = 60 * 60 * 1000, minimumIntervalMs = 1_000 } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.maxJobs = maxJobs;
    this.retentionMs = retentionMs;
    this.minimumIntervalMs = minimumIntervalMs;
    this.jobs = new Map();
    this.idleWaiters = new Set();
  }

  hasRunningJobs() {
    return [...this.jobs.values()].some((job) => job.status === "running");
  }

  waitForIdle() {
    if (!this.hasRunningJobs()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  #resolveIdleWaiters() {
    if (this.hasRunningJobs()) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  #prune() {
    const cutoff = this.now() - this.retentionMs;
    for (const [id, job] of this.jobs) {
      if (job.status !== "running" && job.updatedAt < cutoff) this.jobs.delete(id);
    }
    const completed = [...this.jobs.values()]
      .filter((job) => job.status !== "running")
      .sort((left, right) => left.updatedAt - right.updatedAt);
    while (this.jobs.size >= this.maxJobs && completed.length) {
      this.jobs.delete(completed.shift().id);
    }
  }

  start({ lane, effort = "max", workerLanes = [lane], activeLanes = [lane], run, onSnapshot }) {
    this.#prune();
    if (this.jobs.size >= this.maxJobs) throw new Error("Too many active Heliolune jobs; await an existing job before starting another.");
    const timestamp = this.now();
    const job = {
      id: this.idFactory(),
      lane,
      effort,
      status: "running",
      progress: 1,
      message: `Heliolune Leader · ${lane} job queued`,
      sequence: 1,
      startedAt: timestamp,
      updatedAt: timestamp,
      updates: [],
      workers: Object.fromEntries([...new Set(workerLanes)].map((workerLane) => [workerLane, {
        lane: workerLane,
        status: activeLanes.includes(workerLane) ? "queued" : "idle",
        progress: activeLanes.includes(workerLane) ? 1 : 0,
        explanation: null,
        updatedAt: new Date(timestamp).toISOString(),
      }])),
      result: null,
      error: null,
      subscribers: new Set(),
      promise: null,
      lastReportAt: timestamp - this.minimumIntervalMs,
    };
    const report = (progress, message, options = {}) => {
      const numeric = Number(progress);
      if (!Number.isFinite(numeric) || job.status !== "running") return false;
      const reportedAt = this.now();
      if (!options.force && reportedAt - job.lastReportAt < this.minimumIntervalMs) return false;
      job.progress = Math.max(job.progress, Math.min(99.9, Math.max(0, numeric)));
      job.message = String(message);
      job.sequence += 1;
      job.updatedAt = reportedAt;
      job.lastReportAt = reportedAt;
      job.updates.push({ sequence: job.sequence, progress: job.progress, message: job.message, at: new Date(job.updatedAt).toISOString() });
      job.updates = job.updates.slice(-20);
      const workerLane = options.workerLane ?? job.lane;
      const worker = job.workers[workerLane];
      if (worker) {
        const workerProgress = Number(options.workerProgress ?? numeric);
        worker.status = options.workerStatus ?? "working";
        worker.progress = Number.isFinite(workerProgress)
          ? Math.max(worker.progress, Math.min(100, Math.max(0, workerProgress)))
          : worker.progress;
        if (options.explanation) worker.explanation = String(options.explanation);
        worker.updatedAt = new Date(reportedAt).toISOString();
      }
      const snapshot = publicSnapshot(job, this.now);
      try { onSnapshot?.(snapshot); } catch { /* status sinks cannot affect the worker */ }
      for (const subscriber of job.subscribers) {
        try { subscriber(snapshot); } catch { /* status observers cannot affect the worker */ }
      }
      return true;
    };
    this.jobs.set(job.id, job);
    try { onSnapshot?.(publicSnapshot(job, this.now)); } catch { /* status sinks cannot affect the worker */ }
    job.promise = Promise.resolve()
      .then(() => run({ report }))
      .then((result) => {
        job.result = result;
        job.status = "completed";
        job.progress = 100;
        job.message = `Heliolune Leader · task complete · ${result?.status ?? "completed"} · ready for Sol`;
        if (job.workers[job.lane]) {
          job.workers[job.lane].status = "completed";
          job.workers[job.lane].progress = 100;
        }
        job.sequence += 1;
        job.updatedAt = this.now();
        return result;
      }, (error) => {
        job.status = "failed";
        job.progress = 100;
        job.error = error?.message ?? String(error);
        job.message = `Heliolune Leader · task failed · ${job.error}`;
        if (job.workers[job.lane]) {
          job.workers[job.lane].status = "failed";
          job.workers[job.lane].progress = 100;
        }
        job.sequence += 1;
        job.updatedAt = this.now();
        return null;
      })
      .finally(() => {
        const snapshot = publicSnapshot(job, this.now);
        try { onSnapshot?.(snapshot); } catch { /* status sinks cannot affect the worker */ }
        for (const subscriber of job.subscribers) {
          try { subscriber(snapshot); } catch { /* status observers cannot affect the worker */ }
        }
        job.subscribers.clear();
        this.#resolveIdleWaiters();
      });
    return publicSnapshot(job, this.now);
  }

  status(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown or expired Heliolune job: ${jobId}`);
    return publicSnapshot(job, this.now);
  }

  async wait(jobId, onUpdate) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown or expired Heliolune job: ${jobId}`);
    if (onUpdate) job.subscribers.add(onUpdate);
    try { await job.promise; }
    finally { if (onUpdate) job.subscribers.delete(onUpdate); }
    if (job.status === "failed") throw new Error(job.error);
    return job.result;
  }
}

export function createJobAwareShutdown({ store, exit = (code) => process.exit(code), log = () => {} }) {
  let shutdownPromise = null;
  return function requestShutdown(signal) {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      if (store.hasRunningJobs()) {
        try { log(`${signal} received; deferring Heliolune shutdown until active jobs reach a terminal state.`); }
        catch { /* shutdown logging must not affect job ownership */ }
        await store.waitForIdle();
      }
      exit(0);
    })();
    return shutdownPromise;
  };
}

export function createProcessKeepAlive({
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  intervalMs = 1_000,
} = {}) {
  const handle = setIntervalImpl(() => {}, intervalMs);
  let released = false;
  return function releaseKeepAlive() {
    if (released) return;
    released = true;
    clearIntervalImpl(handle);
  };
}
