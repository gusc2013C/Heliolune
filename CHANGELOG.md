# Changelog

All notable changes to Heliolune are documented here. The project follows Semantic Versioning.

English · [简体中文](CHANGELOG.zh-CN.md)

## [0.6.2] - 2026-08-02

### Fast start

- Make compact `start_task` the normal route. The MCP deterministically expands one Sol objective, acceptance list, and scope into an exact-scope owner plus contract, edge/test, and correctness-risk Luna/max workstreams.
- Reduce the hot-path skill by 65.5%, from approximately 3,173 to 1,096 serialized-character tokens. Remove low-frequency `initialize_pool` and `pool_status` from the default enabled tool surface; the installed pool schema is approximately 1,192 tokens and the normal `start_task` schema is approximately 455 tokens.
- Add a strict availability gate: when `start_task` or `await_task` is absent, Sol stops immediately and requests a new Codex task/restart instead of scanning plugin caches, rereading manifests, or manually launching MCP scripts.

### Reliability

- Persist every job's orchestrator PID, process start, heartbeat, and bounded expiry. The independent await server now converts an orphaned running record into a terminal failure instead of waiting up to 65 minutes on a stale snapshot.
- Let the native bilingual status window detect an exited orchestrator directly, mark unfinished worker cards failed, explain recovery, and close normally.
- Increase the default structured-finalization reserve to 50% for short tasks (capped at 90 seconds). If Luna/max ignores the stop-and-synthesize steer for 10 seconds, interrupt that turn and use the remaining budget for a same-session, read-only Luna/high schema synthesis.
- Keep each worker hard-bounded and preserve completed sibling outcomes; a live straggler may use its declared deadline but cannot make the job wait indefinitely.
- Do not hold a safely isolated owner patch merely because a read-only companion timed out; only incomplete mutating workstreams block deterministic integration.

## [0.6.1] - 2026-08-02

### Changed

- Make four-way `speed-first` the unconditional product default instead of only a conditional route for obviously separable tasks.
- Route narrow and single-file work through one isolated mutating owner plus meaningful read-only contract, edge-case/test, and correctness-risk workstreams; never create overlapping writers or dummy workstreams.
- Keep `token-first` only as a documented safety fallback for dirty/non-Git mutating checkouts, writes that cannot be isolated, or strictly dependent work.
- Default `initialize_pool`, tool ordering, plugin prompts, and bilingual guidance to parallel execution so a fresh Codex task does not silently select the serial path.
- The clearer default/fallback tool descriptions raise the complete approximate tool surface from 1,557 to 1,586 tokens; it remains about 37.1% below the pre-0.6 surface.

## [0.6.0] - 2026-08-02

### Added

- Add a Sol-selected `token-first` profile and a `speed-first` profile with four stable-default or eight experimental Luna/max burst workers.
- Add `start_batch` for 2–8 independent, Sol-defined workstreams with per-workstream deadlines and failure isolation.
- Let one shared Luna/high Leader manage all still-active parallel sessions at the 90-second sizing checkpoint, then reuse the warm Leader to aggregate terminal outcomes. Ninety seconds is not a hard cap; bounded workstreams may run up to 600 seconds.
- Dynamically render all four/eight burst workers and the shared Leader in the native status window.
- Add detached-HEAD Git worktree isolation for parallel implementation and repair. Clean-HEAD, exact-scope, completion, actual-path overlap, and `git apply --check --index` gates must all pass before patches are safely applied to the main worktree.
- Retain local patch artifacts instead of changing the main worktree when deterministic integration is held for Sol.
- Add an English/简体中文 comparison of Heliolune and native Codex subagents, based on the official Codex subagent and worktree documentation.

### Optimized

- Make four-way parallelism the conditional default for separable workstreams after cold-equivalent read-only cost stayed comparable to serial execution while mean wall time improved about 3.8x. Keep eight-way opt-in because of tail variance.
- Remove the inline MCP App, app-only `job_status`, duplicate public `run_task`, and low-frequency public tuning fields. The complete 0.6 tool surface is approximately 38.2% smaller than the previous token-first surface by serialized-character estimate.
- Accept both nested `params.turn.id` and top-level `params.turnId` completion notifications, avoiding false active timeouts after a worker has already completed.
- Compact batch usage, cost projections, and output strings before returning them to Sol; full pricing assumptions remain available from `cost_dashboard`.
- Use fresh ephemeral Luna sessions for mutating worktrees so cache history cannot leak another workstream's checkout context.

### Safety and verification

- Sol alone decomposes batches and owns architecture, security, public APIs, irreversible migrations, risk acceptance, review, and final acceptance. The Leader manages liveness and compression only.
- A real two-worker write smoke safely integrated two disjoint files in 35.541 seconds total, left the Git index clean, and removed every temporary worktree. Focused Git safety tests cover clean integration, out-of-scope rejection, dirty-main rejection, and changed-HEAD rejection.

## [0.5.2] - 2026-08-02

### Added

