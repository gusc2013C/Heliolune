import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  CONTRACT_SCHEMA_V2,
  OWNER_SESSION_LIMITS,
  RESOURCE_LEASE_SCHEMA_V2,
  RESULT_SCHEMA_V2,
  acceptanceChecks,
  deriveResourceLease,
  qualityAcceptanceChecks,
  resourceComplianceChecks,
  validateContract,
  validateFollowup,
  validateResult,
} from '../plugins/heliolune/scripts/native-owner-gate.mjs';

const contract = {
  schemaVersion: 'HELIOLUNE_OWNER_CONTRACT_V1',
  contractId: 'owner-contract-001',
  route: 'R1',
  objective: 'Add and verify a bounded cross-file feature.',
  acceptance: ['focused tests pass', 'public API is unchanged'],
  scope: ['plugins/heliolune/scripts', 'tests/native-owner-protocol.test.mjs'],
  context: {
    schemaVersion: 'HELIOLUNE_CONTEXT_PACK_V1',
    readFirst: ['tests/native-owner-protocol.test.mjs'],
    anchors: ['validateContract', 'validateResult'],
    constraints: ['preserve public API'],
  },
  reserved: ['public API changes require Sol'],
  risk: 'medium',
  preflight: { schemaVersion: 'HELIOLUNE_NATIVE_PREFLIGHT_V1', pass: true, version: '0.8.0-alpha.4' },
  ownerPolicy: { ...OWNER_SESSION_LIMITS },
  terminalPolicy: 'forbidden',
  verification: {
    owner: ['node --test tests/native-owner-protocol.test.mjs'],
    sol: ['node --test tests/*.test.mjs'],
  },
};

const result = {
  schemaVersion: 'HELIOLUNE_OWNER_RESULT_V1',
  status: 'completed',
  ownerTurn: 1,
  ownerSessionComplete: true,
  changedPaths: ['plugins/heliolune/scripts/native-owner-gate.mjs', 'tests/native-owner-protocol.test.mjs'],
  checks: [{ command: 'node --test tests/native-owner-protocol.test.mjs', status: 'passed', summary: '4/4 passed' }],
  residualRisks: [],
  objection: null,
  evidence: ['focused tests passed'],
  terminalUsed: false,
  terminalAgentPath: null,
  terminalEvidence: [],
  protocolViolations: [],
};

const solChecks = [{ command: 'node --test tests/*.test.mjs', status: 'passed', summary: 'all passed' }];

const v2Contract = {
  ...structuredClone(contract),
  schemaVersion: CONTRACT_SCHEMA_V2,
  taskComplexity: 'medium',
  ownerPolicy: { persistent: true, maxTurns: 3 },
  resourceLease: {
    schemaVersion: RESOURCE_LEASE_SCHEMA_V2,
    taskComplexity: 'medium',
    taskShape: { scopeSize: 2, acceptanceSize: 2, risk: 'medium' },
    dimensions: { turns: 2, toolOutputBytes: 24576, totalTokens: 12000 },
  },
};

const v2Result = {
  ...structuredClone(result),
  schemaVersion: RESULT_SCHEMA_V2,
  qualityAcceptance: { status: 'passed', evidence: ['focused quality checks passed'] },
  resourceCompliance: {
    status: 'compliant',
    observed: { turns: 1, toolOutputBytes: 1200, totalTokens: 4000 },
    evidence: ['lease observations recorded after execution'],
  },
};

test('R1 owner contract and result validate', () => {
  assert.equal(validateContract(contract).every((entry) => entry.pass), true);
  assert.equal(validateResult(result).every((entry) => entry.pass), true);
});

test('context packs reserve one call for anchors and cap readFirst at four paths', () => {
  const fourPaths = structuredClone(contract);
  fourPaths.context.readFirst = [
    'plugins/heliolune/scripts/native-owner-gate.mjs',
    'plugins/heliolune/scripts/preflight.mjs',
    'plugins/heliolune/scripts/terminal-firewall.mjs',
    'tests/native-owner-protocol.test.mjs',
  ];
  assert.equal(validateContract(fourPaths).find((entry) => entry.name === 'context-read-first').pass, true);

  const fivePaths = structuredClone(fourPaths);
  fivePaths.context.readFirst.push('plugins/heliolune/scripts/install-agents.mjs');
  const check = validateContract(fivePaths).find((entry) => entry.name === 'context-read-first');
  assert.equal(check.pass, false);
  assert.equal(check.expected, '1..4 safe in-scope paths');
});

