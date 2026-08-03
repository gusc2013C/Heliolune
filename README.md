# Heliolune

English · [简体中文](README.zh-CN.md)

**High-intelligence supervision, low-cost execution.**

Heliolune is an alpha-stage orchestration project for pairing a capable controller with economical worker models behind a compact, blocking MCP boundary. Its first adapter is a Codex plugin in which GPT-5.6 Sol sends one compact task and the MCP expands it into a four-worker Luna/max burst with detached-worktree write isolation.

The name combines the imagery of the sun and moon, but the architecture is deliberately model-, provider-, and host-neutral. Sol/Luna on Codex is the first working profile—not the final boundary of the project.

> Current release: **`0.6.5`**. Public contracts may change before 1.0.

Heliolune is a personal open-source project by **Sicheng Gu**. It is not affiliated with or endorsed by OpenAI.

## What problem it solves

Cheap workers stop being cheap when the expensive controller repeatedly polls them, rereads their exploration, starts cold acceptance sessions, or receives oversized transcripts. Heliolune places worker execution behind a start-once / await-once MCP boundary:

```text
controller / governor
  |  compact objective, acceptance criteria, scope and budget
  v
Heliolune MCP boundary (start once, await once, never poll from Sol)
  |-- exact-scope owner
  |-- contract, edge/test and correctness reviews
  v
compact evidence, changes, checks, risks, timing and usage
  |
  v
controller review and final acceptance
```

The stronger model stays responsible for decisions where judgment matters. Lower-cost models do bounded repository work and return evidence instead of an open-ended transcript.

## Current capabilities

- One compact `start_task` fast path deterministically creates an exact-scope owner plus contract, edge/test, and correctness-risk reviews.
- A no-model `runtime_info` preflight requires the exact semantic version, build ID, and prompt identity, so a stale same-version MCP fails closed before paid work.
- Four-way speed-first is the default profile; custom 2–8 stream batches are advanced, and token-first remains an explicit safety fallback.
- Luna workers use `max` reasoning effort.
- Worker sessions are ephemeral and normally stay out of the Codex Desktop task list.
- The standalone Codex app-server is launched hidden; on Windows the WPF Leader panel is the only automatic visible worker surface.
- Read-only burst sessions are reused while the MCP process lives; mutating worktrees receive fresh isolated sessions.
- One asynchronous start plus one blocking await replaces controller-side polling; Sol stops generating until the terminal result returns.
- Adaptive Leader reporting compresses large or risky owner/verifier bundles while small tasks defer a compact digest and avoid another model turn.
- Token-free live status uses one automatic Windows WPF panel. It dynamically shows every active persistent or burst lane, compact natural-language Luna reasoning summaries, and a history-calibrated Sol-only cost / savings projection while Sol is blocked.
- Workers use renewable liveness leases: recent app-server activity keeps them running without a fixed cutoff, while sustained silence wakes one shared Luna/high Leader. Four consecutive app-server-silent checks trip a local high-confidence circuit breaker, so a wedged worker cannot renew forever.
- Ninety seconds is a decomposition target and first liveness checkpoint, not a deadline. In custom batches, every idle slot immediately claims the next queued workstream while slower siblings continue.
- Parallel implementation and repair use fresh Luna sessions in detached Git worktrees. Patches reach the main worktree only after clean-HEAD, completion, scope, overlap, and Git apply gates pass.
- Owner and verifier results use compact, structured contracts.
- Conditional independent verification based on risk, reserved boundaries, incomplete work, or unresolved high-severity findings.
- Only sustained silence can lead to interruption; ambiguous evidence, recent activity, an unavailable Leader, or a low/medium-confidence interrupt recommendation renews the worker for another check until the four-check silent-stall circuit opens.
- Completed turns with invalid JSON may use one same-thread Luna/high schema-repair turn; active work is never steered merely because wall time elapsed.
- Codex bundled Python, Node, and Git paths are preferred through the shell environment policy, avoiding stale virtual-environment shims while retaining host PATH fallbacks.
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
| `runtime_info` | No-model identity preflight for semantic/build/prompt identity, default parallelism, ephemeral workers, hidden app-server, and status surface. |
| `start_task` | Default fast path: expand one compact Sol brief into four Luna/max workstreams; `profile=token-first` is the safety fallback. |
| `start_batch` | Advanced custom route for 2–8 Sol-defined workstreams on four or eight Luna/max workers. |
| `await_task` (`luna-await`) | Block once using the returned job/build identity and return the compact terminal bundle. |
| `cost_dashboard` | Return cumulative cost, history-calibrated Sol-only projections, cache, timing, and per-lane totals without invoking a model. |

