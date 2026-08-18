#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

import { TERMINAL_LIMITS, measureExchange } from './terminal-firewall.mjs';

const CONTRACT_SCHEMA = 'HELIOLUNE_OWNER_CONTRACT_V1';
export const CONTRACT_SCHEMA_V2 = 'HELIOLUNE_OWNER_CONTRACT_V2';
const RESULT_SCHEMA = 'HELIOLUNE_OWNER_RESULT_V1';
export const RESULT_SCHEMA_V2 = 'HELIOLUNE_OWNER_RESULT_V2';
const FOLLOWUP_SCHEMA = 'HELIOLUNE_OWNER_FOLLOWUP_V1';
export const OWNER_SESSION_LIMITS = Object.freeze({ persistent: true, maxTurns: 3, maxToolCalls: 36, maxEditCalls: 6 });
export const RESOURCE_LEASE_SCHEMA_V2 = 'HELIOLUNE_RESOURCE_LEASE_V2';

const RESOURCE_DIMENSIONS = Object.freeze([
  'turns',
  'toolOutputBytes',
  'totalToolOutputBytes',
  'totalTokens',
  'reasoningTokens',
  'outputTokens',
  'cachedInputTokens',
  'inputTokens',
]);

function nonEmptyString(value, max = 4000) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function stringArray(value, { min = 0, max = 32, itemMax = 1000 } = {}) {
  return Array.isArray(value)
    && value.length >= min
    && value.length <= max
    && value.every((item) => nonEmptyString(item, itemMax));
}

function exactRecord(value, expected) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, expectedValue]) => Object.hasOwn(value, key) && value[key] === expectedValue);
}

function normalizePath(value) {
  return typeof value === 'string' ? value.trim().replaceAll('\\', '/') : '';
}

