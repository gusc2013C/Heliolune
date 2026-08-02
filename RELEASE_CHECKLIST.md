# Release checklist

- [ ] Confirm the semantic version in the plugin manifest and runtime constants.
- [ ] Review public API, trust-boundary, and migration changes.
- [ ] Run `pwsh -File .\scripts\validate-release.ps1`.
- [ ] Run validation under both Windows PowerShell 5.1 and PowerShell 7.
- [ ] Confirm `.agents/plugins/marketplace.json` and the plugin manifest are not ignored.
- [ ] Run cold initialization, same-lane warm reuse, timeout, and verifier smoke tests.
- [ ] Exercise recent-activity, sustained-silence, supervisor-race, and hard-timeout watchdog paths.
- [ ] Confirm the default price table and run pricing/dashboard regression tests.
- [ ] Run a matched Sol-only versus controller/worker benchmark when routing behavior changes.
- [ ] Record exact tokens, cache rate, wall time, quality criteria, and estimated-price assumptions.
- [ ] Ensure `git status --short` is empty.
- [ ] Create an annotated tag such as `v0.5.0-alpha.1`.
- [ ] Run `pwsh -File .\scripts\package-release.ps1`.
- [ ] Verify the generated ZIP checksum before uploading both files.
- [ ] Test installation from the release artifact in a new Codex task.
- [ ] Confirm `cost_dashboard` reports the expected repository and does not count reasoning output twice.
