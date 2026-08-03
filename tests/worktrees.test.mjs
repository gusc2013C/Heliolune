import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cleanupParallelWriteBatch,
  collectWorktreePatch,
  integrateParallelWriteBatch,
  prepareParallelWriteBatch,
  sameFilesystemPath,
  worktreeFor,
} from "../plugins/luna-pool-orchestrator/scripts/worktrees.mjs";

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim())));
  });
}

async function repository(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "heliolune-worktree-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "heliolune@example.invalid"]);
  await git(root, ["config", "user.name", "Heliolune Test"]);
  await writeFile(path.join(root, "a.txt"), "a0\n");
  await writeFile(path.join(root, "b.txt"), "b0\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "fixture"]);
  return root;
}

function streams() {
  return [
    { id: "a", mode: "implement", scope: ["a.txt"] },
    { id: "b", mode: "repair", scope: ["b.txt", "new.txt"] },
  ];
}

test("repository-root comparison is Windows case and separator insensitive", () => {
  assert.equal(sameFilesystemPath("C:\\Work\\Heliolune", "c:/work/heliolune", { platform: "win32" }), true);
  assert.equal(sameFilesystemPath("/work/Heliolune", "/work/heliolune", { platform: "linux" }), false);
});

test("parallel write worktrees apply disjoint tracked and untracked changes without staging", async (t) => {
  const root = await repository(t);
  const artifacts = path.join(os.tmpdir(), `heliolune-patches-${Date.now()}-${process.pid}`);
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const workstreams = streams();
  const session = await prepareParallelWriteBatch({ cwd: root, batchId: "test", workstreams, artifactDirectory: artifacts });
  t.after(() => cleanupParallelWriteBatch(session));
  await writeFile(path.join(worktreeFor(session, "a"), "a.txt"), "a1\n");
  await writeFile(path.join(worktreeFor(session, "b"), "b.txt"), "b1\n");
  await writeFile(path.join(worktreeFor(session, "b"), "new.txt"), "new\n");
  const patches = await Promise.all(workstreams.map((workstream) => collectWorktreePatch(session, workstream)));
  const integration = await integrateParallelWriteBatch(session, patches, [
    { id: "a", status: "completed" }, { id: "b", status: "completed" },
  ]);
  assert.equal(integration.applied, true);
  const contents = await Promise.all(["a.txt", "b.txt", "new.txt"].map(async (file) => (await readFile(path.join(root, file), "utf8")).replaceAll("\r\n", "\n")));
  assert.deepEqual(contents, ["a1\n", "b1\n", "new\n"]);
  assert.equal(await git(root, ["diff", "--cached", "--name-only"]), "");
  assert.match(await git(root, ["status", "--porcelain"]), /a\.txt/);
});

test("adaptive single-writer worktree applies one completed scoped patch", async (t) => {
  const root = await repository(t);
  const artifacts = path.join(os.tmpdir(), `heliolune-patches-${Date.now()}-${process.pid}`);
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const workstreams = [{ id: "owner", mode: "repair", scope: ["a.txt"] }];
  const session = await prepareParallelWriteBatch({ cwd: root, batchId: "adaptive-one", workstreams, artifactDirectory: artifacts });
  t.after(() => cleanupParallelWriteBatch(session));
  await writeFile(path.join(worktreeFor(session, "owner"), "a.txt"), "adaptive\n");
  const patch = await collectWorktreePatch(session, workstreams[0]);
  const integration = await integrateParallelWriteBatch(session, [patch], [{ id: "owner", status: "completed" }]);
  assert.equal(integration.applied, true);
  assert.equal((await readFile(path.join(root, "a.txt"), "utf8")).replaceAll("\r\n", "\n"), "adaptive\n");
  assert.equal(await git(root, ["diff", "--cached", "--name-only"]), "");
});

test("out-of-scope worktree changes block integration and preserve main state", async (t) => {
  const root = await repository(t);
  const artifacts = path.join(os.tmpdir(), `heliolune-patches-${Date.now()}-${process.pid}`);
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const workstreams = [{ id: "a", mode: "implement", scope: ["a.txt"] }];
  const session = await prepareParallelWriteBatch({ cwd: root, batchId: "test", workstreams, artifactDirectory: artifacts });
  t.after(() => cleanupParallelWriteBatch(session));
  await writeFile(path.join(worktreeFor(session, "a"), "b.txt"), "escaped\n");
  const patch = await collectWorktreePatch(session, workstreams[0]);
  const integration = await integrateParallelWriteBatch(session, [patch], [{ id: "a", status: "completed" }]);
  assert.equal(integration.applied, false);
  assert.equal(integration.reason, "out-of-scope-changes");
  assert.equal(await readFile(path.join(root, "b.txt"), "utf8"), "b0\n");
  assert.ok((await readFile(patch.patchPath)).length > 0);
});

test("a failed read-only companion does not block a completed isolated writer", async (t) => {
  const root = await repository(t);
  const artifacts = path.join(os.tmpdir(), `heliolune-patches-${Date.now()}-${process.pid}`);
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const workstreams = [
    { id: "owner", mode: "repair", scope: ["a.txt"] },
    { id: "review", mode: "analyze", scope: ["a.txt"] },
  ];
  const session = await prepareParallelWriteBatch({ cwd: root, batchId: "test", workstreams, artifactDirectory: artifacts });
  t.after(() => cleanupParallelWriteBatch(session));
  await writeFile(path.join(worktreeFor(session, "owner"), "a.txt"), "a1\n");
  const patches = await Promise.all(workstreams.map((workstream) => collectWorktreePatch(session, workstream)));
  const integration = await integrateParallelWriteBatch(session, patches, [
    { id: "owner", status: "completed" }, { id: "review", status: "failed" },
  ]);
  assert.equal(integration.applied, true);
  assert.equal((await readFile(path.join(root, "a.txt"), "utf8")).replaceAll("\r\n", "\n"), "a1\n");
});

test("dirty main worktrees are rejected before any parallel checkout is created", async (t) => {
  const root = await repository(t);
  await writeFile(path.join(root, "a.txt"), "dirty\n");
  await assert.rejects(
    prepareParallelWriteBatch({ cwd: root, batchId: "test", workstreams: streams(), artifactDirectory: path.join(root, ".patches") }),
    /clean main worktree/,
  );
});

test("a changed main HEAD blocks integration while retaining the isolated patch", async (t) => {
  const root = await repository(t);
  const artifacts = path.join(os.tmpdir(), `heliolune-patches-${Date.now()}-${process.pid}`);
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const workstreams = [{ id: "a", mode: "repair", scope: ["a.txt"] }];
  const session = await prepareParallelWriteBatch({ cwd: root, batchId: "test", workstreams, artifactDirectory: artifacts });
  t.after(() => cleanupParallelWriteBatch(session));
  await writeFile(path.join(worktreeFor(session, "a"), "a.txt"), "a1\n");
  const patch = await collectWorktreePatch(session, workstreams[0]);
  await writeFile(path.join(root, "main.txt"), "new head\n");
  await git(root, ["add", "main.txt"]);
  await git(root, ["commit", "-m", "move head"]);
  const integration = await integrateParallelWriteBatch(session, [patch], [{ id: "a", status: "completed" }]);
  assert.equal(integration.applied, false);
  assert.equal(integration.reason, "head-changed");
  assert.equal(await readFile(path.join(root, "a.txt"), "utf8"), "a0\n");
});
