#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function option(name, fallback = null) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0 && process.argv[exact + 1]) return process.argv[exact + 1];
  const prefix = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function nonNegativeIntegerOption(name, expectedDescription = 'non-negative integer') {
  const exact = process.argv.indexOf(name);
  const prefix = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (exact < 0 && inline === undefined) return null;

  const value = exact >= 0 ? process.argv[exact + 1] : inline.slice(prefix.length);
  if (!value || value.startsWith('--') || !/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    process.stderr.write(`Error: ${name} requires a ${expectedDescription}.\n`);
    process.exit(2);
  }
  return Number(value);
}

const expectedMaxToolCalls = nonNegativeIntegerOption('--expect-max-tool-calls');
const expectedMaxTotalTokens = nonNegativeIntegerOption('--expect-max-total-tokens', 'non-negative safe integer');
const expectedMaxReasoningTokens = nonNegativeIntegerOption('--expect-max-reasoning-tokens', 'non-negative safe integer');
const expectedMaxOutputTokens = nonNegativeIntegerOption('--expect-max-output-tokens', 'non-negative safe integer');
const expectedMaxCachedInputTokens = nonNegativeIntegerOption('--expect-max-cached-input-tokens', 'non-negative safe integer');
const expectedMaxInputTokens = nonNegativeIntegerOption('--expect-max-input-tokens', 'non-negative safe integer');
const rolloutArgument = option('--rollout');
if (!rolloutArgument) {
  process.stderr.write('Usage: inspect-role-proof.mjs --rollout <jsonl> --expect-role <name> --expect-model <model> --expect-effort <effort> --expect-marker <marker> [--expect-max-tool-calls <non-negative integer>] [--expect-max-total-tokens <non-negative safe integer>] [--expect-max-reasoning-tokens <non-negative safe integer>] [--expect-max-output-tokens <non-negative safe integer>] [--expect-max-cached-input-tokens <non-negative safe integer>] [--expect-max-input-tokens <non-negative safe integer>]\n');
  process.exit(2);
}

const rolloutPath = resolve(rolloutArgument);
const rows = readFileSync(rolloutPath, 'utf8')
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
    }
  });

const metadata = rows.find((row) => row.type === 'session_meta')?.payload ?? {};
const context = rows.find((row) => row.type === 'turn_context')?.payload ?? {};
const tokenEvents = rows.filter((row) => row.type === 'event_msg' && row.payload?.type === 'token_count');
const usage = tokenEvents.at(-1)?.payload?.info?.total_token_usage ?? null;
const toolCallCount = rows.filter((row) => row.type === 'response_item' && ['custom_tool_call', 'function_call'].includes(row.payload?.type)).length;
const assistantText = rows
  .filter((row) => row.type === 'response_item' && row.payload?.type === 'message' && row.payload?.role === 'assistant')
  .flatMap((row) => row.payload.content ?? [])
  .map((content) => content.text ?? '')
  .join('\n');

const expected = {
  role: option('--expect-role'),
  model: option('--expect-model'),
  effort: option('--expect-effort'),
  marker: option('--expect-marker'),
  cwd: option('--expect-cwd'),
  ...(expectedMaxToolCalls === null ? {} : { maxToolCalls: expectedMaxToolCalls }),
  ...(expectedMaxTotalTokens === null ? {} : { maxTotalTokens: expectedMaxTotalTokens }),
  ...(expectedMaxReasoningTokens === null ? {} : { maxReasoningTokens: expectedMaxReasoningTokens }),
  ...(expectedMaxOutputTokens === null ? {} : { maxOutputTokens: expectedMaxOutputTokens }),
  ...(expectedMaxCachedInputTokens === null ? {} : { maxCachedInputTokens: expectedMaxCachedInputTokens }),
  ...(expectedMaxInputTokens === null ? {} : { maxInputTokens: expectedMaxInputTokens }),
};
const actual = {
  sessionId: metadata.id ?? null,
  parentThreadId: metadata.parent_thread_id ?? null,
  originator: metadata.originator ?? null,
  cliVersion: metadata.cli_version ?? null,
  agentPath: metadata.agent_path ?? null,
  role: metadata.source?.subagent?.thread_spawn?.agent_role ?? metadata.agent_role ?? null,
  model: context.model ?? null,
  effort: context.effort ?? null,
  metadataBackend: metadata.multi_agent_version ?? null,
  turnBackend: context.multi_agent_version ?? null,
  cwd: context.cwd ?? metadata.cwd ?? null,
  markerSeen: expected.marker ? assistantText.includes(expected.marker) : null,
  toolCallCount,
  usage,
};

