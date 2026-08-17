# Native owner protocols

Use repository-relative `/` paths. Keep contracts below 1,500 tokens and results compact.

## `HELIOLUNE_OWNER_CONTRACT_V1`

Required fields:

- `route`: `R1` for one model-bound owner without HelioTerm, or `R2` for one owner with one persistent HelioTerm.
- `objective`, `acceptance`, `scope`, `reserved`, and `risk`: the bounded outcome and Sol-retained decisions.
- `contractId`: stable 8–64 character lowercase identifier reused by bounded followups.
- `context`: `HELIOLUNE_CONTEXT_PACK_V1` with 1–12 exact in-scope `readFirst` paths, 1–24 targeted `anchors`, and 0–12 `constraints`. This pack replaces open-ended discovery.
- `preflight`: passing compact `HELIOLUNE_NATIVE_PREFLIGHT_V1` evidence.
- `ownerPolicy`: exactly `{"persistent":true,"maxTurns":3,"maxToolCalls":36,"maxEditCalls":6}`.
- `terminalPolicy`: `forbidden` on R1. On R2 it is exactly `{"persistent":true,"maxRequests":8,"maxCommandsPerRequest":4,"maxRequestBytes":64,"maxResponseBytes":256}`.
- `verification.owner`: 1–8 focused commands run by the owner.
- `verification.sol`: 1–8 distinct broader commands reserved for Sol.

## `HELIOLUNE_OWNER_RESULT_V1`

```json
{
  "schemaVersion": "HELIOLUNE_OWNER_RESULT_V1",
  "status": "completed",
  "ownerTurn": 1,
  "ownerSessionComplete": true,
  "changedPaths": ["path/to/file"],
  "checks": [{"command":"node --test tests/example.test.mjs","status":"passed","summary":"3/3"}],
  "residualRisks": [],
  "objection": null,
  "evidence": ["focused checks passed"],
  "terminalUsed": true,
  "terminalAgentPath": "/root/owner/helioterm",
  "terminalEvidence": [{"request":"T|test|tests/example.test.mjs","response":"OK|calls=1|3/3 passed","commands":1,"verified":true}],
  "protocolViolations": []
}
```

`status` is `completed`, `blocked`, or `objection`. An objection contains `decision`, `evidence`, `issue`, `options`, `recommendation`, and `blocking`.

## `HELIOLUNE_OWNER_FOLLOWUP_V1`

Use followups only on the same owner session and contract. Set `ownerTurn` to 2 or 3, `kind` to `repair` or `evidence`, and list only failed commands already present in `verification.owner`. Include 1–12 observed evidence strings. New paths, checks, objectives, scope, reserved decisions, branches, or open-ended exploration require a fresh owner contract.

The owner must not rerun preflight or run `verification.sol`. Its check command set must exactly match `verification.owner`. On R2 it must reuse one HelioTerm child, preserve the canonical agent path, and verify every observation. Persisted proof joins `terminalEvidence` to Desktop function-call turns because collaboration request bodies may be encrypted.

The alpha compatibility reader still accepts legacy `sparkPolicy`, `sparkUsed`, `sparkAgentPath`, and `sparkEvidence` fields. New contracts and results must use the neutral terminal names; supplying both naming sets with different values is invalid.

Sol acceptance additionally requires independently collected actual paths, passed Sol checks, no residual risk, no objection, no protocol violations, exact configured role/model/effort proof, Native V2 metadata, and route-correct HelioTerm evidence.
