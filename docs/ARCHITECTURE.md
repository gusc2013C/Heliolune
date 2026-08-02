# Architecture

Heliolune separates governance from bounded execution.

```text
controller / governor
  |  objective + acceptance + narrow scope + budget
  v
blocking MCP orchestration boundary
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

A fifth shared Luna supervisor session runs at `high` by default and is consulted only after a soft timeout with sustained app-server silence. It sees compact liveness metadata rather than repository contents and may recommend continue or interrupt. Recent activity bypasses the model, while the original deterministic hard timeout remains absolute. `xhigh` is available for ambiguous liveness diagnostics without paying `max` on routine supervision.

Hard timeouts are classified from the final activity snapshot as `hard_timeout_active` or `hard_timeout_stalled`. The registry retains only the compact diagnostic and counters, not the worker transcript.

Before that hard deadline, the adapter reserves a finalization window. A live work turn that consumes its exploration budget receives an in-turn `turn/steer` instruction to stop tools and emit the result schema from evidence already gathered. This preserves active reasoning and context locality while permitting an honest partial result. A completed turn with invalid JSON may use one same-thread, no-tools fallback turn. Stalled turns do not enter fallback finalization, and the total deadline is never extended.

## Reserved decisions

Workers must not independently decide architecture, security or trust boundaries, public API and compatibility contracts, irreversible migrations, or acceptance of residual risk. A worker returns `needsSol` only when one of these decisions actually blocks or materially conditions the result.

## Generalization path

Future work should extract the app-server implementation behind a provider-neutral adapter interface, make controller/worker model identities configurable, and move routing policy from hard-coded lane names to declarative profiles. The compact MCP contract and controller-owned trust boundary should remain stable across adapters.

## Usage and pricing data

The adapter persists raw successful-turn usage counters per project and lane. Monetary or credit estimates are derived at read time from a provider-neutral price catalog, so price updates do not rewrite historical usage. Reasoning tokens remain a diagnostic subset of output tokens and are never charged twice. The default same-token Sol comparison is explicitly counterfactual and excludes controller-side planning and acceptance usage.
