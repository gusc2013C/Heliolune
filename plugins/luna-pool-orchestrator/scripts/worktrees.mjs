import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const WORKTREE_PREFIX = "heliolune-worktrees-";
const MAX_GIT_OUTPUT = 32 * 1024 * 1024;

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let size = 0;
    const collect = (target) => (chunk) => {
      size += chunk.length;
      if (size > MAX_GIT_OUTPUT) {
        child.kill();
        reject(new Error("Git output exceeded Heliolune's 32 MiB safety limit"));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", reject);
    child.once("exit", (code) => {
      const output = Buffer.concat(stdout);
      const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
      if (code === 0) resolve(output);
      else reject(new Error(`git ${args[0]} failed${diagnostic ? `: ${diagnostic}` : ""}`));
    });
  });
}

function text(buffer) {
  return buffer.toString("utf8").trim();
}

function gitPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function comparable(value) {
  const normalized = gitPath(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function sameFilesystemPath(left, right, { platform = process.platform } = {}) {
  const normalize = (value) => gitPath(path.resolve(value));
  const leftPath = normalize(left);
  const rightPath = normalize(right);
  return platform === "win32"
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

function pathInsideScope(changedPath, scopes) {
  const candidate = comparable(changedPath);
  return scopes.some((scope) => {
    const boundary = comparable(scope);
    return candidate === boundary || candidate.startsWith(`${boundary}/`);
  });
}

function parseNullList(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean).map(gitPath);
}

async function cleanState(repoRoot) {
  return text(await git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]));
}

function validateCleanupRoot(root) {
  const resolved = path.resolve(root);
  const temporary = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== temporary || !path.basename(resolved).startsWith(WORKTREE_PREFIX)) {
    throw new Error(`Refusing to clean an unmanaged worktree root: ${resolved}`);
  }
  return resolved;
}

export function batchNeedsWorktrees(workstreams) {
  return workstreams.some((workstream) => (workstream.mode ?? "analyze") !== "analyze");
}

export async function prepareParallelWriteBatch({ cwd, batchId, workstreams, artifactDirectory }) {
  const requested = await fs.realpath(path.resolve(cwd));
  const repoRoot = await fs.realpath(path.resolve(text(await git(requested, ["rev-parse", "--show-toplevel"]))));
  if (!sameFilesystemPath(requested, repoRoot)) throw new Error("Parallel write batches must use the Git repository root as cwd");
  if (await cleanState(repoRoot)) throw new Error("Parallel writes require a clean main worktree; use token-first when local changes already exist");
  const baseCommit = text(await git(repoRoot, ["rev-parse", "--verify", "HEAD"]));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), WORKTREE_PREFIX));
  const session = { batchId, repoRoot, baseCommit, root, artifactDirectory: path.resolve(artifactDirectory), entries: [] };
  await fs.mkdir(session.artifactDirectory, { recursive: true });
  try {
    for (const [index, workstream] of workstreams.entries()) {
      const worktreePath = path.join(root, `worker-${index + 1}`);
      await git(repoRoot, ["worktree", "add", "--detach", worktreePath, baseCommit]);
      session.entries.push({ index, id: workstream.id, workstream, worktreePath });
    }
    return session;
  } catch (error) {
    await cleanupParallelWriteBatch(session).catch(() => {});
    await fs.rm(session.artifactDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export function worktreeFor(session, workstreamId) {
  const entry = session?.entries.find((candidate) => candidate.id === workstreamId);
  if (!entry) throw new Error(`No isolated worktree for workstream: ${workstreamId}`);
  return entry.worktreePath;
}

export async function collectWorktreePatch(session, workstream) {
  const entry = session.entries.find((candidate) => candidate.id === workstream.id);
  if (!entry) throw new Error(`No isolated worktree for workstream: ${workstream.id}`);
  await git(entry.worktreePath, ["add", "-A", "--", "."]);
  const changedPaths = parseNullList(await git(entry.worktreePath, ["diff", "--cached", "--name-only", "-z", "HEAD", "--"]));
  const outOfScope = changedPaths.filter((changedPath) => !pathInsideScope(changedPath, workstream.scope));
  const patch = await git(entry.worktreePath, ["diff", "--cached", "--binary", "--full-index", "HEAD", "--"]);
  const patchPath = path.join(session.artifactDirectory, `worker-${entry.index + 1}.patch`);
  await fs.writeFile(patchPath, patch);
  return {
    id: workstream.id,
    mode: workstream.mode,
    patchPath,
    patchBytes: patch.length,
    candidateFingerprint: createHash("sha256").update(patch).digest("hex"),
    changedPaths,
    outOfScope,
  };
}

export async function integrateParallelWriteBatch(session, patches, executions) {
  const executionById = new Map(executions.map((execution) => [execution.id, execution]));
  const incomplete = patches
    .filter((record) => record.mode !== "analyze" && executionById.get(record.id)?.status !== "completed")
    .map((record) => record.id);
  if (incomplete.length) return { applied: false, reason: "incomplete-workstreams", workstreams: incomplete, changedPaths: [] };
  const scopeViolations = patches.filter((record) => record.outOfScope.length).map((record) => ({ id: record.id, paths: record.outOfScope }));
  if (scopeViolations.length) return { applied: false, reason: "out-of-scope-changes", violations: scopeViolations, changedPaths: [] };

  const owners = new Map();
  const overlaps = [];
  for (const record of patches) {
    for (const changedPath of record.changedPaths) {
      const key = comparable(changedPath);
      if (owners.has(key)) overlaps.push({ path: changedPath, workstreams: [owners.get(key).id, record.id] });
      else owners.set(key, { id: record.id, path: changedPath });
    }
  }
  if (overlaps.length) return { applied: false, reason: "overlapping-changes", overlaps, changedPaths: [] };

  const currentHead = text(await git(session.repoRoot, ["rev-parse", "--verify", "HEAD"]));
  if (currentHead !== session.baseCommit) return { applied: false, reason: "head-changed", baseCommit: session.baseCommit, currentHead, changedPaths: [] };
  if (await cleanState(session.repoRoot)) return { applied: false, reason: "main-worktree-changed", changedPaths: [] };

  const applicable = patches.filter((record) => record.patchBytes > 0);
  const changedPaths = [...owners.values()].map((owner) => owner.path);
  if (applicable.length) {
    const patchPaths = applicable.map((record) => record.patchPath);
    await git(session.repoRoot, ["apply", "--check", "--index", "--binary", ...patchPaths]);
    await git(session.repoRoot, ["apply", "--index", "--binary", ...patchPaths]);
    if (changedPaths.length) await git(session.repoRoot, ["reset", "HEAD", "--", ...changedPaths]);
  }
  await fs.rm(session.artifactDirectory, { recursive: true, force: true });
  return { applied: true, reason: "safe-apply", baseCommit: session.baseCommit, changedPaths };
}

export async function cleanupParallelWriteBatch(session) {
  if (!session?.root) return;
  const root = validateCleanupRoot(session.root);
  for (const entry of [...(session.entries ?? [])].reverse()) {
    await git(session.repoRoot, ["worktree", "remove", "--force", entry.worktreePath]).catch(() => {});
  }
  await git(session.repoRoot, ["worktree", "prune"]).catch(() => {});
  await fs.rm(root, { recursive: true, force: true });
  await git(session.repoRoot, ["worktree", "prune"]).catch(() => {});
}
