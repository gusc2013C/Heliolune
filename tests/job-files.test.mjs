import assert from "node:assert/strict";
import { link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimJobRequest,
  failOrphanedRecord,
  jobClaimFilePath,
  processIsAlive,
  readJobClaim,
  readJobRecord,
  readJobRequest,
  removeJobClaim,
  removeJobRequest,
  waitForJobRecord,
  waitForProcessExit,
  writeAtomicJson,
  writeJobRecord,
  writeJobRequest,
} from "../plugins/luna-pool-orchestrator/scripts/job-files.mjs";

const jobId = "123e4567-e89b-42d3-a456-426614174000";

test("job result files are atomic, scoped, and awaitable across MCP processes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-job-files-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJobRecord(jobId, { status: "running" }, root);
  assert.equal((await readJobRecord(jobId, root)).status, "running");
  const waiting = waitForJobRecord(jobId, { root, timeoutMs: 1_000, pollMs: 10 });
  await writeJobRecord(jobId, { status: "completed", result: { status: "completed" } }, root);
  assert.deepEqual(await waiting, { status: "completed" });
});

test("job result files reject path-shaped identifiers", async () => {
  await assert.rejects(readJobRecord("../escape"), /Invalid Heliolune job id/);
});

test("detached runner requests are atomic, scoped, and removable", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-job-request-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const request = { version: "0.6.5", kind: "task", args: { objective: "bounded" } };
  await writeJobRequest(jobId, request, root);
  assert.deepEqual(await readJobRequest(jobId, root), request);
  await removeJobRequest(jobId, root);
  assert.equal(await readJobRequest(jobId, root), null);
});

test("runner request claim is atomic and admits only one owner", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-job-claim-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const request = { version: "0.6.5", kind: "task", args: { objective: "once" } };
  for (let index = 0; index < 20; index += 1) {
    const claimJobId = `123e4567-e89b-42d3-a456-${index.toString(16).padStart(12, "0")}`;
    await writeJobRequest(claimJobId, request, root);
    const [first, second] = await Promise.all([
      claimJobRequest(claimJobId, root, { pid: 1001 }),
      claimJobRequest(claimJobId, root, { pid: 1002 }),
    ]);
    const winner = first ?? second;
    assert.deepEqual(winner.request, request);
    assert.equal([first, second].filter(Boolean).length, 1);
    await removeJobClaim(claimJobId, root);
  }
});

test("claim metadata becomes visible only after its JSON is complete", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-job-claim-publish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJobRequest(jobId, { version: "0.6.5", kind: "task", args: {} }, root);
  let publish;
  let staged;
  const stagedPromise = new Promise((resolve) => { staged = resolve; });
  const publishPromise = new Promise((resolve) => { publish = resolve; });
  const fsImpl = {
    readFile,
    writeFile: async (...args) => { await writeFile(...args); staged(); },
    link: async (...args) => { await publishPromise; return link(...args); },
    rm,
  };
  const claiming = claimJobRequest(jobId, root, { fsImpl, pid: 4242 });
  await stagedPromise;
  assert.equal(await readJobClaim(jobId, root), null);
  publish();
  assert.ok(await claiming);
  assert.equal((await readJobClaim(jobId, root)).pid, 4242);
  await removeJobClaim(jobId, root);
});

test("atomic JSON writes remove temporary files after write or rename failure", async () => {
  for (const failingOperation of ["writeFile", "rename"]) {
    const removed = [];
    const fsImpl = {
      async writeFile() { if (failingOperation === "writeFile") throw new Error("write failed"); },
      async rename() { if (failingOperation === "rename") throw new Error("rename failed"); },
      async rm(file, options) { removed.push({ file, options }); },
    };
    await assert.rejects(
      writeAtomicJson("C:\\jobs\\record.json", { status: "starting" }, { fsImpl, pid: 42, nonce: "test" }),
      new RegExp(`${failingOperation === "writeFile" ? "write" : "rename"} failed`),
    );
    assert.deepEqual(removed, [{ file: "C:\\jobs\\record.json.42.test.tmp", options: { force: true } }]);
  }
});

test("atomic JSON replacement retries transient Windows sharing violations", async () => {
  let renames = 0;
  const removed = [];
  const fsImpl = {
    async writeFile() {},
    async rename() {
      renames += 1;
      if (renames < 3) throw Object.assign(new Error("sharing violation"), { code: "EPERM" });
    },
    async rm(file, options) { removed.push({ file, options }); },
  };
  await writeAtomicJson("C:\\jobs\\record.json", { status: "running" }, {
    fsImpl, pid: 42, nonce: "retry", attempts: 3, retryMs: 0,
  });
  assert.equal(renames, 3);
  assert.deepEqual(removed, []);
});

test("request cleanup retries transient filesystem failures", async () => {
  let calls = 0;
  const fsImpl = {
    async rm() {
      calls += 1;
      if (calls < 3) throw new Error("temporarily locked");
    },
  };
  await removeJobRequest(jobId, "C:\\state", { fsImpl, attempts: 4, retryMs: 0 });
  assert.equal(calls, 3);
});

