# Heliolune

English · [简体中文](README.zh-CN.md)

**High-intelligence supervision, low-cost execution.**

Heliolune is an alpha-stage orchestration project for pairing a capable controller with economical worker models behind a compact, blocking MCP boundary. Its first adapter is a Codex plugin in which GPT-5.6 Sol governs four hidden GPT-5.6 Luna workers running at `max` reasoning effort.

The name combines the imagery of the sun and moon, but the architecture is deliberately model-, provider-, and host-neutral. Sol/Luna on Codex is the first working profile—not the final boundary of the project.

> Current release: **`0.5.2`**. Public contracts may change before 1.0.

Heliolune is a personal open-source project by **Sicheng Gu**. It is not affiliated with or endorsed by OpenAI.

## What problem it solves

Cheap workers stop being cheap when the expensive controller repeatedly polls them, rereads their exploration, starts cold acceptance sessions, or receives oversized transcripts. Heliolune places worker execution behind a start-once / await-once MCP boundary:

```text
controller / governor
  |  compact objective, acceptance criteria, scope and budget
  v
Heliolune MCP boundary (start once, await once, never poll from Sol)
  |-- function-affine owner lane
  |-- optional independent verifier
  v
compact evidence, changes, checks, risks, timing and usage
  |
  v
controller review and final acceptance
```

The stronger model stays responsible for decisions where judgment matters. Lower-cost models do bounded repository work and return evidence instead of an open-ended transcript.

## Current capabilities

- Four reusable worker lanes—`core`, `tests`, `integration`, and `verifier`—plus one shared operations-leader session (the compatibility lane name remains `supervisor`).
- Luna workers use `max` reasoning effort.
- Worker sessions are ephemeral and normally stay out of the Codex Desktop task list.
- Related tasks reuse the same function-affine lane while the MCP process lives, improving cache locality.
- One asynchronous start plus one blocking await replaces controller-side polling; Sol stops generating until the terminal result returns.
- Adaptive Leader reporting compresses large or risky owner/verifier bundles while small tasks defer a compact digest and avoid another model turn.
- Token-free live status uses an inline MCP App when the host advertises support, otherwise an automatic Windows WPF panel. The panel shows all five lanes, per-lane progress, compact natural-language Luna reasoning summaries, and a history-calibrated Sol-only cost / savings projection while Sol is blocked.
- Owner and verifier results use compact, structured contracts.
- Conditional independent verification based on risk, reserved boundaries, incomplete work, or unresolved high-severity findings.
- Timed-out turns are interrupted before an error is returned.
- A bounded soft timeout uses app-server activity to distinguish a live worker from sustained silence; only ambiguous stale turns wake the Luna supervisor.
- A reserved finalization window steers an active over-budget work turn to stop tools and emit structured output without extending the hard deadline.
- Exact input, cached-input, output, reasoning-output, cache-rate, and wall-time reporting.
- Built-in price estimates, history-calibrated Sol-only projections, raw same-token sensitivity data, cumulative savings, and a compact per-lane cost dashboard.
- No bundled Codex executable, copied runtime, third-party npm dependency, telemetry service, or remote control plane.

## Trust boundary

The controller alone owns:

- requirement interpretation and task decomposition;
- architecture and cross-component trade-offs;
- security and trust boundaries;
- public API and compatibility contracts;
- irreversible data or infrastructure migrations;
- acceptance of residual risk;
- review of worker evidence and final user-facing acceptance.

Workers may inspect or modify only the scope granted by the host and task contract. A worker returns `needsSol` only when a genuinely reserved decision blocks or materially conditions the result.

## MCP tools

| Tool | Purpose |
|---|---|
| `initialize_pool` | Validate the local app-server and initialize four worker lanes plus the shared supervisor. A paid health turn is optional. |
| `start_task` | Start one bounded task and select the inline or native live-status surface. |
| `await_task` (`luna-await`) | Block once on a started job and return the compact terminal bundle. |
| `run_task` | Single-call compatibility path for hosts that provide standard MCP progress tokens. |
| `job_status` | App-only, transcript-free status read used by the UI; it is hidden from the model. |
| `pool_status` | Return compact runtime, lane, model, and reuse metadata. |
| `cost_dashboard` | Return cumulative cost, history-calibrated Sol-only projections, cache, timing, and per-lane totals without invoking a model. |

