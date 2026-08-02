# Security policy

English · [简体中文](SECURITY.zh-CN.md)

## Supported versions

Heliolune is pre-1.0. Only the latest alpha release receives security fixes.

## Reporting a vulnerability

Do not open a public issue containing credentials, private repository content, model transcripts, or a working exploit. Contact the maintainer privately and include the affected version, impact, minimal reproduction, and any suggested mitigation.

## Trust boundary

The current adapter launches the locally installed Codex CLI and grants workers the task scope allowed by the host. Heliolune does not provide a stronger filesystem or process sandbox than that host. Review scopes and approval policies before delegating work in sensitive repositories.

After installation, the bundled local MCP defaults its tools to `approve` so a blocking worker call does not stall on a second host prompt. This does not bypass Codex filesystem or network sandboxing, and users may override the plugin MCP approval mode in Codex configuration.

The shared operations leader receives liveness metadata, token usage, timing, compact task objectives, and structured worker/verifier results; it is instructed not to inspect repository contents, plan, assign, decide reserved boundaries, or perform final acceptance. Live-status surfaces may show a bounded Codex reasoning summary emitted by Luna through `item/reasoning/summaryTextDelta`; they never show raw reasoning content, command output, tool results, or a worker transcript. A summary may mention repository paths or the current bounded activity, so treat the native window as local repository information.

The local registry stores repository paths, session identifiers, bounded lifecycle digests, counters, and raw token usage. Start/await jobs additionally store bounded status snapshots and the compact terminal bundle under `%LOCALAPPDATA%\OpenAI\Codex\luna-pool-orchestrator\jobs`; rendered-window markers are removed on normal close, and diagnostic logs are written only when the native UI fails before rendering. Files are not uploaded. `cost_dashboard` is a local stdio MCP tool and may reveal paths and usage totals to the calling controller.