test("terminal delivery does not depend on an already-consumed runner request", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-terminal-delivery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJobRecord(jobId, { status: "completed", result: { status: "completed", value: 42 } }, root);
  assert.deepEqual(await waitForJobRecord(jobId, { root, timeoutMs: 100, pollMs: 10 }), { status: "completed", value: 42 });
  assert.equal(await readJobRequest(jobId, root), null);
});

test("an active job is not failed by a legacy expiry timestamp", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-renewable-job-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJobRecord(jobId, {
    status: "running",
    ownerPid: process.pid,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  }, root);
  const waiting = waitForJobRecord(jobId, { root, timeoutMs: 1_000, pollMs: 10 });
  setTimeout(() => void writeJobRecord(jobId, { status: "completed", result: { status: "completed" } }, root), 40);
  assert.deepEqual(await waiting, { status: "completed" });
});

test("an unclaimed detached runner request becomes an observable terminal failure", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-runner-startup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJobRequest(jobId, { version: "0.6.5", kind: "task", args: {} }, root);
  await writeJobRecord(jobId, {
    status: "starting",
    startupDeadline: new Date(1_000).toISOString(),
    snapshot: { jobId, status: "running", progress: 0, workers: [] },
  }, root);
  await assert.rejects(
    waitForJobRecord(jobId, { root, timeoutMs: 100, pollMs: 10, now: () => 2_000 }),
    /startup lease expired/,
  );
  assert.equal((await readJobRecord(jobId, root)).status, "failed");
  assert.equal(await readJobRequest(jobId, root), null);
});

test("startup expiry cannot overwrite a runner that just claimed ownership", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-startup-race-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stale = { status: "starting", startupDeadline: new Date(1_000).toISOString() };
  await writeJobRecord(jobId, { status: "running", ownerPid: process.pid, snapshot: { jobId, status: "running" } }, root);
  assert.deepEqual(
    await failOrphanedRecord(jobId, stale, root, "stale startup lease"),
    { terminal: false, advanced: true },
  );
  assert.equal((await readJobRecord(jobId, root)).status, "running");
});

test("startup expiry renews while the atomic claim owner is alive", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-claim-lease-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stale = { status: "starting", startupDeadline: new Date(1_000).toISOString() };
  await writeJobRecord(jobId, { ...stale, snapshot: { jobId, status: "starting" } }, root);
  await writeJobRequest(jobId, { version: "0.6.5", kind: "task", args: {} }, root);
  await claimJobRequest(jobId, root, { pid: process.pid });
  assert.deepEqual(
    await failOrphanedRecord(jobId, stale, root, "stale startup lease"),
    { terminal: false, claimed: true },
  );
  assert.equal((await readJobRecord(jobId, root)).status, "starting");
  await removeJobClaim(jobId, root);
});

test("a live claim cannot extend runner startup forever", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-claim-expired-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stale = { status: "starting", startupDeadline: new Date(1_000).toISOString(), snapshot: { jobId, status: "starting" } };
  await writeJobRecord(jobId, stale, root);
  await writeJobRequest(jobId, { version: "0.6.5", kind: "task", args: {} }, root);
  await claimJobRequest(jobId, root, { pid: process.pid, now: () => 0, startupLeaseMs: 1_000 });
  await assert.rejects(
    failOrphanedRecord(jobId, stale, root, "runner claim startup expired", { now: () => 2_000 }),
    /runner claim startup expired/,
  );
  assert.equal((await readJobRecord(jobId, root)).status, "failed");
});

test("a partial claim becomes a clean startup failure instead of a JSON parse error", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-claim-partial-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stale = { status: "starting", startupDeadline: new Date(1_000).toISOString(), snapshot: { jobId, status: "starting" } };
  await writeJobRecord(jobId, stale, root);
  await writeFile(jobClaimFilePath(jobId, root), "{", "utf8");
  await assert.rejects(
    failOrphanedRecord(jobId, stale, root, "partial claim startup failed", { now: () => 2_000 }),
    /partial claim startup failed/,
  );
  const failed = await readJobRecord(jobId, root);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "partial claim startup failed");
});

test("await fails an orphaned running job instead of hanging", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-orphan-job-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJobRecord(jobId, {
    status: "running",
    ownerPid: 424242,
    snapshot: { status: "running", progress: 90, workers: [{ lane: "burst-1", status: "working", progress: 90 }] },
  }, root);
  await assert.rejects(
    waitForJobRecord(jobId, { root, timeoutMs: 1_000, pollMs: 10, isAlive: () => false }),
    /orchestrator process 424242 exited/,
  );
  const failed = await readJobRecord(jobId, root);
  assert.equal(failed.status, "failed");
  assert.equal(failed.snapshot.workers[0].status, "failed");
  assert.equal(processIsAlive(-1), false);
});

test("terminal cleanup waits for the detached runner to exit", async () => {
  let checks = 0;
  assert.equal(await waitForProcessExit(4242, {
    timeoutMs: 1_000,
    pollMs: 1,
    isAlive: () => ++checks < 3,
  }), true);
  assert.equal(checks, 3);
  await assert.rejects(
    waitForProcessExit(4242, { timeoutMs: 5, pollMs: 1, isAlive: () => true }),
    /did not exit/,
  );
  await assert.rejects(waitForProcessExit(0), /invalid PID/);
});
