# Heliolune and Codex subagents

English · [简体中文](HELIOLUNE-VS-CODEX-SUBAGENTS.zh-CN.md)

Heliolune does not replace Codex subagents. It is a specialized cost-control adapter for a narrower Sol/Luna workflow; native subagents are the general built-in multi-agent system. The right choice depends on whether explicit worker economics and deterministic boundaries matter more than native flexibility.

## At a glance

| Dimension | Heliolune 0.6 | Codex subagents |
|---|---|---|
| Primary goal | Minimize Sol context and cost while keeping Sol as governor. | General parallel delegation and specialization inside Codex. |
| Worker choice | Luna/max workers; Luna/high shared Leader; fixed Sol governance boundary. | Built-in or custom agents can select supported models, reasoning effort, tools, sandbox, and instructions. |
| Orchestration | `start_task` or `start_batch`, then exactly one blocking `await_task`; no model polling. | Codex spawns, routes follow-ups, waits, and consolidates results natively. |
| Parallelism | Stable-default 4-way or experimental 8-way; one shared Leader manages long-running sessions. | Native concurrency is configurable and is well suited to independent exploration, tests, triage, and summarization. |
| Controller context | Structured, bounded handoffs; large results are compressed before Sol sees them. | Subagents return summaries and keep noisy exploration out of the main thread, but each agent still consumes its own model/tool tokens. |
| Cache strategy | Token-first reuses function-affine lanes and stable prompts; write bursts use fresh sessions for isolation. | Context and model settings follow Codex agent/thread configuration; Heliolune-style cache accounting is not the public contract. |
| Visibility | Hidden ephemeral Luna sessions plus one bilingual native status window with progress and projected cost. | Subagent activity and threads are surfaced directly in supported Codex app, CLI, and IDE experiences and can be inspected or steered. |
| Parallel reads | Four-way default; narrow tasks use distinct contract, edge-case/test, and risk questions rather than falling back merely for size. | A natural built-in fit and usually the simpler choice when cost instrumentation is not required. |
| Parallel writes | Detached Git worktrees, exact disjoint scopes, clean-HEAD gates, patch validation, atomic safe apply, and Sol review. | Official guidance recommends more care for write-heavy parallel workflows because conflicts and coordination overhead increase. Codex Desktop worktrees isolate chats and support Handoff. |
| Cost data | Exact Luna input/cached/output/reasoning usage, price table, dashboard, and benchmark-calibrated directional savings. | Native subagents are easier to operate, but comparable workflows consume more tokens than a single agent because every subagent performs model and tool work. |
| Setup | Plugin + MCP + standalone Codex CLI + Node; native live window is currently Windows-only. | Built into current Codex releases; custom agents use project or personal TOML configuration. |
| Generality | Currently optimized for Sol/Luna and engineering repositories. | Broader tasks, heterogeneous agents, richer native controls, and fewer project-specific assumptions. |

## Heliolune advantages

- Explicit cost-first routing: the expensive Sol session plans once, blocks, and receives a compact result.
- Luna/max is practical for narrow high-volume work while Sol owns architecture, safety, APIs, migrations, risk, integration review, and acceptance.
- Persistent token-first lanes improve prefix/cache locality; speed-first can trade that locality for 4/8-way latency.
- The shared Luna/high Leader manages long batches without making planning decisions or waking Sol.
- Parallel writes have deterministic Git gates rather than relying on workers to coordinate in one checkout.
- The dashboard exposes worker usage and directional savings that are otherwise hard to attribute to one delegation layer.

## Heliolune disadvantages

- More moving parts: a plugin, two MCP servers, app-server compatibility, a standalone CLI, local state, and release-specific testing.
- It is intentionally less flexible. Luna cannot autonomously redesign architecture, expand scope, or resolve conflicting workstreams.
- The native progress window is a Windows implementation; other platforms currently run without that Heliolune UI.
- Terminal Leader aggregation adds latency. Four-way read-only smokes spent about 14 seconds in Leader aggregation after workers completed.
- Parallel writes require a clean Git root and exact disjoint scopes. Ignored local dependencies are not copied into Heliolune worktrees.
- Savings are directional until a matched Sol-only arm measures the same task; the MCP cannot observe the current Sol planning/acceptance tokens.

## Native Codex subagent advantages

- Native lifecycle and UI: no plugin-specific start/await protocol, status window, or local registry is required.
- Agents are inspectable and steerable in supported clients, and custom agents can specialize model, effort, tools, instructions, and sandbox.
- Better fit for heterogeneous teams in which some subtasks need stronger reasoning, browser tools, documentation MCPs, or different permissions.
- Codex owns spawning, follow-ups, waiting, and consolidation, which reduces adapter maintenance.
- Codex Desktop worktrees provide a first-class way to keep chats from interfering and support Handoff back to the local checkout.

## Native Codex subagent disadvantages

- Each agent performs separate model and tool work, so parallel workflows consume more tokens than comparable single-agent runs.
- Without a specialized compact contract, parent-agent cost can grow when summaries are verbose or acceptance is delegated to another cold high-cost session.
- Write-heavy parallelism can create conflicts and coordination overhead; task decomposition and integration policy still need care.
- Native flexibility makes model, effort, tool, and permission choices easier to vary, but also less deterministic across projects unless custom agents and project guidance are maintained.

## Recommendation

Use Heliolune when the task is engineering-focused, Sol judgment must remain centralized, Luna pricing creates a meaningful cost advantage, work can be bounded precisely, and per-worker cost visibility matters. Use native Codex subagents when native UX, heterogeneous specialist agents, interactive steering, portability, or broader autonomy matters more than Heliolune's cost instrumentation.

A hybrid is reasonable: use Heliolune for bulk narrow Luna work, and reserve native higher-capability subagents for a genuinely independent high-judgment review. Do not create a cold Sol subagent merely to re-accept a Heliolune result; review it in the current warm Sol session.

Official references: [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md) and [Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees.md).
