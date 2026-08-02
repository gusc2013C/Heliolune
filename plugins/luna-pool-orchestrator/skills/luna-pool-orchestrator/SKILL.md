---
name: luna-pool-orchestrator
description: Delegate bounded engineering work from a GPT-5.6 Sol controller through default four-way Luna/max parallel batches (or explicit eight-way), with token-first only as a safety fallback, detached-worktree isolated writes, one shared Luna/high operations leader, a token-free native status window, adaptive compression, and cost dashboards. Use when reducing or measuring Sol token cost matters while preserving Sol ownership of planning, architecture, security boundaries, public APIs, irreversible migrations, risk decisions, integration review, and final acceptance.
---

# Luna Pool Orchestrator

Use the MCP as a blocking boundary. Never create, poll, or read Luna tasks directly while this MCP is available.

## Preconditions

- Require a standalone official Codex CLI that supports `app-server` and `gpt-5.6-luna`.
- Resolve it from `CODEX_APP_SERVER_EXECUTABLE`, `CODEX_EXECUTABLE`, or an executable `codex` on `PATH`.
- Do not copy or bundle Codex binaries. The Windows Store Desktop binary may not be executable by child processes; report this prerequisite instead of creating a runtime copy.

## Initialize

Call `initialize_pool` once per repository only when the user requests an explicit health check. Its default profile is four-way speed-first. Use `healthTurn=false` for a model/session check. A paid `healthTurn=true` is justified only when actual Luna turns must be proven; it initializes the lanes selected by `priority` and `parallelism`.

The runtime-affine sessions are:

- `core`: bounded production-code work.
- `tests`: tests, fixtures, and regressions.
- `integration`: build, dependencies, configuration, CLI, and cross-component work.
- `verifier`: independent read-only verification only.
- `supervisor`: shared operations leader for liveness, cross-lane outcome tracking, and reporting compression only.

Workers use Luna with `max` effort for repository work. Schema-only finalization uses `high` because it must reuse completed reasoning rather than discover anything new. The operations leader uses `high`; it never inspects repository contents, decomposes or assigns work, changes scope, decides correctness beyond a supplied verifier verdict, resolves reserved decisions, or accepts results. Sessions are ephemeral and reused while the MCP process lives, so they should not appear as normal Desktop tasks. A Desktop restart creates a fresh hidden pool.

## Delegate

Before calling `start_batch` or the fallback `start_task`, Sol must understand the request and decide the workstreams or lane, scope, risk, acceptance criteria, dependencies, and whether a reserved boundary is involved.

Send only incremental task state:

- an outcome-oriented `objective`;
- 1–8 testable `acceptance` items for token-first, or 1–4 per speed-first workstream;
- exact files or the narrowest relevant directories in `scope`;
- volatile `repoState` only when needed;
- `risk` and `reservedBoundary`, plus token-first `verification` when its default `auto` is not sufficient;
- token-first exploration budgets only when their defaults (`maxFiles=12`, `maxCommands=20`) are not appropriate.

Do not paste repository files, transcripts, generic project background, or the stable worker role. Luna inspects the repository directly. Send only incremental state. Reuse the same functional lane for related work to improve cache hits.

Use `verification=auto` by default. The MCP invokes the independent verifier when risk is high, a reserved boundary is touched, the owner requests verification, completion is partial, or high-severity risks remain. Use `always` for security-sensitive or decisive correctness claims. Use `never` only for low-risk, easily reversible work.

## Parallel-first routing

Use **speed-first** with `start_batch` by default. Select four-way parallelism unless the user explicitly requests the experimental eight-way mode. Do not route to token-first merely because the task is small, narrow, or modifies one file.

For a narrow implementation or repair, define one exact-scope mutating owner and up to three meaningful read-only companions that independently inspect the contract, edge cases/tests, and correctness risks. Read-only companions may inspect the same scope; never create overlapping mutating scopes. For a read-only request, split by distinct questions or evidence sources. Aim for four active workstreams, use at least two, and never invent dummy work solely to fill a slot.

Use **token-first** with `start_task` only as an explicit safety fallback when a mutating task has a dirty or non-Git main checkout, write scopes cannot be isolated without overlap, or a strict dependency makes parallel results unusable. State the concrete fallback reason in Sol's final handoff. Read-only work can remain parallel even in a dirty repository.

Four-way execution is the product default because measured cache-ignored cost was within noise of serial execution while wall time improved about 3.8x on separable work. Eight-way parallelism is explicit and experimental: it has produced the fastest run but materially higher tail variance.

For speed-first:

- Sol, never Luna or the Leader, decomposes the parent task and supplies each workstream's objective, acceptance criteria, and scope.
- Prefer small workstreams likely to finish within 90 seconds. This is a sizing target and Leader checkpoint, not a hard limit; bounded workstreams may use independent deadlines up to 600 seconds.
- For writes, require the Git repository root as `cwd`, a clean main worktree, and exact non-overlapping repository-relative scopes without globs or `..`. Assign `mode=implement` or `repair` only to non-verifier workstreams.
- Heliolune creates detached worktrees at the verified current `HEAD`; each mutating workstream gets a fresh ephemeral Luna session and can modify only its own checkout. It captures tracked, deleted, renamed, binary, and untracked changes as patches.
- Deterministic integration applies all patches only when every workstream completed, `HEAD` and the clean main worktree stayed unchanged, actual changed paths remain in scope and do not overlap, and `git apply --check --index` succeeds. Otherwise it changes nothing in the main worktree, reports `integration.applied=false`, and retains local patch artifacts for Sol review.
- A failed or slow workstream must not discard completed siblings. Sol reviews any partial batch and decides whether to retry, narrow, or integrate findings.

