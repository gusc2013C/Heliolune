---
name: heliolune
description: Route bounded cross-file engineering through Codex Native V2 using one reusable Luna owner, zero-model HelioTerm I/O by default, bounded repair followups, structured evidence, and independent Sol acceptance. Use when implementation and tests benefit from cached owner context without unbounded conversation growth.
---

# Heliolune Native

Heliolune includes the independently usable `$helioterm` component by default. Do not use the 0.7 MCP pool on this path.

## Preflight and model binding

Desktop 0.147 discovers custom agents as standalone TOML profiles in a project or global `agents` directory; the legacy `[agents.<name>] config_file` registry is compatibility metadata and is not sufficient discovery. Install the bundled profiles into an explicit target with `node plugins/heliolune/scripts/install-agents.mjs --target .codex/agents` for this project, or have Sol choose an explicit global agents directory. The installer updates only named Heliolune profiles, rejects unrelated filename collisions, and does not delete other profiles.

Run `node plugins/heliolune/scripts/preflight.mjs --agents-dir <installed-agents-directory> --compact` once. Require a pass and use the returned bindings. Spawn `heliolune_engineering_owner` and, only for explicit R2 fallback, `heliolune_helioterm`, with `fork_turns="none"` and no override. Active model-backed roles default to Luna; ordinary HelioTerm stays zero-model direct.

Change a binding with `node plugins/heliolune/scripts/configure-models.mjs --owner-model <id> --owner-effort <effort> --terminal-model <id> --terminal-effort <effort> --write`, rerun the standalone installer for every selected agents directory, refresh/reinstall the plugin, and start a new Codex task. Desktop does not retroactively reload a running task. Written configuration, installer output, and preflight are not runtime model proof; persisted rollout metadata must still match the binding.

## Native Owner route

1. Keep trivial work in Sol. Use Heliolune for bounded cross-file engineering where ownership separation is useful.
2. Create `HELIOLUNE_OWNER_CONTRACT_V1` with one objective, observable acceptance, narrow scope, reserved decisions, compact preflight evidence, and one `HELIOLUNE_CONTEXT_PACK_V1`. See [protocols.md](references/protocols.md).
3. The context pack may name 1 to 12 exact `readFirst` files and 1 to 24 anchors. Supply enough context for a first pass in at most five repository calls; do not pass an implementation plan.
4. Add the exact persistent `ownerPolicy`, validate the contract, then spawn exactly one `heliolune_engineering_owner`. Retain its canonical path and keep it as the only writer.
5. Reuse that owner with `followup_task` for at most three turns total: initial implementation, failed focused-check repair, then evidence recovery. Validate each `HELIOLUNE_OWNER_FOLLOWUP_V1`. Reuse only while contractId, objective, scope, reserved decisions, branch, and worktree stay unchanged; otherwise start a fresh owner.
6. Choose R1 by default. Choose R2 only when a model-backed terminal is explicitly requested. R2 uses one reusable Luna/high `heliolune_helioterm`; Spark is not an active binding. Allow at most 8 requests, 4 calls/request, 64 request bytes, and 256 response bytes. HelioTerm remains an observation leaf.
7. Put focused commands in `verification.owner` and broader acceptance in `verification.sol`. The owner runs only its list and never reruns preflight.
8. Require exactly one `HELIOLUNE_OWNER_RESULT_V1` JSON object with neutral `terminalUsed`, `terminalAgentPath`, and `terminalEvidence` fields. Root independently inspects actual paths and runs all Sol checks.
9. Run the acceptance gate with independent path and Sol-check JSON. Put temporary artifacts in the task's writable visualization root or system temp, never in the repository.
10. Locate the owner rollout by canonical path + `heliolune_engineering_owner`; locate R2 HelioTerm by canonical path + role + owner parent UUID. Inspect the owner with `--expect-max-tool-calls 36` and the configured binding. Inspect R2 HelioTerm dynamically. Require Native V2, exact parent/leaf state, evidence counts, and budgets.
11. Accept only when deterministic gates pass and Sol's quality review agrees.

## Compact contract

```json
{
  "schemaVersion": "HELIOLUNE_OWNER_CONTRACT_V1",
  "contractId": "task-unique-id",
  "route": "R2",
  "objective": "<one outcome>",
  "acceptance": ["<observable condition>"],
  "scope": ["path/to/file"],
  "context": {
    "schemaVersion": "HELIOLUNE_CONTEXT_PACK_V1",
    "readFirst": ["path/to/file"],
    "anchors": ["symbol-or-test-name"],
    "constraints": ["preserve public API"]
  },
  "reserved": ["<decision retained by Sol>"],
  "risk": "low",
  "preflight": {"schemaVersion":"HELIOLUNE_NATIVE_PREFLIGHT_V1","pass":true,"version":"<version>"},
  "ownerPolicy": {"persistent":true,"maxTurns":3,"maxToolCalls":36,"maxEditCalls":6},
  "terminalPolicy": {"persistent":true,"maxRequests":8,"maxCommandsPerRequest":4,"maxRequestBytes":64,"maxResponseBytes":256},
  "verification": {
    "owner": ["node --test tests/focused.test.mjs"],
    "sol": ["node --test tests/*.test.mjs"]
  }
}
```

Keep the serialized contract below 1,500 tokens.
