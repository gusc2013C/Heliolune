# Changelog

All notable changes to Heliolune are documented here. The project follows Semantic Versioning.

English · [简体中文](CHANGELOG.zh-CN.md)

## [0.8.0] - 2026-08-18

### Stable Native V2 and compact Sol acceptance

- Promote the Native V2 plugin to stable `0.8.0+codex.20260818153255` while retaining alpha.3 and alpha.4 evidence as historical records.
- Add `validate-release.ps1 -Compact`: it still executes the complete 205-test release suite, streams output to a temporary file, emits 65 bytes on success, and preserves a bounded 40-line/8 KiB diagnostic tail on failure.
- Make release packaging use compact validation and instruct Sol to batch distinct acceptance checks, never rerun owner checks, and prefer compact HelioTerm evidence.
- Record a measured validator reduction from 18,538 to 65 bytes (18,473 bytes, 99.65%) and HelioTerm cumulative compression of 652,453 bytes (43.9%) with 80 avoided model boundaries.
- Retain diagnostic rollout counters as non-billing evidence: the observed long Sol task had a 98.15% input-cache rate, but excessive task length and 86.54% single-call wrappers remain forward-looking optimization targets rather than retrospective savings claims.
- Prove the accepted implementation owner was `gpt-5.6-luna` / `max`, Native V2, with 9 tool calls and 18,146 cumulative persisted tool-output bytes.

See the [stable token-efficiency release note](docs/0.8.0-STABLE-TOKEN-EFFICIENCY.md) and [简体中文版本](docs/0.8.0-STABLE-TOKEN-EFFICIENCY.zh-CN.md).

## [0.8.0-alpha.4] - 2026-08-18

### Bounded discovery and token-efficiency evidence

- Update the Native V2 manifest to `0.8.0-alpha.4+codex.20260818140328` and keep alpha.3 documents as historical release evidence.
- Require the 1..4 `readFirst`/anchor-first bounded-slice gate: one targeted anchor query consumes the first discovery call, followed by at most four bounded reads.
- Record aggregate rollout counters and HelioTerm A/B routing facts in a privacy-safe diagnostic JSON audit. The counters are explicitly not billing tokens and contain no prompts, command payloads, environment data, stdin, secrets, task IDs, or raw tool output.
- Route ordinary HelioTerm failures (8.8 KB single-input and 15.0 KB batch-input cases) to `model=0` with `semanticScore=0`, while explicit semantic requests and real test diagnostics retain Luna routing with `semanticScore=3`.
- Measure the single-Luna repair comparison: the current one-turn repair used 3,724,754 diagnostic tokens versus 4,347,302 for the previous two-turn repair, a reduction of 622,548 (14.32%).
- Enforce forward-looking owner evidence budgets of 12 KiB/160 lines for read and search, 24 KiB per tool result, 192 KiB cumulative tool output, and compact verification output; these controls do not claim retrospective savings.

See the [alpha.4 token-efficiency release note](docs/0.8.0-ALPHA.4-TOKEN-EFFICIENCY.md) and [简体中文版本](docs/0.8.0-ALPHA.4-TOKEN-EFFICIENCY.zh-CN.md).

## [0.8.0-alpha.3] - 2026-08-17

### Native V2 ownership and bounded terminal I/O

- Make the Native V2 `heliolune` plugin the current release identity, with a reusable Luna owner, bounded follow-up turns, structured evidence, and independent Sol acceptance.
- Keep the legacy `luna-pool-orchestrator` plugin and its 0.7.0-alpha.2 runtime identity as a validated compatibility adapter.
- Ship deterministic direct HelioTerm execution by default, with explicit bounded model-backed terminal fallback and the Native V2 agent profiles required for installation and proof.
- Add English counterparts and language links for the alpha.3 session-reuse and HelioTerm measurement notes. See [`Luna session reuse`](docs/0.8.0-ALPHA.3-LUNA-SESSION-REUSE.md), [`direct HelioTerm optimization`](docs/0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.md), and [`HelioTerm three-path measurements`](docs/0.8.0-ALPHA.3-HELIOTERM-AB3.md).

## [0.7.0-alpha.2] - 2026-08-03

### Executable task graphs

