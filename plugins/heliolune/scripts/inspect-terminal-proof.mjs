#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TERMINAL_LIMITS, measureExchange } from './terminal-firewall.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const modelBindings = JSON.parse(readFileSync(resolve(scriptDirectory, '..', 'model-bindings.json'), 'utf8'));
const defaultTerminalBinding = modelBindings.terminal;

function option(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefix = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  return inline?.slice(prefix.length);
}

function parseNonNegativeInteger(name, fallback) {
  const value = option(name);
  if (value === undefined) return fallback;
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} requires a non-negative safe integer`);
  }
  return Number(value);
}

function contentText(payload) {
  return (payload?.content ?? []).map((entry) => entry?.text ?? '').filter(Boolean);
}

function outputText(payload) {
  if (typeof payload?.output === 'string') return payload.output;
  if (Array.isArray(payload?.output)) return payload.output.map((entry) => entry?.text ?? '').join('');
  return '';
}

function check(name, pass, actual, expected) {
  return { name, pass: Boolean(pass), actual, ...(expected === undefined ? {} : { expected }) };
}

function callCommand(payload) {
  if (payload?.type === 'function_call') {
    try {
      return JSON.parse(payload.arguments ?? '{}').cmd ?? null;
    } catch {
      return null;
    }
  }
  if (payload?.type === 'custom_tool_call' && typeof payload.input === 'string') {
    const match = /\bcmd\s*:\s*("(?:\\.|[^"\\])*")/u.exec(payload.input);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
  return null;
}

function expectedCommand(request) {
  const match = /^T\|([a-z]+)\|(.+)$/u.exec(request ?? '');
  if (!match) return null;
  const prefixes = {
    test: 'node --test ',
    build: 'npm run ',
    git: 'git ',
    search: 'rg ',
    bench: 'node ',
    process: 'tasklist ',
  };
  return `${prefixes[match[1]] ?? ''}${match[2]}` || null;
}

export function inspectTerminalRows(rows, {
  expectedParent = null,
  minimumRequests = 1,
  evidence = [],
  expectedRole = defaultTerminalBinding.agentType,
  expectedModel = defaultTerminalBinding.model,
  expectedEffort = defaultTerminalBinding.effort,
} = {}) {
  const metadata = rows.find((row) => row.type === 'session_meta')?.payload ?? {};
  const contexts = rows.filter((row) => row.type === 'turn_context').map((row) => row.payload ?? {});
  const context = contexts.at(-1) ?? {};
  const tokenEvents = rows.filter((row) => row.type === 'event_msg' && row.payload?.type === 'token_count');
  const turns = [];
  let active = null;
  let pendingRequest = null;
  let childSpawnCount = 0;

  for (const row of rows) {
    const payload = row.payload ?? {};
    if (row.type === 'turn_context') {
      active = { request: pendingRequest, response: null, commands: 0, commandLines: [], rawOutput: '' };
      pendingRequest = null;
      turns.push(active);
      continue;
    }
    if (row.type !== 'response_item') continue;
    if (payload.type === 'message' && payload.role === 'user') {
      const request = contentText(payload).map((text) => text.trim()).find((text) => /^T\|/u.test(text));
      if (request) {
        if (active && active.response === null && active.commands === 0) active.request = request;
        else pendingRequest = request;
      }
      continue;
    }
    if (payload.type === 'custom_tool_call' || payload.type === 'function_call') {
      if (/(?:spawn_agent|create_thread)/u.test(payload.name ?? '')) childSpawnCount += 1;
      if (active && active.response === null) {
        active.commands += 1;
        active.commandLines.push(callCommand(payload));
      }
      continue;
    }
    if (payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') {
      if (active && active.response === null) active.rawOutput += outputText(payload);
      continue;
    }
    if (payload.type === 'message' && payload.role === 'assistant' && active && active.response === null) {
      const response = contentText(payload).map((text) => text.trim()).find((text) => /^(?:OK|FAIL|MATCH|MORE)\|/u.test(text));
      if (response) active.response = response;
    }
  }

  const observedTurns = turns.filter((entry) => entry.request || entry.response || entry.commands > 0 || entry.rawOutput);
  const measured = observedTurns.map((entry, index) => {
    const request = entry.request ?? evidence[index]?.request;
    const result = measureExchange({ request, response: entry.response, commands: entry.commands, rawOutput: entry.rawOutput });
    const expected = expectedCommand(request);
    const semanticCheck = check(`exchange-${index + 1}-command-semantics`, expected !== null && entry.commandLines.length > 0 && entry.commandLines.every((command) => command === expected), entry.commandLines, expected);
    result.commandLines = entry.commandLines;
    result.checks.push(semanticCheck);
    result.pass = result.pass && semanticCheck.pass;
    return result;
  });
  const evidenceChecks = measured.flatMap((entry, index) => {
    if (!evidence[index]) return [];
    return [
      check(`evidence-${index + 1}-response`, evidence[index].response === entry.response, entry.response, evidence[index].response),
      check(`evidence-${index + 1}-commands`, evidence[index].commands === entry.commands, entry.commands, evidence[index].commands),
    ];
  });
  const role = metadata.source?.subagent?.thread_spawn?.agent_role ?? metadata.agent_role ?? null;
  const parentThreadId = metadata.parent_thread_id ?? metadata.source?.subagent?.thread_spawn?.parent_thread_id ?? null;
  const rawOutputBytes = measured.reduce((sum, entry) => sum + entry.metrics.rawOutputBytes, 0);
  const compressedBytes = measured.reduce((sum, entry) => sum + entry.metrics.compressedBytes, 0);
  const actual = {
    sessionId: metadata.id ?? null,
    parentThreadId,
    originator: metadata.originator ?? null,
    role,
    model: context.model ?? null,
    turnModels: [...new Set(contexts.map((entry) => entry.model ?? null))],
    effort: context.effort ?? null,
    turnEfforts: [...new Set(contexts.map((entry) => entry.effort ?? null))],
    metadataBackend: metadata.multi_agent_version ?? null,
    turnBackends: [...new Set(contexts.map((entry) => entry.multi_agent_version ?? null))],
    requestCount: measured.length,
    requestSource: observedTurns.every((entry) => entry.request) ? 'rollout' : evidence.length === measured.length ? 'owner-result' : 'missing',
    maxRequestBytes: measured.length ? Math.max(...measured.map((entry) => entry.metrics.requestBytes)) : 0,
    maxResponseBytes: measured.length ? Math.max(...measured.map((entry) => entry.metrics.responseBytes)) : 0,
    toolCallCount: measured.reduce((sum, entry) => sum + entry.commands, 0),
    maxToolCallsPerRequest: measured.length ? Math.max(...measured.map((entry) => entry.commands)) : 0,
    childSpawnCount,
    rawOutputBytes,
    compressedBytes,
    compressionRatio: rawOutputBytes > 0 ? compressedBytes / rawOutputBytes : null,
    usage: tokenEvents.at(-1)?.payload?.info?.total_token_usage ?? null,
  };
  const checks = [
    check('desktop-origin', actual.originator === 'Codex Desktop', actual.originator, 'Codex Desktop'),
    check('terminal-role', actual.role === expectedRole, actual.role, expectedRole),
    check('terminal-model', actual.model === expectedModel, actual.model, expectedModel),
    check('all-turn-models', actual.turnModels.length > 0 && actual.turnModels.every((entry) => entry === expectedModel), actual.turnModels, [expectedModel]),
    check('terminal-effort', actual.effort === expectedEffort, actual.effort, expectedEffort),
    check('all-turn-efforts', actual.turnEfforts.length > 0 && actual.turnEfforts.every((entry) => entry === expectedEffort), actual.turnEfforts, [expectedEffort]),
    check('metadata-v2', actual.metadataBackend === 'v2', actual.metadataBackend, 'v2'),
    check('turns-v2', actual.turnBackends.length > 0 && actual.turnBackends.every((entry) => entry === 'v2'), actual.turnBackends, ['v2']),
    check('parent-present', typeof actual.parentThreadId === 'string' && actual.parentThreadId.length > 0, actual.parentThreadId, 'non-empty parent thread id'),
    ...(expectedParent ? [check('expected-parent', actual.parentThreadId === expectedParent, actual.parentThreadId, expectedParent)] : []),
    check('request-count-minimum', actual.requestCount >= minimumRequests, actual.requestCount, `>=${minimumRequests}`),
    check('request-count-budget', actual.requestCount <= TERMINAL_LIMITS.maxRequests, actual.requestCount, TERMINAL_LIMITS.maxRequests),
    check('no-child-spawn', childSpawnCount === 0, childSpawnCount, 0),
    check('all-exchanges-valid', measured.length > 0 && measured.every((entry) => entry.pass), measured.map((entry) => entry.pass), 'all true'),
    ...(evidence.length > 0 ? [check('evidence-count', evidence.length === measured.length, evidence.length, measured.length), ...evidenceChecks] : []),
  ];
  return {
    schemaVersion: 'HELIOTERM_PROOF_V1',
    pass: checks.every((entry) => entry.pass),
    actual,
    exchanges: measured,
    checks,
  };
}

export function runTerminalProofCli() {
  const rolloutArgument = option('--rollout');
  if (!rolloutArgument) {
    process.stderr.write('Usage: inspect-terminal-proof.mjs --rollout <jsonl> [--result <owner-result.json>] [--expect-parent <id>] [--expect-min-requests <count>] [--expect-role <role>] [--expect-model <model>] [--expect-effort <effort>]\n');
    process.exitCode = 2;
    return;
  }
  const rolloutPath = resolve(rolloutArgument);
  const rows = readFileSync(rolloutPath, 'utf8').split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
    }
  });
  const resultPath = option('--result');
  const ownerResult = resultPath ? JSON.parse(readFileSync(resolve(resultPath), 'utf8')) : null;
  const result = inspectTerminalRows(rows, {
    expectedParent: option('--expect-parent') ?? null,
    minimumRequests: parseNonNegativeInteger('--expect-min-requests', 1),
    evidence: ownerResult?.terminalEvidence ?? ownerResult?.sparkEvidence ?? [],
    expectedRole: option('--expect-role') ?? defaultTerminalBinding.agentType,
    expectedModel: option('--expect-model') ?? defaultTerminalBinding.model,
    expectedEffort: option('--expect-effort') ?? defaultTerminalBinding.effort,
  });
  result.rolloutPath = rolloutPath;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runTerminalProofCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
