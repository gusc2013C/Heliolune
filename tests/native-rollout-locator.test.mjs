import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { findRollouts, findRolloutsByMetadata } from '../plugins/heliolune/scripts/find-rollout.mjs';

test('rollout locator finds one nested session by exact metadata id', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-rollout-locator-'));
  try {
    const nested = resolve(directory, '2026', '08', '08');
    mkdirSync(nested, { recursive: true });
    const wanted = resolve(nested, 'wanted.jsonl');
    writeFileSync(wanted, `${JSON.stringify({ type: 'session_meta', payload: { id: '019fe01e-d076-78b2-8fcc-95542f9a4ace', parent_thread_id: '019fe01e-30d2-7611-9cd1-6109828f46e5', agent_path: '/root/owner/spark_terminal', agent_role: 'heliolune_spark_terminal' } })}\n`);
    writeFileSync(resolve(nested, 'other.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id: '019fe01e-d076-78b2-8fcc-95542f9a4ad' } })}\n`);
    assert.deepEqual(findRollouts('019fe01e-d076-78b2-8fcc-95542f9a4ace', [directory]), [wanted]);
    assert.deepEqual(findRolloutsByMetadata({ agentPath: '/root/owner/spark_terminal', role: 'heliolune_spark_terminal', parentSessionId: '019fe01e-30d2-7611-9cd1-6109828f46e5' }, [directory]), [wanted]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rollout locator CLI resolves canonical agent path to a real session id', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-rollout-locator-'));
  try {
    const metadata = {
      id: '019fe01e-d076-78b2-8fcc-95542f9a4ace',
      parent_thread_id: '019fe01e-30d2-7611-9cd1-6109828f46e5',
      agent_path: '/root/owner/spark_terminal',
      agent_role: 'heliolune_spark_terminal',
    };
    writeFileSync(resolve(directory, 'spark.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { ...metadata, base_instructions: { text: 'x'.repeat(70000) } } })}\n`);
    const script = resolve('plugins/heliolune/scripts/find-rollout.mjs');
    const run = spawnSync(process.execPath, [script, '--agent-path', metadata.agent_path, '--role', metadata.agent_role, '--parent-session-id', metadata.parent_thread_id, '--root', directory], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const result = JSON.parse(run.stdout);
    assert.equal(result.pass, true);
    assert.equal(result.sessionId, metadata.id);
    assert.equal(result.agentPath, metadata.agent_path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rollout locator CLI fails closed on missing and duplicate ids', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-rollout-locator-'));
  try {
    const script = resolve('plugins/heliolune/scripts/find-rollout.mjs');
    const missing = spawnSync(process.execPath, [script, '--session-id', '019fe01e-d076-78b2-8fcc-95542f9a4ace', '--root', directory], { encoding: 'utf8' });
    assert.equal(missing.status, 1, missing.stderr || missing.stdout);
    const id = '019fe01e-d076-78b2-8fcc-95542f9a4ace';
    writeFileSync(resolve(directory, 'one.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
    writeFileSync(resolve(directory, 'two.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
    const duplicate = spawnSync(process.execPath, [script, '--session-id', id, '--root', directory], { encoding: 'utf8' });
    assert.equal(duplicate.status, 1, duplicate.stderr || duplicate.stdout);
    assert.equal(JSON.parse(duplicate.stdout).matches.length, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
