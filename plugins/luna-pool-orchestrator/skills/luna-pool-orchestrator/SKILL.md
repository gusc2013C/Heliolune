---
name: luna-pool-orchestrator
description: Delegate bounded engineering work through a validated TASK_DAG_V1 with READY dependencies, leases, adaptive 1/2/4-worker GPT-5.6 Luna/max widening, affinity scheduling, candidate-bound challenges, isolated writes, and token-free native status. Use when reducing Sol cost matters while Sol retains architecture, risk, review, and final acceptance.
---

# Heliolune fast path

Sol plans once, sends one compact delta, blocks without generating, then reviews the integrated result.

## Gate

Before repository exploration, require `luna-pool.runtime_info`, `luna-pool.start_task`, and `luna-await.await_task`. Call `runtime_info` once and require:

- `version=0.7.0-alpha.2`, `buildId=0.7.0-alpha.2-task-dag-r1`, `promptVersion=mcp-v17-task-dag`;
- `defaultProfile=adaptive`, `defaultParallelism=1`, `adaptiveParallelism=[1,2,4]`, `taskGraph=TASK_DAG_V1`;
- `burstThreadsEphemeral=true`, `appServerWindowHidden=true`;
- on Windows, `statusSurface=native-window`.

If anything is absent or mismatched, stop before paid work and request a new Codex task or app restart. Never inspect plugin caches, manifests, or job files; never manually launch the MCP or emulate it with Sol agents. Do not copy or bundle Codex.

## Authority

Sol alone owns requirement interpretation, architecture, security/trust boundaries, public APIs and compatibility, irreversible migrations, cross-component tradeoffs, residual-risk acceptance, integration review, final acceptance, and the user response. Luna and the Leader may report `needsSol`; they never resolve those decisions.

## Start once

Call `luna-pool.start_task` with only:

- absolute repository `cwd`;
- owner `lane`: `core`, `tests`, or `integration`;
- `mode`: `analyze`, `implement`, or `repair`;
- one outcome-oriented `objective`;
- 1–8 testable `acceptance` items;
- exact files or narrowest relevant directories in `scope`;
- only useful volatile `repoState`, `risk`, or `reservedBoundary`.

Do not paste files, transcripts, stable role text, or generic project history. Keep roles stable and send only incremental task state; workers inspect the repository.

The default `adaptive` route creates a validated task graph and starts at width one. Independent READY backlog widens it to two and then four; unmet dependencies never run, lease conflicts fail before paid work, and affinity/critical depth choose the next node. Narrow low-risk work uses one owner. Mutating moderate/high-risk work creates post-patch challenge nodes that depend on the owner, run on a different slot, inspect its exact worktree, and bind results to a SHA-256 candidate fingerprint. Use explicit `throughput` (or legacy `speed-first`) to activate the four-way set immediately.

Only the owner writes, in a detached ephemeral worktree. Heliolune applies its patch only after clean-state, completion, scope, overlap, and `git apply --check --index` gates pass. Partial/failed patches are not applied; non-empty in-scope artifacts are reported as quarantined recovery candidates. Low-risk one/two-worker terminal bundles return deterministically unless failure, high risk, integration hold, or needsSol requires compression. The Luna/high Leader manages liveness and compression only—never planning, assignment, repository inspection, or acceptance.

Burst threads are ephemeral and the standalone app-server is hidden. On Windows, the `Heliolune Leader` WPF window is the only automatic visible worker surface; no Codex Desktop worker task or console window should appear.

Use `profile=token-first` only for a dirty/non-Git mutating checkout, impossible write isolation, or a strict sequential dependency. Read-only work stays parallel. `start_batch` is advanced-only for explicitly designed 1–8 TASK_DAG_V1 nodes. Use `dependsOn`, `readLease`, `writeLease`, `priority`, `preferredAffinity`, and optional-node `completionQuorum` only when Sol has designed those deterministic relationships. Chained writers are rejected in alpha.2 because a successor worktree cannot safely inherit an unintegrated predecessor patch. `checkpointSeconds` remains only the first renewable liveness observation, never an execution deadline.

Workers use renewable liveness leases. Recent app-server activity renews a lease without a model call and there is no fixed execution cutoff. Sustained silence wakes the shared Luna/high Leader; only a high-confidence stall decision may interrupt a worker. Ambiguous evidence, an unavailable Leader, or a low/medium-confidence interrupt recommendation keeps the lease active for another check. Four consecutive checks with no app-server activity trip a local inactivity circuit breaker so an unreachable or wedged worker becomes a terminal task result instead of hanging forever.

## Await once

Immediately call `luna-await.await_task` exactly once with the returned `jobId` and `buildId`; the required build identity makes a stale same-version await server fail closed. This wait has no Heliolune deadline and ends only at a terminal result or orphaned orchestrator process. While blocked, stop generating: do not poll, read job files, send progress commentary, or open another model session. The native window provides token-free bilingual status, natural-language activity, timing, cache, and projected savings. Disable it only at the user's request.

## Accept

Inspect compact evidence and `integration`. For mutations, review actual main-checkout paths and run the smallest decisive acceptance check. Never blindly apply held patches or replay Luna exploration; reopen files only for contradictions, reserved decisions, failed checks, or unresolved risk.

Report result, checks, risks, adaptive route, TASK_NODE telemetry, wall time, and exact Luna usage/cost when available. Metrics explicitly listed as unavailable are not inferred. Reasoning tokens are already included in output. Sol-only savings are benchmark projections, not billed cost. Call `cost_dashboard` only for requested cumulative statistics.
