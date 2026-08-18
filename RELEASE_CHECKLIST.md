# Release checklist

English · [简体中文](RELEASE_CHECKLIST.zh-CN.md)

- [ ] Confirm the Native V2 `heliolune` manifest is the current release identity at `0.8.0-alpha.4` with build `0.8.0-alpha.4+codex.20260818140328`.
- [ ] Confirm the legacy `luna-pool-orchestrator` marketplace entry and runtime remain `0.7.0-alpha.2`.
- [ ] Confirm both marketplace entries, all required Native V2 files, the historical alpha.3 documents, and the bilingual alpha.4 token-efficiency note plus benchmark JSON are present.
- [ ] Confirm the Heliolune 1..4 `readFirst`/anchor-first gate uses one targeted anchor query followed by bounded slices.
- [ ] Confirm ordinary HelioTerm failures use `model=0`/`semanticScore=0`, while explicit semantic requests and real test diagnostics retain `semanticScore=3`.
- [ ] Confirm the token-efficiency JSON is aggregate diagnostic evidence, explicitly not billing tokens, and contains no private or raw execution content.
- [ ] Confirm the semantic version in the plugin manifest and runtime constants.
- [ ] Review public API, trust-boundary, and migration changes.
- [ ] Run `pwsh -File .\scripts\validate-release.ps1`.
- [ ] Run validation under both Windows PowerShell 5.1 and PowerShell 7.
- [ ] Confirm `.agents/plugins/marketplace.json` and the plugin manifest are not ignored.
- [ ] Run cold initialization, same-lane warm reuse, renewable liveness, and verifier smoke tests.
- [ ] Exercise recent-activity renewal, repeated sustained-silence checks, high-confidence interruption, supervisor race, and Leader-unavailable continuation.
- [ ] Confirm active work is never time-steered; exercise completed-invalid-JSON schema recovery without repository exploration.
- [ ] Exercise progress-token present/absent, monotonic/rate-limited updates, live activity, liveness checks, verification, Leader compression, and terminal status.
- [ ] Exercise `start_task` plus the independent no-deadline `luna-await.await_task`; confirm Sol does not poll or generate while Luna is running.
- [ ] Exercise `start_batch` with 4-way, queued work stealing, and explicit 8-way read-only workstreams; record stragglers and shared-Leader time.
- [ ] Exercise a mutating batch in detached Git worktrees; confirm disjoint patches apply unstaged and dirty-main, changed-`HEAD`, partial-worker, overlap, and scope-escape paths block atomically.
- [ ] Confirm the native status surface lists persistent and dynamic burst lanes, reaches a terminal active-worker state, and shows a bounded Luna-authored natural-language explanation without raw reasoning or transcripts.
- [ ] Confirm no inline MCP App resource or `job_status` tool is exposed; verify the Windows native window and ready handshake.
- [ ] Run the native-window probes under Windows PowerShell 5.1 and PowerShell 7, including a sanitized environment without `windir`.
- [ ] Verify English/简体中文 links and translated release documentation.
- [ ] Review the English/简体中文 Heliolune versus Codex subagent comparison against current official Codex documentation.
- [ ] Confirm the default price table and run pricing/dashboard regression tests.
- [ ] Confirm visible savings use the versioned matched-benchmark profile rather than same-token repricing, and label the projection as directional.
- [ ] Run a matched Sol-only versus controller/worker benchmark when routing behavior changes.
- [ ] Record exact tokens, cache rate, wall time, quality criteria, and estimated-price assumptions.
- [ ] Run `node .\scripts\measure-tool-schema.mjs` and record schema size changes.
- [ ] Ensure `git status --short` is empty.
- [ ] Create an annotated tag for the exact manifest version.
- [ ] Run `pwsh -File .\scripts\package-release.ps1`.
- [ ] Verify the generated ZIP checksum before uploading both files.
- [ ] Test installation from the release artifact in a new Codex task.
- [ ] Confirm `cost_dashboard` reports the expected repository and does not count reasoning output twice.
