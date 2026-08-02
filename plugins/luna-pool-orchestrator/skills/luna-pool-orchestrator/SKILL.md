---
name: luna-pool-orchestrator
description: Delegate bounded engineering work from a GPT-5.6 Sol controller through one compact start call that defaults to four parallel GPT-5.6 Luna/max workers, one Luna/high operations leader, isolated writes, a token-free native status window, and cost reporting. Use when reducing Sol token cost matters while Sol retains planning, architecture, risk, review, and final acceptance.
---

# Heliolune fast path

Sol plans once, sends one compact delta, blocks without generating, then reviews the integrated result.

## Gate

Before repository exploration, require `luna-pool.runtime_info`, `luna-pool.start_task`, and `luna-await.await_task`. Call `runtime_info` once and require:

- `version=0.6.3`, `defaultProfile=speed-first`, `defaultParallelism=4`;
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
- only useful volatile `repoState`, `risk`, `reservedBoundary`, or `timeoutSeconds`.

Do not paste files, transcripts, stable role text, or generic project history. Keep roles stable and send only incremental task state; workers inspect the repository.

The default `speed-first` route immediately runs four Luna/max workstreams: one exact-scope owner plus contract, edge/test, and correctness-risk reviews. The contract lane is concurrent, never a serial preflight; it may interrupt the writer only with `status=blocked` and a real reserved `needsSol` decision. Review lanes inspect independent base snapshots and cannot verify the concurrent writer.

Only the owner writes, in a detached ephemeral worktree. Heliolune applies its patch only after clean-state, completion, scope, overlap, and `git apply --check --index` gates pass. Partial/failed patches are not applied; non-empty in-scope artifacts are reported as quarantined recovery candidates. The Luna/high Leader manages liveness and compression only—never planning, assignment, repository inspection, or acceptance.

Burst threads are ephemeral and the standalone app-server is hidden. On Windows, the `Heliolune Leader` WPF window is the only automatic visible worker surface; no Codex Desktop worker task or console window should appear.

Use `profile=token-first` only for a dirty/non-Git mutating checkout, impossible write isolation, or a strict sequential dependency. Read-only work stays parallel. `start_batch` is advanced-only for explicitly designed 2–8 streams. Prefer scope near 90 seconds; narrow scope before raising a bounded deadline, which may reach 600 seconds.

## Await once

Immediately call `luna-await.await_task` exactly once with the returned `jobId`. While blocked, stop generating: do not poll, read job files, send progress commentary, or open another model session. The native window provides token-free bilingual status, natural-language activity, timing, cache, and projected savings. Disable it only at the user's request.

## Accept

Inspect compact evidence and `integration`. For mutations, review actual main-checkout paths and run the smallest decisive acceptance check. Never blindly apply held patches or replay Luna exploration; reopen files only for contradictions, reserved decisions, failed checks, or unresolved risk.

Report result, checks, risks, wall time, and exact Luna usage/cost when available. Reasoning tokens are already included in output. Sol-only savings are benchmark projections, not billed cost. Call `cost_dashboard` only for requested cumulative statistics.
