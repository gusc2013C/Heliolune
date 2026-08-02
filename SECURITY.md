# Security policy

## Supported versions

Heliolune is pre-1.0. Only the latest alpha release receives security fixes.

## Reporting a vulnerability

Do not open a public issue containing credentials, private repository content, model transcripts, or a working exploit. Contact the maintainer privately and include the affected version, impact, minimal reproduction, and any suggested mitigation.

## Trust boundary

The current adapter launches the locally installed Codex CLI and grants workers the task scope allowed by the host. Heliolune does not provide a stronger filesystem or process sandbox than that host. Review scopes and approval policies before delegating work in sensitive repositories.

The shared supervisor receives liveness metadata, token usage, timing, and the compact task objective; it is instructed not to inspect repository contents or decide correctness. The local registry stores repository paths, session identifiers, counters, and raw token usage, but not worker transcripts. `cost_dashboard` is a local stdio MCP tool and may reveal those paths and usage totals to the calling controller.