The default pool server enables `runtime_info`, `start_task`, `start_batch`, and `cost_dashboard`; low-frequency `initialize_pool` and `pool_status` diagnostics remain server APIs but are excluded from the model tool surface. `await_task` is exposed by the separate blocking server and requires the `buildId` returned by start, preventing a stale same-version await server from silently accepting new work. On Codex Desktop, Sol calls `runtime_info` once, starts one task, then calls `luna-await.await_task` exactly once and remains blocked there without a Heliolune deadline. It must never poll status or local job records. Codex still requires a finite MCP transport guard, so the bundled configuration sets the single await call to 24 hours. Reaching that host-side guard does not cancel the background worker or create a Heliolune execution deadline; a later task can recover the terminal job record.

Heliolune launches one native WPF panel on Windows. The panel auto-detects English or Simplified Chinese, dynamically shows token-first or four/eight-worker burst lanes plus the shared Leader, and adds actual Luna estimated cost, a historical-profile Sol-only projection, and projected savings when terminal usage arrives. It closes 15 seconds after completion or failure; expired startup, stale owner heartbeat, stale terminal snapshot, and missing-record paths also converge on closure. Set `HELIOLUNE_STATUS_WINDOW=off` to disable it or `on` to force it. Heliolune does not also render an inline task panel. A host progress token may still receive standard `notifications/progress` from the start call.

Natural-language activity text comes from official Codex `reasoning/summaryTextDelta` events already produced by the active Luna turn. Heliolune never forwards raw reasoning content, command output, or a worker transcript, and it does not wake another model merely to narrate status.

## Requirements

- Windows 10 or Windows 11 for the currently tested release.
- Codex with plugin and MCP support.
- A standalone official Codex CLI on `PATH` with `app-server` and `gpt-5.6-luna` support.
- Node.js 20 or newer. Node.js 22 is used in CI.
- Git for release packaging.

The MCP runtime is Node-based. The optional native panel uses the inbox Windows PowerShell 5.1 WPF runtime; repository validation and packaging also support PowerShell 7.

### Tested compatibility

| Component | Tested |
|---|---|
| Codex CLI | `0.146.0` |
| Node.js | Syntax validated locally; CI uses Node.js 22 |
| Windows PowerShell | 5.1 |
| PowerShell | 7.x |
| Plugin version | `0.6.5` |

Linux and macOS may work with a suitable standalone Codex CLI, but are not yet release-tested.

## Install from a checkout

Clone or extract the repository, then register its root as a local marketplace:

```powershell
codex plugin marketplace add "C:\path\to\heliolune"
codex plugin add luna-pool-orchestrator@heliolune
```

Use the actual checkout path if it differs. Start a **new Codex task** after installation so Codex loads the newly installed skill and MCP process.

## First use

Delegate a bounded task directly:

```text
Use $luna-pool-orchestrator.
Use the compact start_task fast path to inspect and fix the failing parser tests.
Limit scope to src/parser and tests/parser, run the focused tests, await once,
and let Sol review the integrated result and make the final acceptance decision.
```

No manual four-way decomposition is needed:

