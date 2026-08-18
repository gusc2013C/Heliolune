import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { OWNER_SESSION_LIMITS, acceptanceChecks, validateContract, validateFollowup, validateResult } from '../plugins/heliolune/scripts/native-owner-gate.mjs';

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
  assert.match(skill, /batches distinct acceptance checks/i);
  assert.match(skill, /never reruns `verification\.owner`/i);
  assert.match(skill, /compact HelioTerm evidence/i);
  assert.match(skill, /pure version\/release-note propagation in Sol/i);
  assert.equal(manifest.version, '0.8.0+codex.20260818153255');
  assert.equal(audit.schemaVersion, 'HELIOLUNE_STABLE_TOKEN_EFFICIENCY_AUDIT_V1');
  assert.equal(audit.validatorAb.reductionBytes, 18473);
  assert.equal(audit.helioterm.savedBytes, 652453);
  assert.equal(audit.acceptedOwnerProof.model, 'gpt-5.6-luna');
  assert.equal(audit.acceptedOwnerProof.effort, 'max');
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