On Codex Desktop, Sol calls `start_task`, then `luna-await.await_task`, and remains blocked there. It must never poll `job_status` or `pool_status`. The independent await server keeps the main status server responsive without creating another model session or controller turn.

Codex CLI `0.146.0` does not attach `_meta.progressToken` to model-initiated MCP calls and does not advertise the MCP Apps UI extension. Heliolune therefore launches a native WPF panel on Windows for that host. The panel auto-detects English or Simplified Chinese, shows `core`, `tests`, `integration`, `verifier`, and `supervisor`, then adds actual Luna estimated cost, a historical-profile Sol-only projection, and their projected savings when terminal usage arrives. It closes 15 seconds after completion. Set `HELIOLUNE_STATUS_WINDOW=off` to disable it or `on` to force it. Hosts that advertise `io.modelcontextprotocol/ui` use the inline panel and never launch the native fallback; hosts that supply a progress token may use blocking `run_task` with standard `notifications/progress`.

Natural-language activity text comes from official Codex `reasoning/summaryTextDelta` events already produced by the active Luna turn. Heliolune never forwards raw reasoning content, command output, or a worker transcript, and it does not wake another model merely to narrate status.

## Requirements

- Windows 10 or Windows 11 for the currently tested release.
- Codex with plugin and MCP support.
- A standalone official Codex CLI on `PATH` with `app-server` and `gpt-5.6-luna` support.
- Node.js 20 or newer. Node.js 22 is used in CI.
- Git for release packaging.

The MCP runtime is Node-based. On Windows hosts without inline MCP Apps support, the optional native panel uses the inbox Windows PowerShell 5.1 WPF runtime; repository validation and packaging also support PowerShell 7.

### Tested compatibility

| Component | Tested |
|---|---|
| Codex CLI | `0.146.0` |
| Node.js | Syntax validated locally; CI uses Node.js 22 |
| Windows PowerShell | 5.1 |
| PowerShell | 7.x |
| Plugin version | `0.5.2` |

Linux and macOS may work with a suitable standalone Codex CLI, but are not yet release-tested.

## Install from a checkout

Clone or extract the repository, then register its root as a local marketplace:

```powershell
codex plugin marketplace add D:\code\heliolune
codex plugin add luna-pool-orchestrator@heliolune
```

Use the actual checkout path if it differs. Start a **new Codex task** after installation so Codex loads the newly installed skill and MCP process.

## First use

Start with a no-charge session/model health check:

```text
Use $luna-pool-orchestrator for this repository.
Initialize the four Luna/max lanes with healthTurn=false.
Do not modify code yet.
```

Then delegate a bounded task:

```text
Use $luna-pool-orchestrator.
Have the appropriate Luna/max lane inspect and fix the failing parser tests.
Limit scope to src/parser and tests/parser, run the focused tests, and return compact evidence.
Sol must review the result and make the final acceptance decision.
```

Good tasks have an explicit outcome, one to eight testable acceptance criteria, narrow file or directory scope, and modest exploration budgets. Avoid pasting repository files or generic project history into the worker request; workers inspect the repository directly.

## Routing behavior

- `core`: bounded production-code analysis and implementation.
- `tests`: tests, fixtures, regressions, and test-focused diagnosis.
- `integration`: build, dependencies, configuration, CLI, and cross-component integration.
- `verifier`: independent read-only verification; never the implementation owner.
- `supervisor`: shared operations leader for liveness, deferred cross-lane tracking, and report compression; uses `high` by default, accepts `xhigh`, and never plans, assigns, inspects the repository, or performs acceptance.

