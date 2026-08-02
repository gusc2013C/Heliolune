# Release checklist

English · [简体中文](RELEASE_CHECKLIST.zh-CN.md)

- [ ] Confirm the semantic version in the plugin manifest and runtime constants.
- [ ] Review public API, trust-boundary, and migration changes.
- [ ] Run `pwsh -File .\scripts\validate-release.ps1`.
- [ ] Run validation under both Windows PowerShell 5.1 and PowerShell 7.
- [ ] Confirm `.agents/plugins/marketplace.json` and the plugin manifest are not ignored.
- [ ] Run cold initialization, same-lane warm reuse, timeout, and verifier smoke tests.
- [ ] Exercise recent-activity, sustained-silence, supervisor-race, and hard-timeout watchdog paths.
- [ ] Exercise active-timeout and invalid-JSON finalization recovery; confirm synthesis does not extend the hard deadline.
- [ ] Exercise progress-token present/absent, monotonic/rate-limited updates, live activity, finalization, verification, Leader compression, and terminal status.
- [ ] Exercise `start_task` plus the independent `luna-await.await_task`; confirm Sol does not poll or generate while Luna is running.
- [ ] Confirm the status surface lists all five lanes, reaches a terminal active-worker state, and shows a bounded Luna-authored natural-language explanation without raw reasoning or transcripts.
- [ ] Verify MCP Apps capability detection suppresses the native fallback; verify Windows fallback rendering and its ready handshake when that capability is absent.
- [ ] Run the native-window probes under Windows PowerShell 5.1 and PowerShell 7, including a sanitized environment without `windir`.
- [ ] Verify English/简体中文 links and translated release documentation.
- [ ] Confirm the default price table and run pricing/dashboard regression tests.
- [ ] Confirm visible savings use the versioned matched-benchmark profile rather than same-token repricing, and label the projection as directional.
- [ ] Run a matched Sol-only versus controller/worker benchmark when routing behavior changes.
- [ ] Record exact tokens, cache rate, wall time, quality criteria, and estimated-price assumptions.
- [ ] Ensure `git status --short` is empty.
- [ ] Create an annotated tag for the exact manifest version.
- [ ] Run `pwsh -File .\scripts\package-release.ps1`.
- [ ] Verify the generated ZIP checksum before uploading both files.
- [ ] Test installation from the release artifact in a new Codex task.
- [ ] Confirm `cost_dashboard` reports the expected repository and does not count reasoning output twice.