- Promote task nodes from telemetry-only records to validated `TASK_DAG_V1` execution with dependency, missing-node, cycle, self-dependency, READY-state, and failure-propagation semantics.
- Add read/write leases and reject unordered conflicts before any model call. Reject chained writers in alpha.2 because successor worktrees cannot truthfully inherit an unintegrated predecessor patch.
- Add event-driven adaptive `1 → 2 → 4` widening, explicit full-width `throughput` (`speed-first` remains a legacy alias), deterministic critical-depth/priority/path-affinity assignment, and optional queued-node cancellation after required completion and an explicit quorum.
- Bind post-patch challenges to the producer's exact detached worktree, base commit, and SHA-256 candidate fingerprint; require a different worker slot, omit owner reasoning, and fail if the candidate changes during review.
- Extend `TASK_NODE_V1` with graph dependencies, leases, assignments, width transitions, blocked/cancelled states, fingerprints, and DAG-derived critical-path telemetry.

### Validation and measured limits

- Add eight graph-scheduler regressions, including a busy-alternate-slot challenge gate and worker-blocked propagation, plus clean-room dependency-evidence, profile/telemetry/worktree/MCP checks and a real candidate-bound write harness. Align throughput's runtime with its declared 1/2/4/8 schema. The candidate suite passed 121 dependency-free tests before packaging.
- Complete the final-source real Luna/max `owner → challenge` run in 371.676 seconds with different-slot clean-room review, stable candidate fingerprint, safe unstaged integration, complete temporary-worktree cleanup, and detached-runner exit. Its 337.349-second challenge, versus 140.129 seconds in an earlier corrected run, is retained as explicit quality/latency and long-tail evidence.
- Run one matched broad adaptive/throughput pair. Adaptive observed 27.19% lower wall time but 25.93% higher estimated cost; both routes opened the same four slots at 0ms, so the result is reported as `n=1` model/output variance rather than a causal DAG speedup.
- Pass a cachebuster-reinstalled fresh Codex app-server smoke with exact version/build/prompt/DAG identity, a real adaptive Luna/max turn, independent await, Simplified Chinese native-window auto-close, and detached runner/app-server-tree exit.
- Defer child-task suggestions, speculative straggler hedging, Terra counsel, learning-based routing, and p50/p95 claims. See [`docs/0.7.0-ALPHA.2.md`](docs/0.7.0-ALPHA.2.md).

## [0.7.0-alpha.1] - 2026-08-03

### Adaptive routing and observable decisions

- Make `adaptive` the default `start_task` profile, selecting one, two, or four Luna/max workers from deterministic risk, scope, acceptance, and reserved-boundary signals. Keep explicit four-way `speed-first`, advanced custom batches, and token-first safety fallback.
- Add non-executing shadow adaptive decisions to speed-first runs and versioned `TASK_NODE_V1` telemetry for actual/shadow routing, node state, queue wait, critical path, utilization, and Leader share. Metrics outside the MCP boundary are explicitly unavailable.
- Allow low-risk completed one/two-worker bundles to return directly while preserving Leader use for high risk, partial work, escalation, unsafe integration, and four-way aggregation.
- Extend detached-worktree safety and shared-queue scheduling to adaptive one/two-worker write plans.

### Evaluation

- Add classifier, 1/2/4 scheduling, direct-report, telemetry, numeric-slot, and single-writer safe-apply regressions.
- Run real matched Luna/max arms. A narrow adaptive one-worker review reduced wall time 29.88% and estimated cost 86.18% versus the four-worker 0.6.5 path. A moderate two-worker review reduced estimated cost 36.97% but increased wall time 3.57% because of a straggler; this negative result is retained and the release makes no universal speed claim.
- Pass 111/111 release tests under Windows PowerShell 5.1 and PowerShell 7.6.4; pass a fresh installed-host adaptive run with native-window auto-close and full process cleanup; and pass a real two-writer detached-worktree safe-apply run.
- Preserve explicit speed-first after a separate broad independent baseline showed 3.176x four-way speedup at matched quality. See [`docs/0.7.0-ALPHA.md`](docs/0.7.0-ALPHA.md).

## [0.6.5] - 2026-08-03

### Detached job ownership and cleanup

- Persist a starting record and request, then transfer execution to a hidden detached runner instead of letting the short-lived MCP stdio process own the job. A complete claim document is published atomically with an exclusive hard link, and the independent await server continues to deliver the terminal result.
- Keep the runner referenced until its job is terminal, defer `SIGINT`/`SIGTERM` while work is active, and explicitly close the standalone app-server process tree. Windows now waits for both `taskkill /T` and the app-server's own exit confirmation; POSIX waits for `exit`/`close` and escalates only after a bounded grace period.
- Add opt-in runner lifecycle diagnostics and make every real smoke wait for the runner PID to exit. This closes the completed-run process leak that accumulated app-server children and eventually caused intermittent orphan failures.

