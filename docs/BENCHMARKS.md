# Benchmark methodology

English · [简体中文](BENCHMARKS.zh-CN.md)

Heliolune optimizes for controller-model cost without surrendering acceptance quality. A valid comparison therefore measures quality, paid-token estimates, cache behavior, and wall time together.

## Rules

- Use the same repository state, task, scope, acceptance criteria, and response schema for every arm.
- Match warmup conditions and report warmups separately as measurement overhead.
- Keep controller acceptance in the current warm session; do not create a cold controller solely to judge worker output.
- Report input, cached input, output, reasoning output, cache rate, and planning/execution/acceptance wall time.
- Treat price-weighted token calculations as estimates unless billed credits are available.

## 0.7.0 alpha adaptive-routing evaluation

Real matched runs show task-shape-dependent results. On a narrow review, adaptive one-worker routing reduced wall time 29.88% and estimated cost 86.18% versus the 0.6.5 four-worker path. On a moderate review, adaptive two-worker routing reduced estimated cost 36.97% but increased wall time 3.57% after one worker became a straggler. A separate broad independent baseline still favored four-way execution by 3.176x at matched quality. Each arm currently has one sample, so these results support an alpha classifier and explicit speed-first escape hatch—not a universal latency claim. See [the full evaluation](0.7.0-ALPHA.md) and [raw result](../benchmarks/results/0.7.0-alpha.1-adaptive-r1.json).

## Alpha 0.5.0 reference measurements

These local microbenchmarks are directional, not universal performance claims.

| Test | Result |
|---|---:|
| Matched quality | Sol-only 10/10; Sol + Luna 10/10 |
| Normalized paid-token estimate at 25:1 | 3,702 vs. 902.32; 75.6% estimated savings |
| Matched wall time | Sol + Luna was 23.2% slower |
| Same-lane warm reuse | 24.113s to 10.709s; about 2.25x faster |
| Warm worker cache rate | 94.65% |
| Optimized verifier | 272.947s to 100.069s; about 63.3% faster |
| Timeout interrupt | 30.317s for a 30s limit |

Results depend on repository size, task shape, model pricing, host prefix size, and cache state. Re-run the suite before making release claims about another adapter or pricing tier.

## Default alpha price table

Rates are price units per one million tokens: Sol `125 / 12.5 / 750`, Terra `50 / 5 / 300`, Luna `5 / 0.5 / 30`, GPT-5.5 `125 / 12.5 / 750`, GPT-5.4 `62.5 / 6.25 / 375`, GPT-5.4 Mini `18.75 / 1.875 / 113`, and GPT-5.3-Codex `43.75 / 4.375 / 350` for ordinary input, cached input, and output respectively.

The visible dashboard and status-window projection use the retained matched-quality alpha ratio: `3,702 / 902.32 = 4.102757x`. They scale current observed Luna worker cost to a projected Sol-only workload cost and report `75.63%` directional savings. This is not a current matched arm because the MCP cannot observe current controller tokens. Raw JSON retains same-token repricing for price sensitivity only. A release benchmark must still run matched arms when claiming end-to-end quality, speed, or savings.

## Live supervisor regression

The installed `0.5.0-alpha.1` plugin was exercised with a six-file read-only Luna/max review, a 90-second hard deadline, a forced supervisor checkpoint at 30 seconds, and Luna/high supervision. The supervisor returned `continue` with high confidence. At the hard deadline the owner had emitted 81 activity events, the latest was `thread/tokenUsage/updated`, and silence was only 1ms, so Heliolune correctly classified the failure as `hard_timeout_active` rather than a stalled session.

Across two forced-timeout live regressions, the cumulative dashboard reported 101,698 input tokens, 59,904 cached input tokens, 491 output tokens, estimated Luna worker-boundary cost `0.253652`, and same-token Sol cost `6.3413`: 96% estimated worker-boundary savings at the configured 25:1 rate. These forced timeout runs are diagnostic overhead, not a quality or end-to-end speed benchmark.

The result indicates that broad Luna/max review tasks can remain productive beyond 90–180 seconds while still failing to synthesize their final structured response before the deadline. Prefer narrower scope and smaller acceptance bundles before increasing deadlines. The supervisor diagnoses liveness and bounds failure; it does not replace Sol-owned task decomposition.

## Alpha.2 reserved-finalization regression

The `0.5.0-alpha.1` baseline was a two-file, eight-command Luna/max analysis with a 120-second deadline. It failed as `hard_timeout_active`; the last event was `thread/tokenUsage/updated` with 0ms silence, so the worker was active but had not emitted structured output.

On `0.5.0-alpha.2`, a matched bounded two-file analysis completed directly in 70.411 seconds, before its 80-second work budget. It returned four path-backed evidence items and one concrete reliability risk with no verifier or supervisor model call. Usage was 29,077 input / 26,368 cached / 1,934 output tokens; estimated Luna cost was `0.084749`, same-token Sol cost was `2.118725`, and estimated worker-boundary savings were 96%.

A forced-finalization variant used a 90-second total deadline, 40-second work budget, and 50-second reserved window. App-server accepted the in-turn steer and the same Luna/max turn returned an honest structured `partial` result in 87.991 seconds instead of timing out. It met all three requested evidence/risk criteria, used 30,149 input / 27,392 cached / 767 output tokens, cost an estimated `0.050491` versus `1.262275` at same-token Sol rates, and again showed 96% worker-boundary savings. Earlier experimental interrupt-and-new-turn variants failed at the same 90-second deadline, which is why alpha.2 uses in-turn steering for active work and reserves a new turn only for invalid JSON recovery.

## 0.5.1 operations-leader experiment

