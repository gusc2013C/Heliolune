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

1. Keep trivial work and pure version/release-note propagation in Sol. Use Heliolune for bounded cross-file engineering where ownership separation and cached implementation context are useful.
2. Use `HELIOLUNE_OWNER_CONTRACT_V2` for all new owner work. Create one objective, observable acceptance, narrow scope, reserved decisions, compact preflight evidence, one `HELIOLUNE_CONTEXT_PACK_V1`, and one explicitly supplied task-shaped `resourceLease`. V1 is read-only historical compatibility for persisted contracts and rollout audits; never dispatch a new owner with V1. See [protocols.md](references/protocols.md).
3. For V2 contracts, use 1 to 4 exact `readFirst` files and 1 to 24 targeted anchors without inheriting V1's fixed call/read/edit/output caps. Use `context.anchors` in one targeted `rg` call across all `readFirst` paths first. Use bounded slices instead of full-file reads. Follow only the explicit `resourceLease` and record call/edit counts diagnostically. Do not pass an implementation plan.
4. Add the exact persistent `ownerPolicy`, validate the contract, then spawn exactly one `heliolune_engineering_owner`. Retain its canonical path and keep it as the only writer.
5. Reuse that owner with `followup_task` for at most three turns total: initial implementation, failed focused-check repair, then evidence recovery. Validate each `HELIOLUNE_OWNER_FOLLOWUP_V1`. Reuse only while contractId, objective, scope, reserved decisions, branch, and worktree stay unchanged; otherwise start a fresh owner.
6. Choose R1 by default. Choose R2 only when a model-backed terminal is explicitly requested. R2 uses one reusable Luna/high `heliolune_helioterm`; Spark is not an active binding. Allow at most 8 requests, 4 calls/request, 64 request bytes, and 256 response bytes. HelioTerm remains an observation leaf.
7. Put focused commands in `verification.owner` and broader acceptance in `verification.sol`. The owner runs only its list and never reruns preflight. Sol batches distinct acceptance checks, never reruns `verification.owner`, and prefers compact HelioTerm evidence over duplicated command output.
8. Require exactly one `HELIOLUNE_OWNER_RESULT_V2` JSON object with neutral `terminalUsed`, `terminalAgentPath`, and `terminalEvidence` fields plus independent `qualityAcceptance` and `resourceCompliance` reports. Historical V1 results remain gate-readable but are not active-owner output. Root independently inspects actual paths and runs all Sol checks.
9. Run the acceptance gate with independent path and Sol-check JSON. Put temporary artifacts in the task's writable visualization root or system temp, never in the repository.
10. Locate the owner rollout by canonical path + `heliolune_engineering_owner`; locate R2 HelioTerm by canonical path + role + owner parent UUID. For historical V1 rollouts, inspect the owner with `--expect-max-tool-calls 36`, `--expect-max-tool-output-bytes 24576`, and `--expect-max-total-tool-output-bytes 196608`; for V2, inspect the persisted `toolCallCount` as diagnostic evidence alongside the task-shaped lease, never as a token or cost proxy. Inspect R2 HelioTerm dynamically. Require Native V2, exact parent/leaf state, evidence counts, and budgets.
11. Accept only when deterministic gates pass and Sol's quality review agrees.

V2 resource compliance is a post-call observation because Codex Desktop exposes no
pre-call interception path. Report `qualityAcceptance` and `resourceCompliance`
independently so a quality result is not mistaken for a resource result.

## Compact V2 contract

```json
{
  "schemaVersion": "HELIOLUNE_OWNER_CONTRACT_V2",
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
  "ownerPolicy": {"persistent":true,"maxTurns":3},
  "resourceLease": {
    "schemaVersion": "HELIOLUNE_RESOURCE_LEASE_V2",
    "taskComplexity": "medium",
    "dimensions": {"inputTokens":250000,"outputTokens":40000}
  },
  "terminalPolicy": "forbidden",
  "verification": {
    "owner": ["node --test tests/focused.test.mjs"],
    "sol": ["node --test tests/*.test.mjs"]
  }
}
```

Choose lease dimensions from task evidence rather than copying the example values. Keep the serialized contract below 1,500 tokens. Historical V1 shape and limits remain documented only in [protocols.md](references/protocols.md).
