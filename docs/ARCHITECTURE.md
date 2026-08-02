# Architecture

English · [简体中文](ARCHITECTURE.zh-CN.md)

Heliolune separates governance from bounded execution.

```text
controller / governor
  |  objective + acceptance + narrow scope + budget
  v
start-once / await-once MCP orchestration boundary
  |-- token-first: one function-affine owner + optional verifier
  |-- speed-first: 4/8 Sol-defined isolated burst workers
  |-- one shared operations Leader
  v
compact evidence + changes + checks + risks + usage
  |
  v
controller review and final acceptance
```

## Stable concepts

- **Controller:** understands requirements, decomposes work, owns reserved decisions, reviews evidence, and accepts results.
- **Worker:** performs bounded exploration or implementation within an explicit scope and command/file budget.
- **Lane:** a function-affine reusable worker context that improves cache locality.
- **Verifier:** an independent, read-only worker used only when risk or the requested claim justifies it.
- **Profile:** a routing policy: four-way parallel speed-first by default, with persistent token-first reserved for explicit safety fallback.
- **Adapter:** host/model-specific code that starts sessions, sends turns, interrupts timeouts, and records usage.

## Current Codex adapter

The first adapter uses GPT-5.6 Sol as controller and communicates with the official Codex CLI through `app-server`. Token-first exposes four persistent GPT-5.6 Luna/max lanes. Speed-first exposes four stable-default or eight experimental Luna/max burst slots for Sol-defined independent workstreams. Read-only burst sessions may be reused; mutating workstreams use fresh ephemeral sessions in isolated Git worktrees so checkout context cannot leak between workers. All sessions stay out of the ordinary Desktop task list.

A fifth shared Luna operations-leader session runs at `high` by default. It sees compact liveness metadata and structured owner/verifier bundles rather than repository contents. It may recommend continue/interrupt for stale turns and compress dense handoffs, but it cannot plan, assign, judge correctness beyond a verifier verdict, or accept results. Recent activity bypasses the model, while the original deterministic hard timeout remains absolute. `xhigh` is available for ambiguous liveness diagnostics without paying `max` on routine supervision.

For speed-first workstreams, 90 seconds is a sizing target and shared management checkpoint, not a hard cap. Bounded per-worker deadlines may extend to 600 seconds. One shared Leader session coalesces simultaneous checkpoint requests into a single turn containing current active-slot snapshots and returns per-slot continue/interrupt recommendations. A later queued wave may use another bounded turn on that same warm session; there is no model polling. The Leader does not redistribute work. Completed siblings are isolated from a failed or slow slot, and the same Leader thread later aggregates every terminal outcome for Sol.

Leader reporting is adaptive. Small low-risk results return directly and append a bounded lifecycle digest to a persistent backlog. A large or risky task, verifier result, reserved boundary, or Sol escalation wakes the Leader and includes those deferred digests. This preserves cross-lane operational continuity without paying a fifth model turn for every small task.

## Parallel write isolation

Speed-first implementation and repair require a clean Git repository root and narrow, non-overlapping, repository-relative scopes. The adapter resolves the exact `HEAD` commit and creates one native detached worktree per workstream; it never assumes the default branch is named `main`, and it does not copy the source tree or ignored files.

Each worker can modify only its worktree sandbox. After every turn reaches a terminal state, the adapter stages inside those disposable worktrees solely to build full-index binary patches that include tracked, deleted, renamed, binary, and untracked changes. It then checks:

1. every workstream completed;
2. every actual changed path remains inside its Sol-supplied scope;
3. no two workstreams changed the same path;
4. the main checkout still has the original `HEAD` and remains clean; and
5. one indexed `git apply --check` succeeds for the complete patch set.

Only then are all patches applied and immediately unstaged for Sol review. If any gate fails, the main worktree is unchanged and bounded local patch artifacts are retained. Temporary worktrees are removed through Git and pruned. This deterministic integration policy executes Sol's supplied decomposition; it does not replace Sol's diff review, focused checks, risk decision, or final acceptance.

## Visible progress boundary

Codex Desktop uses two stdio MCP servers. The normal path is one compact `luna-pool.start_task` call; the pool server deterministically expands it into four workstreams and returns immediately after creating the background job and native status surface. `luna-await.await_task` then blocks on an atomically written result file. Splitting the servers is necessary because a blocking request serializes calls to one server; the native window can continue reading local snapshots without another Sol turn or model session.

Running records carry the pool-server PID, process start, heartbeat, and bounded expiry. `luna-await` verifies that owner while blocked; if the owner process exits before a terminal write, it atomically converts the stale record to failure. The native window performs the same owner check for local visibility. This prevents an abandoned `running` snapshot from looking like a permanently hung Luna pool.

Windows uses one WPF panel launched through the inbox WSH/Windows PowerShell runtime. Heliolune no longer provides a second inline task panel. The native window can be disabled with `HELIOLUNE_STATUS_WINDOW=off`. It publishes a short-lived ready marker only after rendering; task snapshots and results are written atomically under the user's local Codex data directory.

The panel builds cards from the active job, so it can show fixed token-first lanes or four/eight burst slots plus `supervisor`. Activity explanations come only from Codex `item/reasoning/summaryTextDelta`, which is a model-produced reasoning summary, not raw reasoning content. Text is bounded before persistence. Raw reasoning, command output, tool results, and worker transcripts are not forwarded. Deterministic lifecycle labels remain the fallback until Luna emits a summary.

Hosts that attach an MCP progress token may also receive monotonically increasing, rate-limited standard `notifications/progress` from the start call's watchdog snapshots. The model-visible contract remains start once and await once.

Hard timeouts are classified from the final activity snapshot as `hard_timeout_active` or `hard_timeout_stalled`. The registry retains only the compact diagnostic and counters, not the worker transcript.

Before that hard deadline, the adapter reserves a finalization window. A live work turn that consumes its exploration budget receives an in-turn `turn/steer` instruction to stop tools and emit the result schema from evidence already gathered. This preserves active reasoning and context locality while permitting an honest partial result. A completed turn with invalid JSON may use one same-thread, no-tools fallback turn. Stalled turns do not enter fallback finalization, and the total deadline is never extended.

## Reserved decisions

Workers must not independently decide architecture, security or trust boundaries, public API and compatibility contracts, irreversible migrations, or acceptance of residual risk. A worker returns `needsSol` only when one of these decisions actually blocks or materially conditions the result.

## Generalization path

Future work should extract the app-server implementation behind a provider-neutral adapter interface, make controller/worker model identities configurable, and add deterministic setup hooks for dependencies needed inside isolated worktrees. The compact MCP contract and controller-owned trust boundary should remain stable across adapters.

## Usage and pricing data

The adapter persists raw successful-turn usage counters per project and lane. Monetary or credit estimates are derived at read time from a provider-neutral price catalog, so price updates do not rewrite historical usage. Reasoning tokens remain a diagnostic subset of output tokens and are never charged twice. The visible Sol-only projection scales observed Luna worker cost by the retained matched-quality alpha benchmark ratio (`3,702 / 902.32`); it is directional because current controller-side planning and acceptance usage is not observable at the MCP boundary. Raw JSON retains same-token repricing only as a secondary sensitivity measure.
