# Contributing

English · [简体中文](CONTRIBUTING.zh-CN.md)

Heliolune is currently alpha software. Keep changes small, evidence-backed, and compatible with the controller/worker trust boundary.

1. Create a branch from `main`.
2. Do not bundle model-host executables, credentials, logs, worker transcripts, or benchmark workspaces.
3. Preserve the stable worker-role prefix when possible; send volatile task state incrementally.
4. Add or update acceptance evidence for routing, timeout, cache reuse, verification, or token-accounting changes.
5. Run `pwsh -File .\scripts\validate-release.ps1` before opening a pull request.

Architecture, security boundaries, public API changes, and irreversible migrations require explicit maintainer review.
