import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  TERMINAL_LIMITS,
  measureExchange,
  validateTerminalRequest,
  validateTerminalResponse,
} from '../plugins/heliolune/scripts/terminal-firewall.mjs';

test('terminal firewall accepts a compact exchange and measures compression', () => {
  const rawOutput = 'ok 1\nok 2\nok 3\n'.repeat(100);
  const result = measureExchange({
    request: 'T|test|tests/native*.test.mjs',
    response: 'OK|calls=1|18/18 passed',
    commands: 1,
    rawOutput,
  });
  assert.equal(result.pass, true);
  assert.equal(result.schemaVersion, 'HELIOTERM_EXCHANGE_V1');
  assert.equal(result.metrics.rawOutputBytes, Buffer.byteLength(rawOutput));
  assert.ok(result.metrics.compressionRatio < 0.02);
});

test('terminal firewall rejects malformed and over-budget requests', () => {
  assert.equal(validateTerminalRequest('please test').pass, false);
  assert.equal(validateTerminalRequest('T|write|file').pass, false);
  assert.equal(validateTerminalRequest(`T|test|${'x'.repeat(TERMINAL_LIMITS.maxRequestBytes)}`).pass, false);
  assert.equal(validateTerminalRequest('T|test|one\ntwo').pass, false);
});

test('terminal firewall rejects verbose responses and a fifth command', () => {
  assert.equal(validateTerminalResponse('Tests passed').pass, false);
  assert.equal(validateTerminalResponse(`OK|${'x'.repeat(TERMINAL_LIMITS.maxResponseBytes)}`).pass, false);
  assert.equal(measureExchange({ request: 'T|test|x', response: 'OK|calls=5|pass', commands: 5 }).pass, false);
  assert.equal(measureExchange({ request: 'T|test|x', response: 'OK|calls=1|pass', commands: 2 }).pass, false);
});

test('terminal firewall CLI fails closed and can measure raw output', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-terminal-firewall-'));
  try {
    const rawPath = resolve(directory, 'raw.txt');
    writeFileSync(rawPath, 'line\n'.repeat(100));
    const script = resolve('plugins/heliolune/scripts/terminal-firewall.mjs');
    const valid = spawnSync(process.execPath, [script, '--request', 'T|test|x', '--response', 'OK|calls=1|pass', '--commands', '1', '--raw-output', rawPath], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    assert.equal(JSON.parse(valid.stdout).metrics.rawOutputBytes, 500);

    const invalid = spawnSync(process.execPath, [script, '--request', 'T|test|x', '--response', 'OK|calls=5|pass', '--commands', '5'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1, invalid.stderr || invalid.stdout);
    assert.equal(JSON.parse(invalid.stdout).pass, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
