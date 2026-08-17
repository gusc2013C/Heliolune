import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { inspectTerminalRows } from '../plugins/heliolune/scripts/inspect-terminal-proof.mjs';

function message(role, text) {
  return { type: 'response_item', payload: { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } };
}

function validRows() {
  return [
    {
      type: 'session_meta',
      payload: {
        id: 'terminal-1',
        parent_thread_id: 'luna-1',
        originator: 'Codex Desktop',
        multi_agent_version: 'v2',
        source: { subagent: { thread_spawn: { agent_role: 'heliolune_helioterm', parent_thread_id: 'luna-1' } } },
      },
    },
    { type: 'turn_context', payload: { model: 'gpt-5.6-luna', effort: 'high', multi_agent_version: 'v2' } },
    message('user', 'T|test|tests/native*.test.mjs'),
    { type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'one', arguments: JSON.stringify({ cmd: 'node --test tests/native*.test.mjs' }) } },
    { type: 'response_item', payload: { type: 'function_call_output', call_id: 'one', output: [{ type: 'input_text', text: 'ok\n'.repeat(200) }] } },
    message('assistant', 'OK|calls=1|18/18 passed'),
    { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 12000 } } } },
    { type: 'turn_context', payload: { model: 'gpt-5.6-luna', effort: 'high', multi_agent_version: 'v2' } },
    message('user', 'T|git|diff --check'),
    { type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'two', arguments: JSON.stringify({ cmd: 'git diff --check' }) } },
    { type: 'response_item', payload: { type: 'function_call_output', call_id: 'two', output: [{ type: 'input_text', text: 'clean\n' }] } },
    message('assistant', 'OK|calls=1|diff clean'),
    { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 18000 } } } },
  ];
}

test('terminal proof validates two requests in one reusable Luna role session shape', () => {
  const result = inspectTerminalRows(validRows(), { expectedParent: 'luna-1', minimumRequests: 2 });
  assert.equal(result.pass, true);
  assert.equal(result.actual.requestCount, 2);
  assert.equal(result.actual.toolCallCount, 2);
  assert.equal(result.actual.maxToolCallsPerRequest, 1);
  assert.equal(result.actual.childSpawnCount, 0);
  assert.equal(result.actual.usage.total_tokens, 18000);
  assert.ok(result.actual.compressionRatio < 0.1);
});

test('terminal proof fails on fallback model, child spawn, and fifth command', () => {
  const rows = validRows();
  rows[1].payload.model = 'gpt-5.6-terra';
  rows.splice(5, 0,
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'three' } },
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'four' } },
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'five' } },
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'six' } },
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'spawn_agent', call_id: 'child' } },
  );
  const result = inspectTerminalRows(rows, { minimumRequests: 2 });
  assert.equal(result.pass, false);
  assert.deepEqual(result.actual.turnModels, ['gpt-5.6-terra', 'gpt-5.6-luna']);
  assert.equal(result.checks.find((entry) => entry.name === 'all-turn-models').pass, false);
  assert.equal(result.actual.childSpawnCount, 1);
  assert.ok(result.actual.maxToolCallsPerRequest > 4);
});

test('terminal proof CLI reads persisted JSONL and enforces minimum requests', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-terminal-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, `${validRows().map((row) => JSON.stringify(row)).join('\n')}\n`);
    const script = resolve('plugins/heliolune/scripts/inspect-terminal-proof.mjs');
    const run = spawnSync(process.execPath, [script, '--rollout', rollout, '--expect-parent', 'luna-1', '--expect-min-requests', '2'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(JSON.parse(run.stdout).pass, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('terminal proof joins owner evidence to Desktop function-call turns without persisted prompts', () => {
  const rows = validRows().filter((row) => !(row.type === 'response_item' && row.payload?.role === 'user'));
  for (const row of rows) {
    if (row.type === 'response_item' && row.payload?.type === 'custom_tool_call') row.payload.type = 'function_call';
    if (row.type === 'response_item' && row.payload?.type === 'custom_tool_call_output') row.payload.type = 'function_call_output';
  }
  const evidence = [
    { request: 'T|test|tests/native*.test.mjs', response: 'OK|calls=1|18/18 passed', commands: 1, verified: true },
    { request: 'T|git|diff --check', response: 'OK|calls=1|diff clean', commands: 1, verified: true },
  ];
  const result = inspectTerminalRows(rows, { expectedParent: 'luna-1', minimumRequests: 2, evidence });
  assert.equal(result.pass, true);
  assert.equal(result.actual.requestSource, 'owner-result');
});

test('terminal proof rejects owner evidence that undercounts real tool calls', () => {
  const rows = validRows().filter((row) => !(row.type === 'response_item' && row.payload?.role === 'user'));
  rows.splice(4, 0, { type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'retry', arguments: JSON.stringify({ cmd: 'node --test tests/native*.test.mjs' }) } });
  const evidence = [
    { request: 'T|test|tests/native*.test.mjs', response: 'OK|calls=1|18/18 passed', commands: 1, verified: true },
    { request: 'T|git|diff --check', response: 'OK|calls=1|diff clean', commands: 1, verified: true },
  ];
  const result = inspectTerminalRows(rows, { minimumRequests: 2, evidence });
  assert.equal(result.pass, false);
  assert.equal(result.checks.find((entry) => entry.name === 'evidence-1-commands').pass, false);
});

test('terminal proof rejects discovery commands even when counts and tests pass', () => {
  const rows = validRows();
  const firstCall = rows.find((row) => row.type === 'response_item' && row.payload?.type === 'function_call');
  firstCall.payload.arguments = JSON.stringify({ cmd: 'npm run test -- tests/native*.test.mjs' });
  const result = inspectTerminalRows(rows, { minimumRequests: 2 });
  assert.equal(result.pass, false);
  assert.equal(result.exchanges[0].checks.find((entry) => entry.name === 'exchange-1-command-semantics').pass, false);
});

test('terminal proof follows an explicit model binding and rejects fallback', () => {
  const rows = validRows();
  for (const row of rows) {
    if (row.type === 'turn_context') {
      row.payload.model = 'gpt-5.6-terra';
      row.payload.effort = 'high';
    }
  }
  const configured = inspectTerminalRows(rows, {
    minimumRequests: 2,
    expectedRole: 'heliolune_helioterm',
    expectedModel: 'gpt-5.6-terra',
    expectedEffort: 'high',
  });
  assert.equal(configured.pass, true);
  const fallback = inspectTerminalRows(rows, {
    minimumRequests: 2,
    expectedRole: 'heliolune_helioterm',
    expectedModel: 'gpt-5.6-luna',
    expectedEffort: 'high',
  });
  assert.equal(fallback.pass, false);
  assert.equal(fallback.checks.find((entry) => entry.name === 'terminal-model').pass, false);
});