const checks = [
  { name: 'desktop-origin', pass: actual.originator === 'Codex Desktop', actual: actual.originator },
  { name: 'metadata-v2', pass: actual.metadataBackend === 'v2', actual: actual.metadataBackend },
  { name: 'turn-v2', pass: actual.turnBackend === 'v2', actual: actual.turnBackend },
];

for (const key of ['role', 'model', 'effort']) {
  if (expected[key]) checks.push({ name: key, pass: actual[key] === expected[key], expected: expected[key], actual: actual[key] });
}
if (expected.marker) checks.push({ name: 'marker', pass: actual.markerSeen, expected: expected.marker, actual: actual.markerSeen });
if (expected.cwd) checks.push({ name: 'cwd', pass: actual.cwd === expected.cwd, expected: expected.cwd, actual: actual.cwd });
if (expectedMaxToolCalls !== null) {
  checks.push({
    name: 'max-tool-calls',
    pass: actual.toolCallCount <= expectedMaxToolCalls,
    expected: expectedMaxToolCalls,
    actual: actual.toolCallCount,
  });
}
if (expectedMaxTotalTokens !== null) {
  const totalTokens = actual.usage?.total_tokens ?? null;
  checks.push({
    name: 'max-total-tokens',
    pass: Number.isSafeInteger(totalTokens) && totalTokens >= 0 && totalTokens <= expectedMaxTotalTokens,
    expected: expectedMaxTotalTokens,
    actual: totalTokens,
  });
}
if (expectedMaxReasoningTokens !== null) {
  const reasoningOutputTokens = actual.usage?.reasoning_output_tokens ?? null;
  checks.push({
    name: 'max-reasoning-tokens',
    pass: Number.isSafeInteger(reasoningOutputTokens) && reasoningOutputTokens >= 0 && reasoningOutputTokens <= expectedMaxReasoningTokens,
    expected: expectedMaxReasoningTokens,
    actual: reasoningOutputTokens,
  });
}
if (expectedMaxOutputTokens !== null) {
  const outputTokens = actual.usage?.output_tokens ?? null;
  checks.push({
    name: 'max-output-tokens',
    pass: Number.isSafeInteger(outputTokens) && outputTokens >= 0 && outputTokens <= expectedMaxOutputTokens,
    expected: expectedMaxOutputTokens,
    actual: outputTokens,
  });
}
if (expectedMaxCachedInputTokens !== null) {
  const cachedInputTokens = actual.usage?.cached_input_tokens ?? null;
  checks.push({
    name: 'max-cached-input-tokens',
    pass: Number.isSafeInteger(cachedInputTokens) && cachedInputTokens >= 0 && cachedInputTokens <= expectedMaxCachedInputTokens,
    expected: expectedMaxCachedInputTokens,
    actual: cachedInputTokens,
  });
}
if (expectedMaxInputTokens !== null) {
  const inputTokens = actual.usage?.input_tokens ?? null;
  checks.push({
    name: 'max-input-tokens',
    pass: Number.isSafeInteger(inputTokens) && inputTokens >= 0 && inputTokens <= expectedMaxInputTokens,
    expected: expectedMaxInputTokens,
    actual: inputTokens,
  });
}

const result = {
  schemaVersion: 'HELIOLUNE_NATIVE_ROLE_PROOF_V1',
  rolloutPath,
  pass: checks.every((entry) => entry.pass),
  expected,
  actual,
  checks,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.pass) process.exitCode = 1;