### Runtime identity and bounded stall convergence

- Add exact build identity `0.6.5-owner-heartbeat-r2` alongside semantic version and prompt identity. The pool preflight, detached request, runner, and required await argument all agree on this value, so a stale same-version pool or await MCP fails closed after plugin reinstall.
- Persist an owner heartbeat every five seconds independently of model progress. Await and the native panel fail a running job after 30 seconds without an owner heartbeat, which also protects against PID reuse and a silent detached owner.
- Keep renewable execution for active workers, but interrupt after four consecutive liveness checks with no app-server activity. Any event resets the circuit breaker, so long active work has no fixed deadline while a truly silent worker cannot renew forever.

### Native status reliability

- Keep the native panel's 15-second terminal countdown and make the Codex-host smoke prove that the window PID exits automatically.
- Read job snapshots with Windows `ReadWrite|Delete` sharing and use a longer staggered retry window for transient `EPERM`, `EBUSY`, or `EACCES` atomic replacements. This removes the observed race where a panel or await refresh could make an otherwise successful job fail while writing its terminal record.
- Force a terminal record to override any stale running snapshot; turn expired startup leases, dead owners, and stale heartbeats into a failed terminal UI; and close after a job record remains unavailable. The live benchmark is explicitly headless so deleting its temporary job root cannot orphan a panel.
- Canonicalize Git roots and compare Windows paths case-insensitively before parallel-write isolation, fixing GitHub Actions failures caused by equivalent runner paths with different casing or representation.

### Real demo validation

- Reproduce the installed 0.6.4 failure through `runtime_info` → `start_task` → independent `await_task`: the four-way demo ran about 5 minutes 48 seconds before its owner exited. Additional 0.6.5 candidate runs exposed the completed-process leak, non-atomic claim publication, POSIX shutdown gap, and Windows panel/read race; each became a focused regression before the matrix was restarted.
- Pass 103 dependency-free automated tests and the PowerShell 5.1 release validator.
- Pass the final installed-host r2 run in 240.018 seconds with 4/4 Luna/max workers, exact pool/await build identity, Chinese native status, independent await delivery, window auto-close, and runner/app-server auto-exit.
- Pass a 238.658-second token-first lifecycle audit with no medium/high/critical risks; fix its one low-risk Windows exit-confirmation finding; then pass a five-workstream/four-slot queued run in 99.535 seconds, an eight-workstream/eight-slot run in 94.892 seconds, and a two-writer safe-apply run in 70.085 seconds.
- Reproduce the reported stuck panel as benchmark job `993ad283`: the job and runner were terminal, but temporary state cleanup removed the record before the panel saw it. Close that exact process, add harness and panel regressions, and finish with zero matching pool/await MCP, runner, status-window, or standalone app-server processes. The retained evidence is documented in [`docs/0.6.5-REAL-DEMO.md`](docs/0.6.5-REAL-DEMO.md) and [`benchmarks/results/0.6.5-real-demo-r1.json`](benchmarks/results/0.6.5-real-demo-r1.json).

## [0.6.4] - 2026-08-03

### Renewable worker liveness

- Remove fixed worker execution deadlines, active-turn finalization steering, job expiry timestamps, and the await server's 65-minute cutoff. An active worker may now run until its natural terminal result.
- Replace the public `timeoutSeconds` field with `checkpointSeconds`. This is only the first renewable liveness check and is capped at the 90-second decomposition target; it never limits execution duration.
- Recheck liveness every 30 seconds after the first checkpoint. Recent app-server activity renews locally without a Leader model turn. Sustained silence wakes the shared Luna/high Leader, and only a high-confidence stall decision can interrupt; ambiguous, unavailable, or low/medium-confidence decisions continue.
- Keep orphan protection: a job becomes failed when its owning orchestrator process exits, without treating elapsed wall time as failure.
- Preserve a single same-thread Luna/high recovery only for a completed turn that returned invalid JSON.

### Parallel scheduling and diagnostics