test('owner and terminal policies reject unbounded extra fields', () => {
  const extraOwnerField = structuredClone(contract);
  extraOwnerField.ownerPolicy.extra = true;
  assert.equal(validateContract(extraOwnerField).every((entry) => entry.pass), false);

  const extraTerminalField = structuredClone(contract);
  extraTerminalField.route = 'R2';
  extraTerminalField.terminalPolicy = {
    persistent: true,
    maxRequests: 8,
    maxCommandsPerRequest: 4,
    maxRequestBytes: 64,
    maxResponseBytes: 256,
    extra: true,
  };
  assert.equal(validateContract(extraTerminalField).every((entry) => entry.pass), false);
});

test('persistent Luna owner accepts only bounded same-contract repair followups', () => {
  const followup = {
    schemaVersion: 'HELIOLUNE_OWNER_FOLLOWUP_V1',
    contractId: contract.contractId,
    ownerTurn: 2,
    kind: 'repair',
    objective: 'Repair the focused protocol test without changing scope.',
    failedChecks: [...contract.verification.owner],
    evidence: ['the focused test failed after the first implementation turn'],
  };
  assert.equal(validateFollowup(followup, contract).every((entry) => entry.pass), true);
  const wrongContract = structuredClone(followup);
  wrongContract.contractId = 'another-contract';
  assert.equal(validateFollowup(wrongContract, contract).every((entry) => entry.pass), false);
  const fourthTurn = structuredClone(followup);
  fourthTurn.ownerTurn = 4;
  assert.equal(validateFollowup(fourthTurn, contract).every((entry) => entry.pass), false);
  const expandedCheck = structuredClone(followup);
  expandedCheck.failedChecks = ['node --test tests/*.test.mjs'];
  assert.equal(validateFollowup(expandedCheck, contract).every((entry) => entry.pass), false);
});

test('acceptance requires independently supplied matching in-scope paths', () => {
  const actual = [...result.changedPaths];
  assert.equal(acceptanceChecks(contract, result, actual, solChecks).every((entry) => entry.pass), true);
  assert.equal(acceptanceChecks(contract, result, undefined, solChecks).every((entry) => entry.pass), false);
  assert.equal(acceptanceChecks(contract, result, ['README.md'], solChecks).every((entry) => entry.pass), false);
});

test('R1 rejects HelioTerm use and failed checks', () => {
  const invalid = structuredClone(result);
  invalid.terminalUsed = true;
  invalid.checks[0].status = 'failed';
  assert.equal(validateResult(invalid).every((entry) => entry.pass), false);
  assert.equal(acceptanceChecks(contract, invalid, invalid.changedPaths, solChecks).every((entry) => entry.pass), false);
});

test('neutral and legacy terminal aliases must agree while legacy-only inputs remain valid', () => {
  const legacyContract = structuredClone(contract);
  delete legacyContract.terminalPolicy;
  legacyContract.sparkPolicy = 'forbidden';
  assert.equal(validateContract(legacyContract).every((entry) => entry.pass), true);

  const conflictingContract = structuredClone(contract);
  conflictingContract.sparkPolicy = 'unexpected';
  assert.equal(validateContract(conflictingContract).every((entry) => entry.pass), false);

  const legacyResult = structuredClone(result);
  delete legacyResult.terminalUsed;
  delete legacyResult.terminalAgentPath;
  delete legacyResult.terminalEvidence;
  legacyResult.sparkUsed = false;
  legacyResult.sparkAgentPath = null;
  legacyResult.sparkEvidence = [];
  assert.equal(validateResult(legacyResult).every((entry) => entry.pass), true);

  const conflictingResult = structuredClone(result);
  conflictingResult.sparkUsed = true;
  assert.equal(validateResult(conflictingResult).find((entry) => entry.name === 'terminal-used-alias').pass, false);

  const conflictingAgentPath = structuredClone(result);
  conflictingAgentPath.sparkAgentPath = '/root/owner/helioterm';
  assert.equal(validateResult(conflictingAgentPath).find((entry) => entry.name === 'terminal-agent-path-alias').pass, false);

  const conflictingEvidence = structuredClone(result);
  conflictingEvidence.sparkEvidence = [{ request: 'T|test|x', response: 'OK|calls=1|pass', commands: 1, verified: true }];
  assert.equal(validateResult(conflictingEvidence).find((entry) => entry.name === 'terminal-evidence-alias').pass, false);
});

