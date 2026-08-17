---
name: helioterm
description: Run Heliolune's independently usable, fast zero-model terminal for bounded test, build, read-only git, search, benchmark, or process observations; batch real-project checks, with a configured model-backed fallback only when explicitly requested.
---

# HelioTerm

HelioTerm is independently invocable, included by default, and uses no MCP and no child model in ordinary mode. Invoke once:

`node plugins/heliolune/components/helioterm/direct-runner.mjs --cwd <project> --request "T|operation|argument"`

Combine compatible tests. For up to four different observations, repeat `--request` in that call. Each line is at most 64 bytes. Require one compact result ending `model=0`.

Skip preflight in ordinary mode; the runner validates the full batch before execution. Observe only—never edit, delegate, plan, review, or judge.

For an explicit model-backed request only: run preflight, spawn `terminal.agentType` once with `fork_turns="none"`, and reuse it for at most eight same-parent requests. The default fallback is Luna/high; Spark is not active. Inspect proof. Change the binding with `node plugins/heliolune/scripts/configure-models.mjs --terminal-model <id> --terminal-effort <effort> --write`, then start a new task.