function safeRelativePath(value) {
  const normalized = normalizePath(value);
  return nonEmptyString(normalized, 500)
    && !/^(?:[A-Za-z]:|\/)/.test(normalized)
    && !normalized.split('/').includes('..')
    && !normalized.split('/').includes('.git');
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function safePositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

const COMPLEXITY_ALIASES = Object.freeze({
  tiny: 'low',
  small: 'low',
  low: 'low',
  medium: 'medium',
  large: 'high',
  high: 'high',
});

function normalizeTaskComplexity(value) {
  return typeof value === 'string' ? COMPLEXITY_ALIASES[value.trim().toLowerCase()] ?? null : null;
}

function explicitTaskComplexity(task) {
  const candidates = [
    task?.taskComplexity,
    task?.complexity,
    task?.taskShape?.complexity,
    task?.resourceLease?.taskComplexity,
    task?.resourceLease?.complexity,
  ];
  return candidates.find((value) => value !== undefined) ?? null;
}

/**
 * Normalize an explicitly supplied task-shaped V2 lease. Numeric resource
 * limits are contract data; they are never inferred from scope or acceptance.
 */
export function deriveResourceLease(task = {}) {
  const explicit = explicitTaskComplexity(task);
  const suppliedDimensions = record(task?.resourceDimensions)
    ? task.resourceDimensions
    : record(task?.resourceBudget)
      ? task.resourceBudget
      : record(task?.resourceLease?.dimensions)
        ? task.resourceLease.dimensions
        : record(task?.resourceLease?.limits)
          ? task.resourceLease.limits
          : null;
  if (explicit === null || !record(suppliedDimensions)) return null;
  const taskComplexity = normalizeTaskComplexity(explicit);
  if (taskComplexity === null) return null;
  return {
    schemaVersion: RESOURCE_LEASE_SCHEMA_V2,
    taskComplexity,
    ...(record(task?.taskShape) ? { taskShape: task.taskShape } : {}),
    dimensions: { ...suppliedDimensions },
  };
}

function resourceLeaseDimensions(lease) {
  const hasDimensions = record(lease) && Object.hasOwn(lease, 'dimensions');
  const hasLimits = record(lease) && Object.hasOwn(lease, 'limits');
  const dimensions = hasDimensions ? lease.dimensions : lease?.limits;
  return {
    dimensions,
    conflict: hasDimensions && hasLimits && !isDeepStrictEqual(lease.dimensions, lease.limits),
  };
}

function validTaskShape(value) {
  return record(value)
    && Object.keys(value).every((key) => ['scopeSize', 'acceptanceSize', 'risk', 'complexity'].includes(key))
    && (value.scopeSize === undefined || Number.isSafeInteger(value.scopeSize) && value.scopeSize >= 0)
    && (value.acceptanceSize === undefined || Number.isSafeInteger(value.acceptanceSize) && value.acceptanceSize >= 0)
    && (value.risk === undefined || value.risk === null || ['low', 'medium', 'high'].includes(value.risk))
    && (value.complexity === undefined || normalizeTaskComplexity(value.complexity) !== null);
}

export function validateResourceLease(lease) {
  const dimensionsAlias = resourceLeaseDimensions(lease);
  const dimensions = dimensionsAlias.dimensions;
  const complexity = lease?.taskComplexity ?? lease?.complexity;
  const allowedKeys = ['schemaVersion', 'taskComplexity', 'complexity', 'dimensions', 'limits', 'taskShape', 'leaseId', 'source'];
  const dimensionKeys = record(dimensions) ? Object.keys(dimensions) : [];
  return [
    check('resource-lease-record', record(lease), lease ?? null, 'object'),
    check('resource-lease-fields', record(lease) && Object.keys(lease).every((key) => allowedKeys.includes(key)), record(lease) ? Object.keys(lease) : null, allowedKeys),
    check('resource-lease-schema', lease?.schemaVersion === RESOURCE_LEASE_SCHEMA_V2, lease?.schemaVersion ?? null, RESOURCE_LEASE_SCHEMA_V2),
    check('resource-lease-complexity', normalizeTaskComplexity(complexity) !== null, complexity ?? null, 'low|medium|high'),
    check('resource-lease-dimensions', record(dimensions) && !dimensionsAlias.conflict
      && dimensionKeys.every((key) => RESOURCE_DIMENSIONS.includes(key))
      && dimensionKeys.length > 0
      && dimensionKeys.every((key) => safePositiveInteger(dimensions[key])), dimensions ?? null, 'at least one explicit non-call resource limit'),
    check('resource-lease-task-shape', lease?.taskShape === undefined || validTaskShape(lease.taskShape), lease?.taskShape ?? null, 'task-shaped lease metadata'),
  ];
}

function effectiveResourceLease(contract) {
  return record(contract) && Object.hasOwn(contract, 'resourceLease') ? contract.resourceLease : null;
}

function validV2OwnerPolicy(value) {
  return record(value)
    && Object.keys(value).length === 2
    && value.persistent === true
    && safePositiveInteger(value.maxTurns)
    && value.maxTurns <= 3;
}

function pathInScope(path, scope) {
  const normalized = normalizePath(path);
  return scope.some((entry) => normalized === entry || normalized.startsWith(`${entry.replace(/\/$/, '')}/`));
}

function check(name, pass, actual, expected) {
  return { name, pass: Boolean(pass), actual, ...(expected === undefined ? {} : { expected }) };
}

function aliasedField(value, neutralKey, legacyKey) {
  const record = value && typeof value === 'object' ? value : null;
  const hasNeutral = record !== null && Object.hasOwn(record, neutralKey);
  const hasLegacy = record !== null && Object.hasOwn(record, legacyKey);
  const neutralValue = hasNeutral ? record[neutralKey] : undefined;
  const legacyValue = hasLegacy ? record[legacyKey] : undefined;
  return {
    value: hasNeutral ? neutralValue : legacyValue,
    conflict: hasNeutral && hasLegacy && !isDeepStrictEqual(neutralValue, legacyValue),
    fields: { neutral: neutralValue, legacy: legacyValue },
  };
}

export function validateContract(contract) {
  const scope = Array.isArray(contract?.scope) ? contract.scope.map(normalizePath) : [];
  const context = contract?.context;
  const readFirst = Array.isArray(context?.readFirst) ? context.readFirst.map(normalizePath) : [];
  const ownerCommands = contract?.verification?.owner;
  const solCommands = contract?.verification?.sol;
  const route = contract?.route;
  const ownerPolicy = contract?.ownerPolicy;
  const isV1 = contract?.schemaVersion === CONTRACT_SCHEMA;
  const isV2 = contract?.schemaVersion === CONTRACT_SCHEMA_V2;
  const resourceLease = effectiveResourceLease(contract);
  const terminalPolicyAlias = aliasedField(contract, 'terminalPolicy', 'sparkPolicy');
  const effectiveTerminalPolicy = terminalPolicyAlias.value;
  return [
    check('contract-schema', isV1 || isV2, contract?.schemaVersion, [CONTRACT_SCHEMA, CONTRACT_SCHEMA_V2]),
    check('contract-id', typeof contract?.contractId === 'string' && /^[a-z0-9][a-z0-9-]{7,63}$/u.test(contract.contractId), contract?.contractId ?? null, '8..64 lowercase letters, digits, or hyphens'),
    check('route', ['R1', 'R2'].includes(route), route, 'R1|R2'),
    check('objective', nonEmptyString(contract?.objective, 4000), contract?.objective ?? null, 'non-empty <= 4000 chars'),
    check('acceptance', stringArray(contract?.acceptance, { min: 1, max: 12 }), contract?.acceptance ?? null, '1..12 strings'),
    check('scope', stringArray(contract?.scope, { min: 1, max: 32 }) && scope.every(safeRelativePath), contract?.scope ?? null, '1..32 safe repository-relative paths'),
    check('context-schema', context?.schemaVersion === 'HELIOLUNE_CONTEXT_PACK_V1', context?.schemaVersion ?? null, 'HELIOLUNE_CONTEXT_PACK_V1'),
    check('context-read-first', stringArray(context?.readFirst, { min: 1, max: 4 }) && readFirst.every((path) => safeRelativePath(path) && pathInScope(path, scope)), context?.readFirst ?? null, '1..4 safe in-scope paths'),
    check('context-anchors', stringArray(context?.anchors, { min: 1, max: 24, itemMax: 500 }), context?.anchors ?? null, '1..24 targeted anchors'),
    check('context-constraints', stringArray(context?.constraints, { min: 0, max: 12, itemMax: 500 }), context?.constraints ?? null, '0..12 constraints'),
    check('reserved', stringArray(contract?.reserved, { min: 0, max: 16 }), contract?.reserved ?? null, '0..16 strings'),
    check('risk', ['low', 'medium', 'high'].includes(contract?.risk), contract?.risk ?? null, 'low|medium|high'),
    check('preflight-schema', contract?.preflight?.schemaVersion === 'HELIOLUNE_NATIVE_PREFLIGHT_V1', contract?.preflight?.schemaVersion ?? null, 'HELIOLUNE_NATIVE_PREFLIGHT_V1'),
    check('preflight-pass', contract?.preflight?.pass === true, contract?.preflight?.pass ?? null, true),
    check('preflight-version', nonEmptyString(contract?.preflight?.version, 200), contract?.preflight?.version ?? null, 'non-empty version'),
    check('owner-policy', isV1 ? exactRecord(ownerPolicy, OWNER_SESSION_LIMITS) : isV2 && validV2OwnerPolicy(ownerPolicy), ownerPolicy ?? null, isV1 ? OWNER_SESSION_LIMITS : { persistent: true, maxTurns: 3 }),
    check('resource-lease', !isV2 || validateResourceLease(resourceLease).every((entry) => entry.pass), resourceLease ?? null, isV2 ? RESOURCE_LEASE_SCHEMA_V2 : null),
    check('terminal-policy-alias', !terminalPolicyAlias.conflict, terminalPolicyAlias.fields, 'neutral and legacy terminal policies must agree'),
    check('terminal-policy', route === 'R1' ? effectiveTerminalPolicy === 'forbidden' : route === 'R2' && exactRecord(effectiveTerminalPolicy, {
      persistent: true,
      maxRequests: TERMINAL_LIMITS.maxRequests,
      maxCommandsPerRequest: TERMINAL_LIMITS.maxCommandsPerRequest,
      maxRequestBytes: TERMINAL_LIMITS.maxRequestBytes,
      maxResponseBytes: TERMINAL_LIMITS.maxResponseBytes,
    }), effectiveTerminalPolicy ?? null, route === 'R1' ? 'forbidden' : TERMINAL_LIMITS),
    check('owner-verification', stringArray(ownerCommands, { min: 1, max: 8, itemMax: 2000 }), ownerCommands ?? null, '1..8 focused commands'),
    check('sol-verification', stringArray(solCommands, { min: 1, max: 8, itemMax: 2000 }), solCommands ?? null, '1..8 Sol acceptance commands'),
    check('verification-separated', Array.isArray(ownerCommands) && Array.isArray(solCommands) && ownerCommands.every((command) => !solCommands.includes(command)), contract?.verification ?? null, 'owner and Sol commands must be distinct'),
  ];
}

export function validateFollowup(followup, contract) {
  const allowedKeys = new Set(['schemaVersion', 'contractId', 'ownerTurn', 'kind', 'objective', 'failedChecks', 'evidence']);
  const failedChecks = followup?.failedChecks;
  const ownerCommands = new Set(contract?.verification?.owner ?? []);
  const maxTurns = contract?.ownerPolicy?.maxTurns ?? OWNER_SESSION_LIMITS.maxTurns;
  return [
    check('followup-schema', followup?.schemaVersion === FOLLOWUP_SCHEMA, followup?.schemaVersion ?? null, FOLLOWUP_SCHEMA),
    check('followup-fields', followup && typeof followup === 'object' && !Array.isArray(followup) && Object.keys(followup).every((key) => allowedKeys.has(key)), followup ? Object.keys(followup) : null, [...allowedKeys]),
    check('followup-contract-id', nonEmptyString(contract?.contractId, 64) && followup?.contractId === contract.contractId, followup?.contractId ?? null, contract?.contractId ?? null),
    check('followup-turn', Number.isSafeInteger(followup?.ownerTurn) && followup.ownerTurn >= 2 && followup.ownerTurn <= maxTurns, followup?.ownerTurn ?? null, `2..${maxTurns}`),
    check('followup-kind', ['repair', 'evidence'].includes(followup?.kind), followup?.kind ?? null, 'repair|evidence'),
    check('followup-objective', nonEmptyString(followup?.objective, 1000), followup?.objective ?? null, 'non-empty <= 1000 chars'),
    check('followup-failed-checks', stringArray(failedChecks, { min: 1, max: 8, itemMax: 2000 }) && failedChecks.every((command) => ownerCommands.has(command)), failedChecks ?? null, '1..8 commands from verification.owner'),
    check('followup-evidence', stringArray(followup?.evidence, { min: 1, max: 12, itemMax: 1000 }), followup?.evidence ?? null, '1..12 evidence strings'),
  ];
}

function validObjection(value) {
  return value && typeof value === 'object'
    && nonEmptyString(value.decision)
    && stringArray(value.evidence, { min: 1, max: 12 })
    && nonEmptyString(value.issue)
    && stringArray(value.options, { min: 1, max: 8 })
    && nonEmptyString(value.recommendation)
    && typeof value.blocking === 'boolean';
}

function validTerminalEvidence(value) {
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= TERMINAL_LIMITS.maxRequests
    && value.every((entry) => entry?.verified === true
      && measureExchange({
        request: entry.request,
        response: entry.response,
        commands: entry.commands,
        rawOutput: typeof entry.rawOutput === 'string' ? entry.rawOutput : '',
      }).pass
      && (entry.rawOutputBytes === undefined || Number.isSafeInteger(entry.rawOutputBytes) && entry.rawOutputBytes >= 0)
      && (entry.compressedBytes === undefined || Number.isSafeInteger(entry.compressedBytes) && entry.compressedBytes >= 0));
}

function validAgentPath(value) {
  return typeof value === 'string' && /^\/root\/[a-z0-9_/-]+$/u.test(value) && !value.split('/').includes('..');
}

function qualityAcceptanceStatus(value) {
  if (!record(value)) return null;
  if (['passed', 'failed'].includes(value.status)) return value.status;
  if (typeof value.passed === 'boolean') return value.passed ? 'passed' : 'failed';
  return null;
}

function validQualityAcceptance(value) {
  const status = qualityAcceptanceStatus(value);
  return status !== null
    && (nonEmptyString(value.summary, 2000)
      || stringArray(value.evidence, { min: 1, max: 32 })
      || checkRecords(value.checks));
}

function resourceComplianceStatus(value) {
  if (!record(value)) return null;
  if (['compliant', 'exceeded', 'unmeasured'].includes(value.status)) return value.status;
  if (typeof value.compliant === 'boolean') return value.compliant ? 'compliant' : 'exceeded';
  return null;
}

function observedResourceValue(observed, keys) {
  if (!record(observed)) return undefined;
  for (const key of keys) {
    if (Object.hasOwn(observed, key)) return observed[key];
  }
  return undefined;
}

function normalizedResourceObservation(value) {
  const observed = record(value?.observed) ? value.observed : record(value?.usage) ? value.usage : null;
  return {
    turns: observedResourceValue(observed, ['turns', 'turnCount']),
    toolCalls: observedResourceValue(observed, ['toolCalls', 'toolCallCount']),
    editCalls: observedResourceValue(observed, ['editCalls', 'editCallCount']),
    toolOutputBytes: observedResourceValue(observed, ['toolOutputBytes', 'maxToolOutputBytes']),
    totalToolOutputBytes: observedResourceValue(observed, ['totalToolOutputBytes']),
    totalTokens: observedResourceValue(observed, ['totalTokens']),
    reasoningTokens: observedResourceValue(observed, ['reasoningTokens']),
    outputTokens: observedResourceValue(observed, ['outputTokens']),
    cachedInputTokens: observedResourceValue(observed, ['cachedInputTokens']),
    inputTokens: observedResourceValue(observed, ['inputTokens']),
  };
}

function validResourceCompliance(value) {
  const status = resourceComplianceStatus(value);
  const observed = normalizedResourceObservation(value);
  const observedValues = RESOURCE_DIMENSIONS.map((key) => observed[key]).filter((entry) => entry !== undefined);
  return status !== null
    && (status === 'unmeasured' || (record(value.observed) || record(value.usage))
      && observedValues.length > 0
      && observedValues.every((entry) => Number.isSafeInteger(entry) && entry >= 0));
}

function resourceLeaseComparison(lease, observation) {
  const dimensions = resourceLeaseDimensions(lease).dimensions;
  if (!record(dimensions)) return { comparable: false, within: false };
  const pairs = RESOURCE_DIMENSIONS
    .filter((key) => observation[key] !== undefined && dimensions[key] !== undefined);
  return {
    comparable: pairs.length > 0,
    within: pairs.length > 0 && pairs.every((key) => observation[key] <= dimensions[key]),
  };
}

export function validateResult(result, contract = null) {
  const statuses = ['completed', 'blocked', 'objection'];
  const terminalUsedAlias = aliasedField(result, 'terminalUsed', 'sparkUsed');
  const terminalAgentPathAlias = aliasedField(result, 'terminalAgentPath', 'sparkAgentPath');
  const terminalEvidenceAlias = aliasedField(result, 'terminalEvidence', 'sparkEvidence');
  const effectiveTerminalUsed = terminalUsedAlias.value;
  const effectiveTerminalAgentPath = terminalAgentPathAlias.value;
  const effectiveTerminalEvidence = terminalEvidenceAlias.value;
  const route = contract?.route ?? (effectiveTerminalUsed === true ? 'R2' : 'R1');
  const isV2 = contract?.schemaVersion === CONTRACT_SCHEMA_V2;
  const expectedResultSchema = isV2 ? RESULT_SCHEMA_V2 : RESULT_SCHEMA;
  const maxTurns = contract?.ownerPolicy?.maxTurns ?? OWNER_SESSION_LIMITS.maxTurns;
  const checksValid = Array.isArray(result?.checks)
    && result.checks.length >= 1
    && result.checks.length <= 32
    && result.checks.every((entry) => nonEmptyString(entry?.command, 2000)
      && ['passed', 'failed'].includes(entry?.status)
      && nonEmptyString(entry?.summary, 2000));
  const objectionValid = result?.status === 'objection' ? validObjection(result?.objection) : result?.objection === null;
  return [
    check('result-schema', result?.schemaVersion === expectedResultSchema, result?.schemaVersion, expectedResultSchema),
    check('result-status', statuses.includes(result?.status), result?.status ?? null, statuses.join('|')),
    check('owner-turn', Number.isSafeInteger(result?.ownerTurn) && result.ownerTurn >= 1 && result.ownerTurn <= maxTurns, result?.ownerTurn ?? null, `1..${maxTurns}`),
    check('owner-session-complete', typeof result?.ownerSessionComplete === 'boolean', result?.ownerSessionComplete ?? null, 'boolean'),
    check('changed-paths', stringArray(result?.changedPaths, { min: 0, max: 64 }) && result.changedPaths.every(safeRelativePath), result?.changedPaths ?? null, 'safe repository-relative paths'),
    check('checks', checksValid, result?.checks ?? null, '1..32 executed checks'),
    check('residual-risks', stringArray(result?.residualRisks, { min: 0, max: 16 }), result?.residualRisks ?? null, '0..16 strings'),
    check('objection-shape', objectionValid, result?.objection ?? null, result?.status === 'objection' ? 'structured objection' : null),
    check('evidence', stringArray(result?.evidence, { min: 1, max: 32 }), result?.evidence ?? null, '1..32 strings'),
    check('terminal-used-alias', !terminalUsedAlias.conflict, terminalUsedAlias.fields, 'neutral and legacy terminal usage must agree'),
    check('terminal-agent-path-alias', !terminalAgentPathAlias.conflict, terminalAgentPathAlias.fields, 'neutral and legacy terminal agent paths must agree'),
    check('terminal-evidence-alias', !terminalEvidenceAlias.conflict, terminalEvidenceAlias.fields, 'neutral and legacy terminal evidence must agree'),
    check('terminal-route-use', route === 'R1' ? effectiveTerminalUsed === false : route === 'R2' && effectiveTerminalUsed === true, effectiveTerminalUsed ?? null, route === 'R2'),
    check('terminal-agent-path', route === 'R1' ? effectiveTerminalAgentPath === null : validAgentPath(effectiveTerminalAgentPath), effectiveTerminalAgentPath ?? null, route === 'R1' ? null : 'canonical terminal agent path'),
    check(
      'terminal-evidence',
      route === 'R1'
        ? Array.isArray(effectiveTerminalEvidence) && effectiveTerminalEvidence.length === 0
        : validTerminalEvidence(effectiveTerminalEvidence),
      effectiveTerminalEvidence ?? null,
      route === 'R1' ? [] : `1..${TERMINAL_LIMITS.maxRequests} verified exchanges`,
    ),
    check('quality-acceptance', !isV2 || validQualityAcceptance(result?.qualityAcceptance), result?.qualityAcceptance ?? null, isV2 ? 'passed|failed report' : null),
    check('resource-compliance', !isV2 || validResourceCompliance(result?.resourceCompliance), result?.resourceCompliance ?? null, isV2 ? 'compliant|exceeded|unmeasured report' : null),
    check('protocol-violations', stringArray(result?.protocolViolations, { min: 0, max: 16 }), result?.protocolViolations ?? null, '0..16 strings'),
  ];
}

function checkRecords(value) {
  return Array.isArray(value) && value.every((entry) => nonEmptyString(entry?.command, 2000)
    && ['passed', 'failed'].includes(entry?.status)
    && nonEmptyString(entry?.summary, 2000));
}

function normalizedCommands(records) {
  return Array.isArray(records) ? records.map((entry) => entry.command).sort() : [];
}

export function qualityAcceptanceChecks(contract, result) {
  if (contract?.schemaVersion !== CONTRACT_SCHEMA_V2) return [];
  const status = qualityAcceptanceStatus(result?.qualityAcceptance);
  const checksPassed = Array.isArray(result?.checks) && result.checks.every((entry) => entry.status === 'passed');
  return [
    check('quality-acceptance-shape', validQualityAcceptance(result?.qualityAcceptance), result?.qualityAcceptance ?? null, 'qualityAcceptance report'),
    check('quality-acceptance-status', status === 'passed', status, 'passed'),
    check('quality-acceptance-consistent', status === null || status === (checksPassed ? 'passed' : 'failed'), status, checksPassed ? 'passed' : 'failed'),
  ];
}

export function resourceComplianceChecks(contract, result) {
  if (contract?.schemaVersion !== CONTRACT_SCHEMA_V2) return [];
  const status = resourceComplianceStatus(result?.resourceCompliance);
  const observation = normalizedResourceObservation(result?.resourceCompliance);
  const lease = effectiveResourceLease(contract);
  const leaseValid = validateResourceLease(lease).every((entry) => entry.pass);
  const comparison = resourceLeaseComparison(lease, observation);
  return [
    check('resource-compliance-shape', validResourceCompliance(result?.resourceCompliance), result?.resourceCompliance ?? null, 'resourceCompliance report'),
    check('resource-compliance-status', status === 'compliant', status, 'compliant'),
    check('resource-compliance-lease', leaseValid, lease ?? null, RESOURCE_LEASE_SCHEMA_V2),
    check('resource-compliance-within-lease', status === 'unmeasured' || (status === 'compliant' && comparison.comparable && comparison.within) || (status === 'exceeded' && comparison.comparable && !comparison.within), { status, observation, comparison }, 'truthful lease observation'),
  ];
}

export function acceptanceChecks(contract, result, actualPaths, solChecks) {
  const contractChecks = validateContract(contract);
  const resultChecks = validateResult(result, contract);
  const scope = Array.isArray(contract?.scope) ? contract.scope.map(normalizePath) : [];
  const reported = Array.isArray(result?.changedPaths) ? [...new Set(result.changedPaths.map(normalizePath))].sort() : [];
  const actual = Array.isArray(actualPaths) ? [...new Set(actualPaths.map(normalizePath))].sort() : [];
  const expectedOwnerCommands = [...(contract?.verification?.owner ?? [])].sort();
  const expectedSolCommands = [...(contract?.verification?.sol ?? [])].sort();
  const qualityV2Checks = contract?.schemaVersion === CONTRACT_SCHEMA_V2
    ? qualityAcceptanceChecks(contract, result)
    : [];
  return [
    ...contractChecks,
    ...resultChecks,
    ...qualityV2Checks,
    check('status-completed', result?.status === 'completed', result?.status ?? null, 'completed'),
    check('owner-session-final', result?.ownerSessionComplete === true, result?.ownerSessionComplete ?? null, true),
    check('all-checks-passed', Array.isArray(result?.checks) && result.checks.every((entry) => entry.status === 'passed'), result?.checks?.map((entry) => entry.status) ?? null, 'all passed'),
    check('no-residual-risks', Array.isArray(result?.residualRisks) && result.residualRisks.length === 0, result?.residualRisks ?? null, []),
    check('no-objection', result?.objection === null, result?.objection ?? null, null),
    check('no-protocol-violations', Array.isArray(result?.protocolViolations) && result.protocolViolations.length === 0, result?.protocolViolations ?? null, []),
    check('owner-command-set', JSON.stringify(normalizedCommands(result?.checks)) === JSON.stringify(expectedOwnerCommands), normalizedCommands(result?.checks), expectedOwnerCommands),
    check('actual-paths-provided', Array.isArray(actualPaths), actualPaths ?? null, 'independent JSON array'),
    check('actual-paths-safe', Array.isArray(actualPaths) && actual.every(safeRelativePath), actualPaths ?? null, 'safe repository-relative paths'),
    check('actual-paths-in-scope', Array.isArray(actualPaths) && actual.every((path) => pathInScope(path, scope)), actualPaths ?? null, scope),
    check('reported-paths-match-actual', JSON.stringify(reported) === JSON.stringify(actual), reported, actual),
    check('sol-checks-provided', checkRecords(solChecks), solChecks ?? null, 'executed Sol check records'),
    check('sol-command-set', JSON.stringify(normalizedCommands(solChecks)) === JSON.stringify(expectedSolCommands), normalizedCommands(solChecks), expectedSolCommands),
    check('all-sol-checks-passed', checkRecords(solChecks) && solChecks.every((entry) => entry.status === 'passed'), solChecks?.map((entry) => entry.status) ?? null, 'all passed'),
  ];
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson(path, label) {
  if (!path) throw new Error(`${label} path is required`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  const contract = readJson(option('--contract'), '--contract');
  const followupPath = option('--followup');
  const followup = followupPath ? readJson(followupPath, '--followup') : null;
  const resultPath = option('--result');
  const accept = process.argv.includes('--accept');
  const result = resultPath ? readJson(resultPath, '--result') : null;
  const actualPath = option('--actual-paths');
  const actualPaths = actualPath ? readJson(actualPath, '--actual-paths') : undefined;
  const solChecksPath = option('--sol-checks');
  const solChecks = solChecksPath ? readJson(solChecksPath, '--sol-checks') : undefined;
  const checks = followup
    ? [...validateContract(contract), ...validateFollowup(followup, contract)]
    : accept
    ? acceptanceChecks(contract, result, actualPaths, solChecks)
    : result
      ? [...validateContract(contract), ...validateResult(result)]
      : validateContract(contract);
  const v2Acceptance = accept && contract?.schemaVersion === CONTRACT_SCHEMA_V2;
  const resourceChecks = v2Acceptance ? resourceComplianceChecks(contract, result) : [];
  const output = {
    schemaVersion: 'HELIOLUNE_NATIVE_OWNER_GATE_V1',
    mode: followup ? 'validate-followup' : accept ? 'accept' : result ? 'validate-result' : 'validate-contract',
    pass: checks.every((entry) => entry.pass),
    ...(v2Acceptance ? {
      qualityPass: checks.every((entry) => entry.pass),
      resourcePass: resourceChecks.every((entry) => entry.pass),
      resourceChecks,
    } : {}),
    checks,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.pass) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