Use `verification=auto` by default. Use `always` for security-sensitive work or decisive correctness claims, and `never` only for low-risk, easily reversible tasks.

Use `reporting=auto` by default. Small low-risk bundles return directly and add a tiny lifecycle digest to the Leader backlog. Large bundles, verifier results, high-risk work, reserved boundaries, and actual Sol decisions wake the shared Leader, which receives deferred digests and returns a smaller controller-facing report. `reporting=leader` forces this path for benchmarks; `reporting=direct` bypasses it. Raw owner/verifier bundles are opt-in with `includeRawResults=true`.

For tasks with hard timeouts of at least 90 seconds, `supervision=auto` schedules one checkpoint at roughly two-thirds of the deadline. Recent events continue deterministically without spending supervisor tokens. Sustained silence wakes the shared supervisor once; the original hard deadline remains absolute. Use `supervision=off` for deterministic timeout-only behavior or `supervision=always` when diagnosing the watchdog itself.

With `finalization=auto` (the default), tasks of at least 60 seconds reserve 40–90 seconds inside that same deadline for final structured synthesis. If the work turn is still active when its budget ends, Heliolune uses app-server `turn/steer` to tell that same Luna/max turn to stop tools and emit the schema from information and changes already present. If a completed turn instead emits invalid JSON, one same-thread fallback turn uses `high` effort by default because new repository reasoning is forbidden. Either path may return `partial` rather than inventing evidence. `synthesisReserveSeconds` and `synthesisEffort` tune this phase without increasing the hard deadline.

At the hard deadline, Heliolune reports `hard_timeout_active` when recent events show the worker was still running, or `hard_timeout_stalled` after sustained silence. The latest classification, event, silence duration, supervisor decision, and finalization outcome are retained in the cost dashboard without storing the worker transcript.

## Cost and performance

Reference measurements for the alpha build are local microbenchmarks, not universal performance guarantees:

| Measurement | Result |
|---|---:|
| Matched quality | Sol-only 10/10; Sol + Luna 10/10 |
| Normalized paid-token estimate at a 25:1 price ratio | 3,702 vs. 902.32; **75.6% estimated savings** |
| Matched wall time | Sol + Luna was 23.2% slower |
| Same-lane warm reuse | 24.113s to 10.709s; about **2.25x faster** |
| Warm worker cache rate | 94.65% |
| Optimized verifier | 272.947s to 100.069s; about **63.3% faster** |
| Timeout behavior | 30.317s for a 30s limit |

Price-weighted figures are estimates unless billed credits are available. Repository size, host prefix, cache state, task shape, model pricing, and acceptance policy can materially change the result. See [Benchmark methodology](docs/BENCHMARKS.md).

### Default price table

Rates are user-supplied price units per one million tokens. Override the table with `HELIOLUNE_PRICING_JSON` when provider pricing changes or when adding another model.

| Model | Input | Cached input | Output |
|---|---:|---:|---:|
| GPT-5.6 Sol | 125 | 12.5 | 750 |
| GPT-5.6 Terra | 50 | 5 | 300 |
| GPT-5.6 Luna | 5 | 0.5 | 30 |
| GPT-5.5 | 125 | 12.5 | 750 |
| GPT-5.4 | 62.5 | 6.25 | 375 |
| GPT-5.4 Mini | 18.75 | 1.875 | 113 |
| GPT-5.3-Codex | 43.75 | 4.375 | 350 |

Cost formula:

```text
uncached_input = input_tokens - cached_input_tokens
estimated_cost = uncached_input / 1M * input_rate
               + cached_input / 1M * cached_input_rate
               + output_tokens / 1M * output_rate
```

`reasoning_output_tokens` is a subset of output tokens and is displayed but not added a second time. The visible savings estimate does **not** reprice identical Luna tokens as Sol. It scales the observed Luna worker cost by the retained matched-quality alpha benchmark (`3,702` Sol-only versus `902.32` Heliolune normalized units), currently a `4.102757x` Sol-only projection and `75.63%` directional savings estimate. Current Sol controller usage is not visible at the MCP boundary, so this is a history-calibrated workload projection rather than billed or end-to-end measured cost. The raw JSON retains the same-token comparison only as a pricing-sensitivity field.

