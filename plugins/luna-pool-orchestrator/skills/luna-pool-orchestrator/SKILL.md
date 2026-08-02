---
name: luna-pool-orchestrator
description: Delegate bounded engineering work from a GPT-5.6 Sol controller through one compact start call that defaults to four parallel GPT-5.6 Luna/max workers, one Luna/high operations leader, isolated writes, a token-free native status window, and cost reporting. Use when reducing Sol token cost matters while Sol retains planning, architecture, risk, review, and final acceptance.
---

# Heliolune fast path

Heliolune is a blocking delegation boundary. Sol plans once, sends one compact delta, waits without generating tokens, then reviews the integrated result.

## Availability gate

Before doing repository exploration, confirm that both `luna-pool.start_task` and `luna-await.await_task` are exposed in the current task. If either is absent, stop and tell the user to restart Codex or open a new task so the installed plugin can load. Never search plugin caches, read manifests, inspect job files, manually launch MCP scripts, or emulate Heliolune with Sol agents. Those paths waste tokens and do not preserve the blocking runtime.

The runtime requires an official standalone Codex CLI supporting `app-server` and `gpt-5.6-luna`, resolved from `CODEX_APP_SERVER_EXECUTABLE`, `CODEX_EXECUTABLE`, or `codex` on `PATH`. Do not copy or bundle a Codex executable.

## Sol boundary

Sol alone owns requirement interpretation, architecture, security and trust boundaries, public APIs and compatibility, irreversible migrations, cross-component tradeoffs, residual-risk acceptance, integration review, and the final user response. Luna and the Leader may report `needsSol`; they must never resolve those decisions.

## Start once

Call `luna-pool.start_task` with only:

- absolute repository `cwd`;
- owner `lane`: `core`, `tests`, or `integration`;
- `mode`: `analyze`, `implement`, or `repair`;
- one outcome-oriented `objective`;
- 1–8 testable `acceptance` items;
- exact files or the narrowest relevant directories in `scope`;
- optional volatile `repoState`, `risk`, `reservedBoundary`, and `timeoutSeconds`.

Do not paste repository files, transcripts, stable role text, or generic project background. Luna inspects the repository. Keep the role and scope stable; send only incremental task state.

`start_task` defaults to `profile="speed-first"`. The MCP deterministically creates four active Luna/max workstreams: one exact-scope owner plus read-only contract, edge/test, and correctness-risk reviews. For writes, only the owner may mutate; it runs in a detached worktree and Heliolune applies its patch only after clean-state, scope, overlap, and `git apply --check --index` gates pass. The shared Luna/high Leader tracks liveness and compresses outcomes but does not plan, assign, inspect the repository, or accept work.

Use `profile="token-first"` only when a mutating checkout is dirty or not Git-backed, safe write isolation is impossible, or a strict sequential dependency makes parallel evidence unusable. Read-only tasks stay parallel. `start_batch` remains an advanced API for explicitly designed 2–8 workstreams; do not use it on the normal path.

Prefer work sized near 90 seconds, but bounded tasks may use up to 600 seconds. Narrow scope and acceptance before increasing the timeout.

## Wait once

Immediately call `luna-await.await_task` exactly once with the returned `jobId`. While it blocks, stop generating: do not poll, read job records, send progress commentary, or open another model session. The native `Heliolune Leader` window provides token-free bilingual worker status, natural-language progress, timing, cache, and projected savings. Set `HELIOLUNE_STATUS_WINDOW=off` only when the user requests it.

## Accept

After await returns, inspect the compact evidence and `integration` result. For mutations, review actual changed paths in the main checkout and run the smallest decisive acceptance check. If integration was held, do not blindly apply retained patches. Re-open files only for contradictions, reserved boundaries, failed checks, or unresolved risk; never replay Luna exploration.

Report result, checks, risks, wall time, and exact Luna usage/cost when present. Reasoning tokens are already included in output and must not be charged twice. Treat projected Sol-only savings as a benchmark-based estimate, not billed cost. Use `cost_dashboard` only when the user asks for cumulative statistics.