```text
Use $luna-pool-orchestrator fast start with its default four-way routing.
Send one compact objective, acceptance list and exact scope; let the MCP create the owner
and three review streams, await once, then review the compact result.
Prefer workstreams under 90 seconds, but do not treat 90 seconds as a hard limit.
```

Parallel writes need a clean Git root and exact disjoint scopes:

```text
Use $luna-pool-orchestrator in speed-first mode.
Have Sol define two independent implementation workstreams with non-overlapping file scopes.
Use four Luna/max workers, detached worktree isolation, and deterministic safe integration.
After one await, Sol must review integration.applied, inspect the main-worktree diff, run focused checks, and accept the result.
```

Good tasks have an explicit outcome, one to eight testable acceptance criteria, narrow file or directory scope, and modest exploration budgets. Avoid pasting repository files or generic project history into the worker request; workers inspect the repository directly.

## Routing behavior

- `core`: bounded production-code analysis and implementation.
- `tests`: tests, fixtures, regressions, and test-focused diagnosis.
- `integration`: build, dependencies, configuration, CLI, and cross-component integration.
- `verifier`: independent read-only verification; never the implementation owner.
- `supervisor`: shared operations leader for liveness, deferred cross-lane tracking, and report compression; uses `high` by default, accepts `xhigh`, and never plans, assigns, inspects the repository, or performs acceptance.

Four-way speed-first is the default, including narrow or single-file work. `start_task` creates one exact-scope owner with read-only contract, edge-case/test, and correctness-risk streams; Sol no longer spends prompt tokens spelling these roles out. Token-first is an explicit fallback only when a mutating repository is dirty or non-Git, write scopes cannot be isolated safely, or a strict dependency makes parallel results unusable. Read-only work remains parallel on dirty repositories. Explicit custom 4/8-way batches remain available through `start_batch`.

Prefer each speed-first workstream to be sized near 90 seconds by splitting broad work into independent streams. Ninety seconds is only the first liveness checkpoint. Recent app-server events renew execution indefinitely without a model call; sustained silence wakes one shared Luna/high Leader. Ambiguous or unavailable decisions keep the lease active for another check, but four consecutive app-server-silent checks trip the local stall circuit breaker. The scheduler uses a shared queue, so an idle slot immediately claims the next remaining workstream while slower siblings continue. The Leader cannot plan, redistribute scope, or accept the batch, and completed siblings survive a straggler or failed workstream.

Mutating batches require `cwd` to be the clean Git repository root. Scopes must be narrow, repository-relative, non-overlapping paths without globs or parent traversal. Every write worker starts in a fresh detached worktree at the verified `HEAD`. Heliolune captures tracked, deleted, renamed, binary, and untracked changes, validates actual paths, applies all patches only when every gate passes, leaves the index unstaged, and removes its temporary worktrees. If a gate fails, the main checkout remains untouched and the result returns local patch artifacts for Sol; do not apply them blindly.

Verification routing is internal. Sol still inspects the integrated diff and runs decisive acceptance checks; Heliolune never treats a worker report as final acceptance.

Reporting is automatic in the public 0.6 contract. Small low-risk token-first bundles return directly and add a tiny lifecycle digest to the Leader backlog. Large bundles, verifier results, high-risk work, reserved boundaries, and actual Sol decisions wake the shared Leader, which receives deferred digests and returns a smaller controller-facing report. Speed-first always uses one terminal Leader aggregate.

Token-first owners and verifiers use the same renewable liveness policy. A completed turn with invalid JSON may receive one same-thread, no-tools schema-repair request. Mutating workers must still rerun decisive checks after their last edit; supplied, runnable acceptance may yield `completed`, while unavailable hidden tests remain risks for Sol. Workers may return `partial` rather than inventing evidence.

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

The 0.6.2 deterministic coding check reached 12/12 in both arms: Sol-only took 123.532s and the Heliolune engine took 127.451s, with measured Luna worker cost of 0.457633 units. See the [0.6.2 fast-start benchmark](docs/0.6.2-FAST-START-BENCHMARK.md) for the controller-cost caveat and startup-surface measurements.