## Sol boundary

Sol alone owns:

- requirement interpretation and task decomposition;
- architecture and cross-lane tradeoffs;
- security and trust boundaries;
- public API or compatibility contracts;
- irreversible data or infrastructure migrations;
- acceptance of residual risk;
- review of the compact owner/verifier bundle and final user response.

If Luna returns `needsSol`, stop delegation for that decision. Do not ask Luna to choose among reserved options.

## Wait and accept

On Codex Desktop, call `luna-pool.start_batch` by default or `luna-pool.start_task` only for a documented safety fallback, then immediately call `luna-await.await_task` exactly once with the returned `jobId`. Stop generating while `await_task` is blocked and resume only when it returns the compact terminal bundle. Never poll `pool_status`, read job files, or add commentary/model turns while waiting.

On Windows, Heliolune uses one token-free native `Heliolune Leader` window. It reads transcript-free local status records, dynamically displays every active token-first or burst lane, stays topmost while work runs, and closes shortly after completion. Set `HELIOLUNE_STATUS_WINDOW=off` to disable it or `on` to force it. Heliolune does not also open an inline task panel.

When the host supplies `_meta.progressToken`, Heliolune may also emit rate-limited standard `notifications/progress` from the start call, but the model-visible workflow remains start once and await once. The native window shows lane, effort, elapsed time, observed events, cache rate, last activity, finalization, verification, Leader activity, and cost projections without worker transcripts or repository content.

The terminal result contains evidence, changes, checks, risks, routing, timing, finalization status, and exact Luna token usage. The two-server Desktop path exists because a blocking request serializes calls to one MCP server; `luna-await` waits on the result file while `luna-pool` remains available to the status surface. This does not create another model session or add model tokens.

Finalization is an internal automatic policy. Heliolune reserves part of the existing hard deadline for structured output and uses `high` only for schema synthesis. If a live work turn consumes its work budget, the MCP steers that active turn to stop tools and emit the schema from evidence already gathered. If a completed turn instead returns invalid JSON, one synthesis-only fallback turn may reuse the same warm thread. Both paths may report honest `partial` status and neither extends the hard deadline. Narrow `scope`, acceptance criteria, files, and commands before increasing `timeoutSeconds`.

For a token-first hard timeout of at least 90 seconds, the internal soft checkpoint first uses recent app-server events. Sustained silence wakes the shared Leader once at `high` effort. A stale worker is not sent to synthesis because it has no trustworthy fresh work to summarize. The hard deadline remains absolute.

For a speed-first batch whose workstream deadlines exceed 90 seconds, one shared Luna/high Leader session coalesces simultaneous 90-second checks, receives compact liveness snapshots for all currently active burst workers, and returns per-slot continue/interrupt recommendations. A later queued wave may trigger another bounded turn on that same persistent Leader session; this is event-driven management, never polling. The Leader may summarize progress and identify a stalled slot, but may not assign work, expand scope, or decide whether the parent request is satisfied. The same warm session later aggregates terminal outcomes for Sol. A Leader failure never extends or replaces each worker's independent hard deadline.

Reporting is also an internal automatic policy. Small low-risk token-first bundles return directly and add only a compact lifecycle digest to the Leader backlog. Large bundles, verifier results, high risk, reserved boundaries, or actual `needsSol` decisions wake the Leader for compression. Speed-first always uses the same shared Leader for one terminal aggregate. The Leader reports to Sol but never replaces Sol planning, review, or acceptance.

Sol should inspect only decisive evidence. Re-open repository files or run a compact acceptance check when the result is contradictory, touches a reserved boundary, or the verifier fails. Do not replay Luna's exploration.

After a mutating batch, Sol must inspect `integration`, review the actual changed paths in the main worktree, and run a compact acceptance check there. If integration was held, do not blindly apply retained patches; resolve the conflict or dirty-state condition through a narrower token-first task. Deterministic safe application is not final acceptance.

Perform acceptance inside the current warm Sol main session. Never create a fresh Sol session or Sol subagent merely to judge Luna output: the cold system/tool prefix can cost more than the Luna work and erase the savings.

## Cost reporting

Report exact input, cached input, output, reasoning output, cache rate, wall time, and the MCP-provided cost estimate. Reasoning output is already included in output tokens and must not be charged twice. The visible Sol-only projection scales observed Luna worker cost with the retained matched-quality benchmark ratio; it is directional because current Sol planning/acceptance usage is not observable at the MCP boundary. Do not describe it as billed cost or a measured current Sol-only run. The raw same-token field is for pricing sensitivity only and is not the visible savings estimate.

Use `cost_dashboard` when the user asks for cumulative cost, savings, cache, timing, or per-lane statistics. Prefer Markdown for a compact human report and JSON for machine processing. Request the full pricing catalog only when needed because it expands the controller transcript.

For benchmarks, keep the response schema identical across compared warm turns. Exclude matched warm-up turns as measurement overhead, report them separately, and never compare a warm Sol-only turn against a cold Sol acceptance turn.
