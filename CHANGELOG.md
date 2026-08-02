# Changelog

All notable changes to Heliolune are documented here. The project follows Semantic Versioning.

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