- Make the existing shared-queue behavior explicit and tested: an idle burst slot immediately claims the next queued workstream while slower siblings continue. The Leader still does not plan or redistribute scope.
- Capture authoritative `item/completed` final-answer items when `turn/completed` is delayed or missing, and retain compact failure diagnostics for app-server activity and structured-output recovery.
- Remove an obsolete benchmark-harness deadline that could terminate a still-running source test independently of Heliolune.
- Remove all timing fields from the normal `start_task` schema and shorten tool descriptions. The installed pool surface falls from approximately 1,447 to 1,151 schema tokens (-20.46%); the normal `runtime_info` + `start_task` path falls from 643 to 480 (-25.35%), and advanced `start_batch` from 579 to 447 (-22.79%).
- Keep only a 24-hour Codex MCP transport guard around the single await call. It is not a worker deadline and cannot cancel the independently running background job.

### Validation

- Pass 72 dependency-free automated tests, including renewable completion beyond a fixed completion window, repeated silent-stall judgment, legacy-expiry immunity, idle-slot queue claiming, and conservative Leader treatment of unsupported worker risks.
- Complete a real five-workstream/four-slot Luna/max run with a 30-second first checkpoint in 64.515 seconds. Two workers naturally completed after the checkpoint (37.972s and 48.871s), the queued fifth stream was claimed by `burst-2`, and recent activity avoided all management turns.
- Complete a real eight-workstream/eight-slot Luna/max run with the same 30-second checkpoint in 114.065 seconds. All 8/8 streams completed, including a 92.968-second tail worker, without a management turn or time-based interruption; eight-way remains opt-in because of tail variance.
- Complete real four-way read-only and two-worker isolated-write smokes. The write run safely applied both disjoint paths, left the index clean, and removed temporary worktrees.
- Complete a final default `start_task` run in 241.912 seconds with all 4/4 Luna/max workers successful. Two workers naturally ran for 162.639 and 218.899 seconds, management checks remained zero because activity renewed locally, and no elapsed-time boundary interrupted them.
- Record and harden against a Luna review hallucination found in that run: Leader aggregation now labels unsupported worker risks as candidate findings, never upgrades their severity, and does not present Leader confidence as a correctness verdict.

## [0.6.3] - 2026-08-02

### Runtime identity and visibility

- Add the token-free `runtime_info` preflight. The skill now refuses paid work unless the loaded MCP reports 0.6.3, four-way `speed-first`, ephemeral burst threads, a hidden standalone app-server, and the native Windows status surface. This prevents a new skill from dispatching through a stale serial MCP process.
- Keep the compact skill at approximately 1,099 serialized-character tokens, essentially unchanged from 0.6.2's 1,096. `runtime_info` adds approximately 92 schema tokens to the installed surface; it replaces much more expensive failed dispatches and cache inspection.
- Keep all Luna burst threads ephemeral and the standalone app-server hidden. The WPF Leader panel is the only automatic Windows worker surface; Heliolune does not create Codex Desktop worker tasks.
- Prefer Codex's bundled Python, Node, and Git toolchain through the documented shell environment policy. This avoids stale virtual-environment shims such as a broken Gaia Python launcher while retaining normal host PATH fallbacks.

### Parallel reliability

- Run the contract lane concurrently with the owner. Only an explicit `status=blocked` plus a real reserved `needsSol` decision can interrupt the writer; ordinary ambiguity and possible hidden expectations remain non-blocking risks.
- Mark contract, edge, and verifier results as independent base-snapshot guidance. The Leader no longer treats their inability to observe a concurrent owner patch as evidence that the patch is missing or contradictory.
- Weight progress toward the mutating owner, expose quarantined non-empty patches as recovery candidates, and keep safety gates closed for genuinely incomplete writers.
- Reduce automatic finalization reserve from 50%/90 seconds to a 40–60 second window, give the original turn a proportional 10–20 second steer grace, and require decisive checks after the last edit.
- Define `completed` against supplied, runnable acceptance checks. Unavailable hidden tests are reported as risks and no longer make every otherwise complete worker result `partial`.

### Diagnostic benchmark

- Add a dependency-free Python backend fixture benchmark. The final four-way run safely integrated two files in 337.050 seconds for 0.584154 Luna price units, with 69.83% worker input cache and a history-calibrated 75.63% projected saving versus Sol-only.
- Sol acceptance passed 12/12 public tests and 8/8 repository-external hidden tests. Earlier failed trials are retained in the report because each exposed a separate orchestration defect fixed above.

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