Ask Codex to call `cost_dashboard` with `format=markdown` for a compact report, or `format=json` for machine-readable totals. Metrics persist in the local Heliolune registry across MCP restarts. Successful tasks, classified failures, soft checks, supervisor actions, and hard timeouts are counted; failed-turn usage is included only when app-server reported it before interruption.

## Update or uninstall

After changing a locally installed plugin, use the Codex cachebuster helper and reinstall it from the `heliolune` marketplace. Start a new Codex task after reinstalling.

To remove the local installation:

```powershell
codex plugin remove luna-pool-orchestrator@heliolune
codex plugin marketplace remove heliolune
```

Close tasks using the MCP before removal on Windows; an active Node process can hold the installed cache directory open.

## Development

No dependency installation is required.

Windows PowerShell 5.1:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-release.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
```

PowerShell 7:

```powershell
pwsh -NoProfile -File .\scripts\validate-release.ps1
pwsh -NoProfile -File .\scripts\package-release.ps1
```

The package script validates a clean `main` worktree and creates:

```text
dist/heliolune-<version>.zip
dist/heliolune-<version>.zip.sha256
```

It uses `git archive HEAD`, so untracked files and local caches cannot silently enter the release.

## Repository layout

```text
.agents/plugins/marketplace.json      Codex marketplace manifest
plugins/luna-pool-orchestrator/       Current Codex adapter
  .codex-plugin/plugin.json           Plugin manifest
  .mcp.json                           MCP registration
  scripts/                            App-server client and MCP server
  skills/                             Sol controller workflow
docs/                                 Architecture and benchmark notes
scripts/                              Release validation and packaging
tests/                                Dependency-free Node regression tests
```

## Troubleshooting

### Luna is reported as unavailable

Confirm the standalone Codex CLI selected by `CODEX_APP_SERVER_EXECUTABLE`, `CODEX_EXECUTABLE`, or `PATH` supports `gpt-5.6-luna`. The Windows Store Desktop binary may not be executable by child processes.

### Workers appear as normal Desktop tasks

Confirm you are running this alpha or newer and that the adapter starts sessions with `ephemeral=true`. A restarted MCP process creates a fresh hidden pool.

### The Leader status is not visible while Sol waits

Start a new Codex task after installing 0.5.2 so the new MCP process is loaded. On Codex CLI 0.146.0, `start_task` should report `display.mode=native-window`; the window publishes a local `*.window.json` ready marker only after it is actually rendered. If it does not render, check the adjacent `*.window-error.log`. `HELIOLUNE_STATUS_WINDOW=off` disables the fallback. A future host that advertises MCP Apps uses the inline panel instead.

### Plugin removal reports that a file is in use

Close or restart the Codex task currently using Heliolune, then rerun the removal command. Windows prevents deletion while the MCP Node process has its installed script open.

### Savings disappear in a benchmark

Check that both arms use matched warmups and identical response schemas. Accept worker output in the current warm Sol session; do not create a cold Sol subagent solely for acceptance.

## Roadmap

- Extract a provider-neutral controller/worker adapter interface.
- Make controller and worker identities configurable.
- Replace hard-coded lanes with declarative routing profiles.
- Support additional agent hosts and MCP-compatible model backends.
- Add reproducible multi-repository benchmark fixtures.
- Stabilize the MCP contract before 1.0.

See [Architecture](docs/ARCHITECTURE.md), [Benchmark methodology](docs/BENCHMARKS.md), [Contributing](CONTRIBUTING.md), [Security policy](SECURITY.md), [Changelog](CHANGELOG.md), and the [Release checklist](RELEASE_CHECKLIST.md). Chinese versions are linked from [简体中文 README](README.zh-CN.md).

## License

MIT © 2026 Sicheng Gu. See [LICENSE](LICENSE).