- Emit standard MCP `notifications/progress` updates when the Codex host supplies a progress token.
- Add `start_task` plus the independent `luna-await.await_task` server so Sol blocks once without preventing token-free status reads.
- Add a modern Windows WPF fallback panel for hosts without MCP Apps: five lane cards, per-worker progress, Luna-provided natural-language reasoning summaries, history-calibrated Sol-only cost and savings projections, English/简体中文 auto-detection, a rendered-window handshake, and bounded auto-close.
- Add an inline MCP App with the same transcript-free five-lane status contract for hosts that advertise `io.modelcontextprotocol/ui`; the native fallback is suppressed on those hosts.
- Keep rate-limited standard progress for compatible single-call hosts, covering routing, live activity, cache state, finalization, verification, report compression, and terminal handoff.
- Add an English/简体中文 documentation switch and translated project, architecture, benchmark, contribution, security, and release-checklist documents.
- Extend the repository changelog back to the pre-Git `0.4.0` prototype.

### Compatibility

- Progress is optional under MCP. Codex CLI 0.146.0 omits `_meta.progressToken` for model-initiated MCP calls and does not advertise the MCP Apps extension, so Windows uses the native panel automatically.
- Restore `windir` from `SystemRoot` only inside the panel process because Codex's sanitized MCP environment omits it and legacy WPF font initialization requires an absolute Windows Fonts URI.
- Read the Windows user locale from the registry when Codex sanitizes Node locale variables, keeping Luna-authored status explanations aligned with the panel language.
- A new Codex task is required after plugin installation to load the updated MCP process.
- Default installed Heliolune MCP tools to `approve` so non-interactive and Desktop hosts can enter the blocking call without a redundant MCP prompt; Codex sandbox boundaries and user overrides remain in force.

## [0.5.1] - 2026-08-02

### Added

- Promote the shared supervisor session to a Luna/high operations leader that handles liveness, deferred cross-lane tracking, and controller-facing report compression.
- Add `reporting=auto|leader|direct`, `leaderThresholdChars`, `leaderEffort`, `leaderTimeoutSeconds`, and opt-in raw audit bundles.
- Persist a bounded lifecycle-digest backlog so small tasks can defer the Leader model turn without losing operational continuity.

### Optimized

- Use adaptive reporting by default: small low-risk bundles return directly; dense, verified, high-risk, reserved, or escalated bundles wake the Leader.
- Remove thread IDs, verbose cost assumptions, inactive finalization metadata, and deterministic activity messages from Leader-mode controller payloads.

### Boundaries

- The Leader may track and compress supplied worker state but may not inspect the repository, plan or assign work, decide architecture/security/public APIs/migrations, judge correctness beyond a verifier verdict, or perform final acceptance.

## [0.5.0-alpha.2] - 2026-08-02

### Fixed

- Reserve 40–90 seconds inside the original task deadline and use app-server `turn/steer` to make active Luna/max work stop tools and emit its final structured result.
- Preserve and aggregate interrupted-work usage with synthesis usage instead of dropping or double-counting it.
- Preserve usage and activity metadata when a completed turn returns invalid structured output.

### Changed

- Use one no-tools fallback turn only for completed invalid JSON, and prefer an honest partial result over renewed exploration.
- Track finalization attempts and recoveries in the cost dashboard.
- Clarify that scope and acceptance should be narrowed before either timeout or synthesis reserve is increased.

## [0.5.0-alpha.1] - 2026-08-02

### Added

- A blocking Codex MCP adapter with `core`, `tests`, `integration`, and independent `verifier` lanes.
- Hidden ephemeral GPT-5.6 Luna workers running at `max` reasoning effort.
- Compact task/result contracts with exact timing and token-usage reporting.
- Conditional verification, timeout interruption, and controller-reserved decision boundaries.
- Reproducible release packaging, Windows PowerShell 5.1/PowerShell 7 validation, and GitHub Actions checks.
- Provider-neutral pricing, per-task cost estimates, cumulative raw-usage metrics, and a dependency-free `cost_dashboard` MCP tool.
- A shared Luna/high supervisor session with event-based liveness snapshots, a bounded soft-timeout judgment, interruption accounting, and an unchanged deterministic hard deadline.

### Optimized

- Reuse worker threads inside one MCP runtime instead of trying to resume active ephemeral threads.
- Keep Sol acceptance in the current warm controller session.
- Bound verifier scope and evidence to avoid repeating owner exploration.
- Require matched warmups and identical response schemas in comparative benchmarks.

### Known limitations

- The first adapter currently targets Codex and the Sol/Luna model pairing.
- Worker sessions last only for the lifetime of the MCP process.
- Price-weighted savings are estimates unless actual billed credits are available.

## [0.4.0] - Pre-Git prototype

### Added

- A prompt/Skill-based Sol controller with four function-affine Luna worker roles and stable role prompts intended for session reuse and cache locality.
- Cost-first delegation rules that reserved architecture, security boundaries, public APIs, irreversible migrations, review, and final acceptance for Sol.
- Early paired Sol-only versus Sol+Luna benchmark prompts and price-weighted token accounting.

### Limitations discovered

- Luna was not consistently available as a native subagent model, which motivated the later local MCP/app-server adapter.
- Controller polling and repeated transcript transfer could make Sol input larger than the work it delegated.
- Broad Luna/max turns could remain active for 90–180 seconds without emitting a final structured result.
- Worker lifecycle, visibility, timeout classification, packaging, and marketplace installation were not yet production-shaped.

This entry reconstructs the last pre-Git prototype from the project's retained benchmark notes and migration history; `0.5.0-alpha.1` is the first version preserved by the current Git repository.