A cold forced-Leader run reduced the Sol-visible JSON payload from the alpha.2 baseline's 3,547 characters to 2,553 (28.0%), preserved four decisive evidence items and one risk, and added no escalation. Cold Luna cost rose from `0.050041` to `0.138475`, while wall time rose from 106.782s to 118.916s, so unconditional Leader use failed the cost gate.

A matched persistent-process experiment then ran Leader warmup → Leader measured on `core` and direct warmup → direct measured on `integration`, with warmups excluded. The measured Leader result contained the same four evidence / one risk / zero escalation shape and reduced payload from 3,375 to 2,412 characters (28.5%). It cost `0.081124` versus `0.044911` and took 36.968s versus 14.127s. This confirms useful controller-context compression but also confirms that a Leader turn is not economical for a small result.

Version 0.5.1 therefore ships adaptive reporting rather than unconditional reporting. Small low-risk tasks take the alpha.2 direct path and append a bounded digest to the Leader backlog. Large outputs, verifier use, high risk, reserved boundaries, or actual Sol escalations wake the Leader. The threshold is configurable and the forced mode remains available for reproducible benchmarks. Claims here concern MCP payload size and worker-boundary price estimates; exact Sol tool-result tokenization is not exposed by the current harness.

## 0.5.2 visible-progress regression

The live harness now supplies an MCP progress token and passively records `notifications/progress` from the same blocking `run_task` request. It does not poll Heliolune, create a second controller turn, or copy worker transcript content into progress messages.

The low-risk direct run completed in 74.622 seconds and emitted nine strictly increasing updates from 2 to 100. The updates exposed routing, Luna/max activity, elapsed time, event count, cache rate, last app-server event class, owner completion, and terminal handoff. Usage was 31,830 input / 28,416 cached / 1,808 output tokens. Estimated Luna boundary cost was `0.085518`, versus `2.137950` for the same tokens at Sol rates: 96.0% estimated savings.

The forced-Leader run completed in 122.338 seconds and emitted 15 strictly increasing updates. It additionally exposed the reserved-finalization boundary, accepted in-turn steering, an honest `partial` owner result, Leader/high compression, and compact handoff readiness. Aggregate owner-plus-Leader usage was 51,763 input / 33,536 cached / 959 output tokens, estimated at `0.136673` for Luna versus `3.416825` at same-token Sol rates. This run confirms visibility through the slow path; its extra wall time and lower aggregate cache rate reinforce the 0.5.1 decision to keep Leader reporting adaptive.

Unit coverage also verifies silent operation without a progress token, strict monotonicity, rate limiting, non-finite-value rejection, and transcript-free message construction.

Codex CLI 0.146.0 does not attach a progress token to model-initiated MCP calls or advertise the MCP Apps capability. The installed-plugin host smoke therefore exercised the 0.5.2 fallback path: `start_task` returned immediately, a separate `luna-await` server blocked without consuming Sol turns, and a Windows-native status window rendered in Simplified Chinese. The window showed all five fixed lanes (`core`, `tests`, `integration`, `verifier`, and `supervisor`) while the main MCP server remained responsive to status reads.

The final integration-lane regression completed worker execution in 27.558 seconds (29.244 seconds host wall time). It used 14,886 input / 13,056 cached / 634 output tokens, including 444 reasoning tokens, for an 87.71% input-cache rate. Estimated Luna cost was `0.034698`; the visible historical-profile projection was Sol-only `0.142357`, with projected savings `0.107659` (75.6261%). The active worker supplied a bounded natural-language status in Chinese explaining the token gate, finite-value validation, throttling, 0–100 bounds, monotonicity, and terminal close. The regression additionally requires exactly five worker records, a terminal active-worker state, a Chinese Luna-authored explanation when the UI locale is Chinese, and a non-empty `alpha-0.5.0-matched` cost projection.

## 0.6 parallel profiles

Eight identical, independent read-only audits were run on fresh Luna/max threads at concurrency 1, 4, and 8. Each arm also paid for one fresh Luna/high Leader aggregation. To compare cost without relying on Luna cache hits, `cacheIgnoredColdEquivalent` prices every input token at the uncached Luna rate.

| Concurrency | Samples | Wall time | Speedup vs 1 | Quality | Cold-equivalent cost |
|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 200.769s | 1.00x | 100% | 0.890920 |
| 4 | 2 | mean 52.846s | 3.80x | 90–95% | mean 0.816648 |
| 8 | 2 | 36.488–73.225s | 3.66x mean | 95% | mean 0.821255 |

Four-way execution was stable and its cold-equivalent cost was comparable to serial. This evidence originally supported a conditional 0.6.0 route; 0.6.1 makes it the product default and uses meaningful read-only companion streams for narrow work. Eight-way remains opt-in because one run was the fastest overall while another suffered a large straggler. Three end-to-end four-way read-only MCP smokes completed in 44.137s, 49.607s, and 43.843s, including shared Leader aggregation; the final reduced-schema smoke completed all workstreams at an estimated Luna cost of 0.225093. Workstreams should target 90 seconds, but may use bounded deadlines up to 600 seconds; one shared Leader session manages workers still active at their checkpoint.

A separate real-write smoke used two Luna/max workers in detached Git worktrees. Heliolune applied disjoint changes to `alpha.txt` and `beta.txt`, left the main index unstaged, removed every temporary worktree, and completed in 35.541s at an estimated Luna cost of 0.116710. Unit tests cover dirty-main, changed-`HEAD`, scope-escape, and retained-patch failure paths. See [the full 0.6 engineering report](0.6-RESEARCH.md) and its raw JSON artifacts.
