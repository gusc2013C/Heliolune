# Architecture

English · [简体中文](ARCHITECTURE.zh-CN.md)

Heliolune separates governance from bounded execution.

```text
controller / governor
  |  objective + acceptance + narrow scope + budget
  v
start-once / await-once MCP orchestration boundary
  |-- owner lane selected by function affinity
  |-- optional independent verifier lane
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
- **Adapter:** host/model-specific code that starts sessions, sends turns, interrupts timeouts, and records usage.

## Current Codex adapter

The first adapter uses GPT-5.6 Sol as controller and four GPT-5.6 Luna/max lanes. It communicates with the official Codex CLI through `app-server`. Sessions are ephemeral to keep them out of the ordinary Desktop task list, but are reused while the MCP server remains alive.

A fifth shared Luna operations-leader session runs at `high` by default. It sees compact liveness metadata and structured owner/verifier bundles rather than repository contents. It may recommend continue/interrupt for stale turns and compress dense handoffs, but it cannot plan, assign, judge correctness beyond a verifier verdict, or accept results. Recent activity bypasses the model, while the original deterministic hard timeout remains absolute. `xhigh` is available for ambiguous liveness diagnostics without paying `max` on routine supervision.

Leader reporting is adaptive. Small low-risk results return directly and append a bounded lifecycle digest to a persistent backlog. A large or risky task, verifier result, reserved boundary, or Sol escalation wakes the Leader and includes those deferred digests. This preserves cross-lane operational continuity without paying a fifth model turn for every small task.

## Visible progress boundary

Codex Desktop uses two stdio MCP servers. `luna-pool.start_task` returns immediately after creating the background job and status surface. `luna-await.await_task` then blocks on an atomically written result file. Splitting the servers is necessary because a blocking request serializes calls to one server; it keeps the app-only status path responsive without another Sol turn or model session.

Visibility is capability-gated. A host advertising `extensions["io.modelcontextprotocol/ui"]` receives an inline MCP App. Windows hosts without that capability receive a WPF panel launched through the inbox WSH/Windows PowerShell runtime. The native fallback is never launched for an MCP Apps-capable host and can be disabled with `HELIOLUNE_STATUS_WINDOW=off`. The rendered window publishes a short-lived ready marker; task snapshots and results are written atomically under the user's local Codex data directory.

Both surfaces show fixed `core`, `tests`, `integration`, `verifier`, and `supervisor` cards. Activity explanations come only from Codex `item/reasoning/summaryTextDelta`, which is a model-produced reasoning summary, not raw reasoning content. Text is bounded before persistence. Raw reasoning, command output, tool results, and worker transcripts are not forwarded. Deterministic lifecycle labels remain the fallback until Luna emits a summary.

Hosts that attach an MCP progress token may instead use the single blocking `run_task` path. It emits monotonically increasing, rate-limited standard `notifications/progress` from the same watchdog activity snapshots. Codex CLI 0.146.0 does not attach that token to model-initiated MCP calls and does not advertise MCP Apps, which is why the Windows-native path is selected there.

Hard timeouts are classified from the final activity snapshot as `hard_timeout_active` or `hard_timeout_stalled`. The registry retains only the compact diagnostic and counters, not the worker transcript.

Before that hard deadline, the adapter reserves a finalization window. A live work turn that consumes its exploration budget receives an in-turn `turn/steer` instruction to stop tools and emit the result schema from evidence already gathered. This preserves active reasoning and context locality while permitting an honest partial result. A completed turn with invalid JSON may use one same-thread, no-tools fallback turn. Stalled turns do not enter fallback finalization, and the total deadline is never extended.

## Reserved decisions

Workers must not independently decide architecture, security or trust boundaries, public API and compatibility contracts, irreversible migrations, or acceptance of residual risk. A worker returns `needsSol` only when one of these decisions actually blocks or materially conditions the result.

## Generalization path

Future work should extract the app-server implementation behind a provider-neutral adapter interface, make controller/worker model identities configurable, and move routing policy from hard-coded lane names to declarative profiles. The compact MCP contract and controller-owned trust boundary should remain stable across adapters.

## Usage and pricing data

The adapter persists raw successful-turn usage counters per project and lane. Monetary or credit estimates are derived at read time from a provider-neutral price catalog, so price updates do not rewrite historical usage. Reasoning tokens remain a diagnostic subset of output tokens and are never charged twice. The visible Sol-only projection scales observed Luna worker cost by the retained matched-quality alpha benchmark ratio (`3,702 / 902.32`); it is directional because current controller-side planning and acceptance usage is not observable at the MCP boundary. Raw JSON retains same-token repricing only as a secondary sensitivity measure.
