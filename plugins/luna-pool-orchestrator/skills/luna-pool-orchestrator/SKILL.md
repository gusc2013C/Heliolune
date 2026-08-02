---
name: luna-pool-orchestrator
description: Delegate bounded engineering analysis, implementation, repair, and verification from a GPT-5.6 Sol controller to four function-affine GPT-5.6 Luna workers plus one shared Luna operations leader through the luna-pool-orchestrator MCP, adaptively compress large handoffs, and report cost dashboards. Use when reducing or measuring Sol token cost matters while preserving Sol ownership of planning, architecture, security boundaries, public APIs, irreversible migrations, risk decisions, review, and final acceptance.
---

# Luna Pool Orchestrator

Use the MCP as a blocking boundary. Never create, poll, or read Luna tasks directly while this MCP is available.

## Preconditions

- Require a standalone official Codex CLI that supports `app-server` and `gpt-5.6-luna`.
- Resolve it from `CODEX_APP_SERVER_EXECUTABLE`, `CODEX_EXECUTABLE`, or an executable `codex` on `PATH`.
- Do not copy or bundle Codex binaries. The Windows Store Desktop binary may not be executable by child processes; report this prerequisite instead of creating a runtime copy.

## Initialize

Call `initialize_pool` once per repository when the user requests an explicit health check. Use `healthTurn=false` for a model/session check or `healthTurn=true` only when five paid Luna turns are justified.

The runtime-affine sessions are:

- `core`: bounded production-code work.
- `tests`: tests, fixtures, and regressions.
- `integration`: build, dependencies, configuration, CLI, and cross-component work.
- `verifier`: independent read-only verification only.
- `supervisor`: shared operations leader for liveness, cross-lane outcome tracking, and reporting compression only.

Workers use Luna with `max` effort for repository work. Schema-only finalization uses `high` by default because it must reuse completed reasoning rather than discover anything new; use `xhigh` or `max` only when a measured recovery case needs it. The operations leader uses `high` by default and may use `xhigh`; it never inspects repository contents, plans or assigns work, decides correctness beyond a supplied verifier verdict, or accepts results. Sessions are ephemeral and reused while the MCP process lives, so they should not appear as normal Desktop tasks. A Desktop restart creates a fresh hidden pool.

## Delegate

Before calling `run_task`, Sol must understand the request and decide the lane, scope, risk, acceptance criteria, and whether a reserved boundary is involved.

Send only incremental task state:

- an outcome-oriented `objective`;
- 1–8 testable `acceptance` items;
- exact files or the narrowest relevant directories in `scope`;
- volatile `repoState` only when needed;
- `risk`, `reservedBoundary`, and `verification`;
- small exploration budgets, normally `maxFiles=12` and `maxCommands=20`.

Do not paste repository files, transcripts, generic project background, or the stable worker role. Luna inspects the repository directly. Reuse the same functional lane for related work to improve cache hits.

Use `verification=auto` by default. The MCP invokes the independent verifier when risk is high, a reserved boundary is touched, the owner requests verification, completion is partial, or high-severity risks remain. Use `always` for security-sensitive or decisive correctness claims. Use `never` only for low-risk, easily reversible work.

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

Make one MCP call and wait for its terminal result. Do not perform periodic status reads. The MCP returns one compact result containing evidence, changes, checks, risks, routing, timing, finalization status, and exact Luna token usage.

Keep `finalization=auto` and `synthesisEffort=high`. Heliolune reserves part of the existing hard deadline for structured output. If a live work turn consumes its work budget, the MCP steers that active turn to stop tools and emit the schema from evidence already gathered. If a completed turn instead returns invalid JSON, one synthesis-only fallback turn may reuse the same warm thread at `synthesisEffort`. Both paths may report honest `partial` status and neither extends the hard deadline. Use `finalization=off` only for watchdog diagnostics. Narrow `scope`, acceptance criteria, files, and commands before increasing `timeoutSeconds`, `synthesisReserveSeconds`, or finalization effort.

For hard timeouts of at least 90 seconds, keep `supervision=auto` unless the user asks otherwise. At the soft checkpoint, recent app-server events continue deterministically without a model call; sustained silence wakes the shared supervisor once. Use `supervisorEffort=high` normally and `xhigh` only for ambiguous liveness diagnostics. A stale worker is not sent to synthesis because it has no trustworthy fresh work to summarize. The hard deadline remains absolute.

Keep `reporting=auto`. Small low-risk worker bundles return directly and add only a compact lifecycle digest to the leader backlog. Wake the leader for large bundles, verifier results, high risk, reserved boundaries, or actual `needsSol` decisions; it receives deferred digests on its next turn and returns a compressed handoff. Use `reporting=leader` only to force reporting for a benchmark or a genuinely dense bundle, and `reporting=direct` for diagnostics. Keep `includeRawResults=false` except during an audit. The leader reports to Sol but never replaces Sol planning, review, or acceptance.

Sol should inspect only decisive evidence. Re-open repository files or run a compact acceptance check when the result is contradictory, touches a reserved boundary, or the verifier fails. Do not replay Luna's exploration.

Perform acceptance inside the current warm Sol main session. Never create a fresh Sol session or Sol subagent merely to judge Luna output: the cold system/tool prefix can cost more than the Luna work and erase the savings.

## Cost reporting

Report exact input, cached input, output, reasoning output, cache rate, wall time, and the MCP-provided cost estimate. Reasoning output is already included in output tokens and must not be charged twice. The same-token baseline is a counterfactual worker-boundary estimate; it excludes Sol planning/acceptance usage and is not a measured Sol-only run or billed-credit total.

Use `cost_dashboard` when the user asks for cumulative cost, savings, cache, timing, or per-lane statistics. Prefer Markdown for a compact human report and JSON for machine processing. Request the full pricing catalog only when needed because it expands the controller transcript.

For benchmarks, keep the response schema identical across compared warm turns. Exclude matched warm-up turns as measurement overhead, report them separately, and never compare a warm Sol-only turn against a cold Sol acceptance turn.
