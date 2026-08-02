# Benchmark methodology

Heliolune optimizes for controller-model cost without surrendering acceptance quality. A valid comparison therefore measures quality, paid-token estimates, cache behavior, and wall time together.

## Rules

- Use the same repository state, task, scope, acceptance criteria, and response schema for every arm.
- Match warmup conditions and report warmups separately as measurement overhead.
- Keep controller acceptance in the current warm session; do not create a cold controller solely to judge worker output.
- Report input, cached input, output, reasoning output, cache rate, and planning/execution/acceptance wall time.
- Treat price-weighted token calculations as estimates unless billed credits are available.

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

Dashboard savings use a same-token counterfactual by default. A release benchmark must still run matched arms when claiming end-to-end quality, speed, or savings.

## Live supervisor regression

The installed `0.5.0-alpha.1` plugin was exercised with a six-file read-only Luna/max review, a 90-second hard deadline, a forced supervisor checkpoint at 30 seconds, and Luna/high supervision. The supervisor returned `continue` with high confidence. At the hard deadline the owner had emitted 81 activity events, the latest was `thread/tokenUsage/updated`, and silence was only 1ms, so Heliolune correctly classified the failure as `hard_timeout_active` rather than a stalled session.

Across two forced-timeout live regressions, the cumulative dashboard reported 101,698 input tokens, 59,904 cached input tokens, 491 output tokens, estimated Luna worker-boundary cost `0.253652`, and same-token Sol cost `6.3413`: 96% estimated worker-boundary savings at the configured 25:1 rate. These forced timeout runs are diagnostic overhead, not a quality or end-to-end speed benchmark.

The result indicates that broad Luna/max review tasks can remain productive beyond 90–180 seconds while still failing to synthesize their final structured response before the deadline. Prefer narrower scope and smaller acceptance bundles before increasing deadlines. The supervisor diagnoses liveness and bounds failure; it does not replace Sol-owned task decomposition.