A larger single-arm frontend application test produced a credible responsive dashboard for 0.450291 Luna worker units, but the writer's completion notification timed out and required deterministic artifact recovery. The [0.6.2 frontend application benchmark](docs/0.6.2-FRONTEND-APPLICATION-BENCHMARK.md) records the visual/interaction acceptance, stale-test and lint failures, and the resulting reliability limits without presenting the recovered run as an automatic success.

The 0.6.3 backend diagnostic reproduced a stale serial runtime, fixed the runtime identity and hidden-window gate, then safely integrated a two-file Python implementation through the default four-way route. The final run took 337.050s for 0.584154 Luna worker price units and passed 12/12 public plus 8/8 repository-external hidden tests. See the [0.6.3 runtime diagnostic](docs/0.6.3-RUNTIME-DIAGNOSTIC.md); it is evidence of cost-first application value, not a Sol-only speed comparison.

The 0.6.4 renewable-liveness regression completed a five-workstream/four-slot real Luna run with a 30-second first checkpoint. Two workers naturally finished after that checkpoint, and the first idle slot claimed the queued fifth workstream before the slowest sibling completed. See the [0.6.4 renewable-liveness validation](docs/0.6.4-RENEWABLE-LIVENESS.md).

The 0.6.5 release gate reran the installed plugin through the Codex host, native-window auto-close, token-first lifecycle audit, queued four-slot scheduling, opt-in eight-way concurrency, and isolated parallel writes. All final runs completed, every smoke proved runner cleanup, and the process audit found zero standalone Heliolune app-servers. See the [0.6.5 real-demo validation](docs/0.6.5-REAL-DEMO.md).

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

Ask Codex to call `cost_dashboard` with `format=markdown` for a compact report, or `format=json` for machine-readable totals. Metrics persist in the local Heliolune registry across MCP restarts. Successful tasks, liveness checkpoints, supervisor actions, schema repairs, and legacy timeout records are counted; failed-turn usage is included only when app-server reported it before interruption.

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

Start a new Codex task after installation so the new MCP process is loaded. `start_task` and `start_batch` should report `display.mode=native-window`; the window publishes a local `*.window.json` ready marker only after it is actually rendered. If it does not render, check the adjacent `*.window-error.log`. `HELIOLUNE_STATUS_WINDOW=off` disables it.

### Plugin removal reports that a file is in use

Close or restart the Codex task currently using Heliolune, then rerun the removal command. Windows prevents deletion while the MCP Node process has its installed script open.

### Savings disappear in a benchmark

Check that both arms use matched warmups and identical response schemas. Accept worker output in the current warm Sol session; do not create a cold Sol subagent solely for acceptance.

## Roadmap

- Extract a provider-neutral controller/worker adapter interface.
- Make controller and worker identities configurable.
- Stabilize declarative token-first and speed-first routing profiles.
- Add optional deterministic setup hooks for dependencies needed inside isolated write worktrees.
- Support additional agent hosts and MCP-compatible model backends.
- Add reproducible multi-repository benchmark fixtures.
- Stabilize the MCP contract before 1.0.

See the [0.6.5 real-demo validation](docs/0.6.5-REAL-DEMO.md), [0.6 engineering report](docs/0.6-RESEARCH.md), [Heliolune vs Codex subagents](docs/HELIOLUNE-VS-CODEX-SUBAGENTS.md), [Architecture](docs/ARCHITECTURE.md), [Benchmark methodology](docs/BENCHMARKS.md), [Contributing](CONTRIBUTING.md), [Security policy](SECURITY.md), [Changelog](CHANGELOG.md), and the [Release checklist](RELEASE_CHECKLIST.md). Chinese versions are linked from [简体中文 README](README.zh-CN.md).

## License

MIT © 2026 Sicheng Gu. See [LICENSE](LICENSE).