test('CLI fails closed when reported and actual paths differ', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-owner-gate-'));
  try {
    const contractPath = resolve(directory, 'contract.json');
    const resultPath = resolve(directory, 'result.json');
    const pathsPath = resolve(directory, 'paths.json');
    const solChecksPath = resolve(directory, 'sol-checks.json');
    writeFileSync(contractPath, JSON.stringify(contract));
    writeFileSync(resultPath, JSON.stringify(result));
    writeFileSync(pathsPath, JSON.stringify(['plugins/heliolune/scripts/other.mjs']));
    writeFileSync(solChecksPath, JSON.stringify(solChecks));
    const cli = resolve('plugins/heliolune/scripts/native-owner-gate.mjs');
    const run = spawnSync(process.execPath, [cli, '--contract', contractPath, '--result', resultPath, '--actual-paths', pathsPath, '--sol-checks', solChecksPath, '--accept'], { encoding: 'utf8' });
    assert.equal(run.status, 1, run.stderr || run.stdout);
    const payload = JSON.parse(run.stdout);
    assert.equal(payload.pass, false);
    assert.equal(payload.checks.find((entry) => entry.name === 'reported-paths-match-actual').pass, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('compact release validation and Sol acceptance boundaries are explicit', async () => {
  const { readFileSync } = await import('node:fs');
  const validation = readFileSync(new URL('../scripts/validate-release.ps1', import.meta.url), 'utf8');
  const packaging = readFileSync(new URL('../scripts/package-release.ps1', import.meta.url), 'utf8');
  const attributes = readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8');
  const skill = readFileSync(new URL('../plugins/heliolune/skills/heliolune/SKILL.md', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../plugins/heliolune/.codex-plugin/plugin.json', import.meta.url), 'utf8'));
  const audit = JSON.parse(readFileSync(new URL('../benchmarks/results/0.8.0-stable-token-efficiency.json', import.meta.url), 'utf8'));

  assert.match(validation, /\[switch\]\$Compact/);
  assert.match(validation, /& \$PSCommandPath/);
  assert.match(validation, /Get-Content .* -Tail 40/);
  assert.match(validation, /GetTempPath/);
  assert.match(validation, /Release validation passed \(compact\)/i);
  assert.match(validation, /Release validation failed \(compact\)/i);
  assert.match(packaging, /validate-release\.ps1'\)\s+-Compact/);
  assert.match(packaging, /\$LASTEXITCODE -ne 0/);
  assert.match(packaging, /bootstrap-install\.mjs/);
  assert.match(packaging, /--skip-codex --write --compact/);
  assert.doesNotMatch(attributes, /^(?:CONTRIBUTING|RELEASE_CHECKLIST)(?:\.zh-CN)?\.md\s+export-ignore$/mu);
  assert.match(skill, /batches distinct acceptance checks/i);
  assert.match(skill, /never reruns `verification\.owner`/i);
  assert.match(skill, /compact HelioTerm evidence/i);
  assert.match(skill, /pure version\/release-note propagation in Sol/i);
  assert.match(manifest.version, /^0\.8\.5\+codex\.[A-Za-z0-9.-]+$/u);
  assert.equal(audit.schemaVersion, 'HELIOLUNE_STABLE_TOKEN_EFFICIENCY_AUDIT_V1');
  assert.equal(audit.validatorAb.reductionBytes, 18473);
  assert.equal(audit.helioterm.savedBytes, 652453);
  assert.equal(audit.acceptedOwnerProof.model, 'gpt-5.6-luna');
  assert.equal(audit.acceptedOwnerProof.effort, 'max');
});

test('bootstrap previews writes, rejects option typos, and installs profiles without requiring an isolated Codex home', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-bootstrap-'));
  const script = resolve('scripts/bootstrap-install.mjs');
  try {
    const preview = spawnSync(process.execPath, [script, '--project', directory, '--compact'], { encoding: 'utf8' });
    assert.equal(preview.status, 0, preview.stderr || preview.stdout);
    assert.equal(JSON.parse(preview.stdout).written, false);
    assert.equal(existsSync(resolve(directory, '.codex')), false);

    const typo = spawnSync(process.execPath, [script, '--project', directory, '--skip-codez', '--write', '--compact'], { encoding: 'utf8' });
    assert.notEqual(typo.status, 0);
    assert.equal(existsSync(resolve(directory, '.codex')), false);

    const written = spawnSync(process.execPath, [script, '--project', directory, '--skip-codex', '--write', '--compact'], { encoding: 'utf8' });
    assert.equal(written.status, 0, written.stderr || written.stdout);
    const payload = JSON.parse(written.stdout);
    assert.equal(payload.codexHome, null);
    assert.equal(existsSync(resolve(directory, '.codex', 'agents', 'luna-owner.toml')), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('acceptance rejects owner preflight/full-suite violations and missing Sol checks', () => {
  const invalid = structuredClone(result);
  invalid.checks.push({ command: 'node --test tests/*.test.mjs', status: 'passed', summary: 'all passed' });
  invalid.protocolViolations.push('reran Heliolune preflight');
  assert.equal(acceptanceChecks(contract, invalid, invalid.changedPaths, undefined).every((entry) => entry.pass), false);
});

test('R2 accepts verified bounded HelioTerm evidence', () => {
  const r2Contract = structuredClone(contract);
  r2Contract.route = 'R2';
  r2Contract.terminalPolicy = { persistent: true, maxRequests: 8, maxCommandsPerRequest: 4, maxRequestBytes: 64, maxResponseBytes: 256 };
  const r2Result = structuredClone(result);
  r2Result.terminalUsed = true;
  r2Result.terminalAgentPath = '/root/owner/helioterm';
  r2Result.terminalEvidence = [
    { request: 'T|test|tests/native*.test.mjs', response: 'OK|calls=1|18/18 passed', commands: 1, verified: true },
    { request: 'T|git|diff --check', response: 'OK|calls=1|diff clean', commands: 1, verified: true },
  ];
  assert.equal(validateContract(r2Contract).every((entry) => entry.pass), true);
  assert.equal(validateResult(r2Result, r2Contract).every((entry) => entry.pass), true);
  assert.equal(acceptanceChecks(r2Contract, r2Result, r2Result.changedPaths, solChecks).every((entry) => entry.pass), true);
});

test('R2 rejects unverified, verbose, or over-command HelioTerm evidence', () => {
  const r2Contract = structuredClone(contract);
  r2Contract.route = 'R2';
  r2Contract.terminalPolicy = { persistent: true, maxRequests: 8, maxCommandsPerRequest: 4, maxRequestBytes: 64, maxResponseBytes: 256 };
  const r2Result = structuredClone(result);
  r2Result.terminalUsed = true;
  r2Result.terminalAgentPath = '/root/owner/helioterm';
  r2Result.terminalEvidence = [{ request: 'T|test|x', response: 'OK|calls=5|pass', commands: 5, verified: false }];
  assert.equal(validateResult(r2Result, r2Contract).every((entry) => entry.pass), false);
  r2Result.terminalEvidence = [{ request: 'T|test|x', response: `OK|${'x'.repeat(256)}`, commands: 1, verified: true }];
  assert.equal(validateResult(r2Result, r2Contract).every((entry) => entry.pass), false);
});

test('V2 validates a task-shaped lease while retaining V1 historical limits', () => {
  assert.equal(validateContract(v2Contract).every((entry) => entry.pass), true);
  assert.equal(Object.hasOwn(v2Contract.ownerPolicy, 'maxToolCalls'), false);
  assert.equal(Object.hasOwn(v2Contract.ownerPolicy, 'maxEditCalls'), false);
  assert.equal(deriveResourceLease({ taskComplexity: 'low', scope: ['a'], acceptance: ['b'], risk: 'low' }), null);
  const low = deriveResourceLease({ taskComplexity: 'low', resourceDimensions: { toolOutputBytes: 1000 } });
  const high = deriveResourceLease({ taskComplexity: 'high', resourceDimensions: { totalTokens: 20000 } });
  assert.equal(low.schemaVersion, RESOURCE_LEASE_SCHEMA_V2);
  assert.equal(high.dimensions.totalTokens > low.dimensions.toolOutputBytes, true);
  const legacyBudget = structuredClone(v2Contract);
  legacyBudget.ownerPolicy.maxToolCalls = 36;
  assert.equal(validateContract(legacyBudget).every((entry) => entry.pass), false);
});

test('V2 reports quality acceptance independently from resource compliance', () => {
  assert.equal(validateResult(v2Result, v2Contract).every((entry) => entry.pass), true);
  assert.equal(qualityAcceptanceChecks(v2Contract, v2Result).every((entry) => entry.pass), true);
  assert.equal(resourceComplianceChecks(v2Contract, v2Result).every((entry) => entry.pass), true);
  const exceeded = structuredClone(v2Result);
  exceeded.resourceCompliance.status = 'exceeded';
  exceeded.resourceCompliance.observed.toolOutputBytes = 25000;
  const quality = qualityAcceptanceChecks(v2Contract, exceeded);
  const resources = resourceComplianceChecks(v2Contract, exceeded);
  assert.equal(quality.find((entry) => entry.name === 'quality-acceptance-status').pass, true);
  assert.equal(resources.find((entry) => entry.name === 'resource-compliance-status').pass, false);
  assert.equal(acceptanceChecks(v2Contract, exceeded, exceeded.changedPaths, solChecks).every((entry) => entry.pass), true);
});

test('V2 requires every declared resource dimension for compliance and preserves partial overruns', () => {
  const partial = structuredClone(v2Result);
  delete partial.resourceCompliance.observed.totalTokens;
  const partialChecks = resourceComplianceChecks(v2Contract, partial);
  assert.equal(partialChecks.find((entry) => entry.name === 'resource-compliance-within-lease').pass, false);

  partial.resourceCompliance.status = 'unmeasured';
  const unmeasuredChecks = resourceComplianceChecks(v2Contract, partial);
  assert.equal(unmeasuredChecks.find((entry) => entry.name === 'resource-compliance-within-lease').pass, true);

  const exceeded = structuredClone(v2Result);
  exceeded.resourceCompliance.status = 'exceeded';
  exceeded.resourceCompliance.observed.toolOutputBytes = 25000;
  delete exceeded.resourceCompliance.observed.totalTokens;
  const exceededChecks = resourceComplianceChecks(v2Contract, exceeded);
  assert.equal(exceededChecks.find((entry) => entry.name === 'resource-compliance-within-lease').pass, true);
});

test('V2 CLI exposes an accepted quality result and an independent resource overrun', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-owner-v2-gate-'));
  try {
    const exceeded = structuredClone(v2Result);
    exceeded.resourceCompliance.status = 'exceeded';
    exceeded.resourceCompliance.observed.toolOutputBytes = 25000;
    const contractPath = resolve(directory, 'contract.json');
    const resultPath = resolve(directory, 'result.json');
    const pathsPath = resolve(directory, 'paths.json');
    const solChecksPath = resolve(directory, 'sol-checks.json');
    writeFileSync(contractPath, JSON.stringify(v2Contract));
    writeFileSync(resultPath, JSON.stringify(exceeded));
    writeFileSync(pathsPath, JSON.stringify(exceeded.changedPaths));
    writeFileSync(solChecksPath, JSON.stringify(solChecks));
    const cli = resolve('plugins/heliolune/scripts/native-owner-gate.mjs');
    const run = spawnSync(process.execPath, [cli, '--contract', contractPath, '--result', resultPath, '--actual-paths', pathsPath, '--sol-checks', solChecksPath, '--accept'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const payload = JSON.parse(run.stdout);
    assert.equal(payload.pass, true);
    assert.equal(payload.qualityPass, true);
    assert.equal(payload.resourcePass, false);
    assert.equal(payload.resourceChecks.find((entry) => entry.name === 'resource-compliance-status').pass, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('new owner dispatch is V2-only while V1 remains deterministic historical input', () => {
  const role = readFileSync(resolve('plugins/heliolune/agents/luna-owner.toml'), 'utf8');
  const installedRole = readFileSync(resolve('.codex/agents/luna-owner.toml'), 'utf8');
  const skill = readFileSync(resolve('plugins/heliolune/skills/heliolune/SKILL.md'), 'utf8');
  for (const source of [role, installedRole]) {
    assert.equal(source.includes('HELIOLUNE_OWNER_CONTRACT_V1 is historical validation data and is not a valid owner dispatch input'), true);
    assert.equal(source.includes('For V2 owner work'), true);
    assert.equal(source.includes('Use at most 36 total tool calls'), false);
    assert.equal(source.includes('use at most two edit calls per turn'), false);
    assert.equal(source.includes('Return exactly one HELIOLUNE_OWNER_RESULT_V2 JSON object'), true);
    assert.equal(source.includes('HELIOLUNE_OWNER_RESULT_V1 JSON object'), false);
  }
  assert.equal(skill.includes('Use `HELIOLUNE_OWNER_CONTRACT_V2` for all new owner work'), true);
  assert.equal(skill.includes('never dispatch a new owner with V1'), true);
  assert.equal(skill.includes('"schemaVersion": "HELIOLUNE_OWNER_CONTRACT_V1"'), false);
});
