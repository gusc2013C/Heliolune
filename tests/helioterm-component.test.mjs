import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runDirect, runDirectBatch } from '../plugins/heliolune/components/helioterm/direct-runner.mjs';

const componentRoot = resolve('plugins/heliolune/components/helioterm');
const preflight = resolve(componentRoot, 'preflight.mjs');
const directRunner = resolve(componentRoot, 'direct-runner.mjs');
const configure = resolve('plugins/heliolune/scripts/configure-models.mjs');

test('HelioTerm is independently described and bundled by Heliolune', () => {
  const terminalSkill = readFileSync(resolve('plugins/heliolune/skills/helioterm/SKILL.md'), 'utf8');
  const helioluneSkill = readFileSync(resolve('plugins/heliolune/skills/heliolune/SKILL.md'), 'utf8');
  assert.match(terminalSkill, /independently invocable/u);
  assert.match(terminalSkill, /no MCP and no child model/u);
  assert.match(helioluneSkill, /includes the independently usable `\$helioterm` component by default/u);
  assert.match(helioluneSkill, /Choose R1 by default/u);
  assert.match(helioluneSkill, /Spark is not an active binding/u);
});

test('ordinary HelioTerm batches tests through the zero-model direct runner', () => {
  const request = 'T|test|tests/pricing.test.mjs tests/profiles.test.mjs';
  const run = spawnSync(process.execPath, [directRunner, '--request', request, '--cwd', process.cwd()], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout.trim(), /^OK\|calls=1\|exit=0\|pass=23\|fail=0\|raw=\d+\|ms=\d+\|model=0$/u);
  assert.equal(run.stdout.trim().split(/\r?\n/u).length, 1);
});

test('ordinary HelioTerm batches different real-project observations in one result', async () => {
  const result = await runDirectBatch({
    requests: [
      'T|test|tests/pricing.test.mjs tests/profiles.test.mjs',
      'T|git|status --short',
      'T|search|-n terminal plugins/heliolune/model-bindings.json',
    ],
    cwd: process.cwd(),
  });
  assert.equal(result.pass, true, result.text);
  assert.match(result.text, /^OK\|calls=3\|ok=3\|opfail=0\|pass=23\|testfail=0\|raw=\d+\|ms=\d+\|model=0$/u);
});

test('ordinary HelioTerm rejects mutating git before execution', async () => {
  const result = await runDirect({ request: 'T|git|reset --hard', cwd: process.cwd() });
  assert.equal(result.pass, false);
  assert.equal(result.text, 'FAIL|calls=0|runner-error|model=0');
});

test('experimental MCP role fails closed when its tool is unavailable', () => {
  const role = readFileSync(resolve('plugins/heliolune/agents/helioterm-mcp.toml'), 'utf8');
  assert.match(role, /FAIL\|calls=0\|mcp-unavailable/u);
  assert.match(role, /Never substitute `exec_command`/u);
});

test('standalone HelioTerm preflight returns its active model binding', () => {
  const run = spawnSync(process.execPath, [preflight, '--compact'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.schemaVersion, 'HELIOTERM_PREFLIGHT_V1');
  assert.equal(payload.pass, true);
  assert.equal(payload.binding.agentType, 'heliolune_helioterm');
  assert.equal(payload.binding.defaultMode, 'direct');
  assert.equal(payload.binding.model, 'gpt-5.6-luna');
  assert.equal(payload.binding.effort, 'high');
});

test('every active model-backed terminal binding uses Luna high', () => {
  const bindings = JSON.parse(readFileSync(resolve('plugins/heliolune/model-bindings.json'), 'utf8'));
  for (const name of ['terminal', 'terminalMcp']) {
    assert.equal(bindings[name].model, 'gpt-5.6-luna');
    assert.equal(bindings[name].effort, 'high');
  }
  for (const roleName of ['helioterm.toml', 'helioterm-mcp.toml', 'spark-terminal.toml']) {
    const role = readFileSync(resolve('plugins/heliolune/agents', roleName), 'utf8');
    assert.match(role, /model = "gpt-5\.6-luna"/u);
    assert.doesNotMatch(role, /model = "gpt-5\.3-codex-spark"/u);
  }
});

test('model configurator is read-only by default and rejects uncommitted changes', () => {
  const inspect = spawnSync(process.execPath, [configure], { encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr || inspect.stdout);
  assert.equal(JSON.parse(inspect.stdout).written, false);
  const noWrite = spawnSync(process.execPath, [configure, '--terminal-model', 'gpt-5.6-luna'], { encoding: 'utf8' });
  assert.equal(noWrite.status, 1);
  assert.match(noWrite.stderr, /require --write/u);
  const invalid = spawnSync(process.execPath, [configure, '--terminal-model', '../bad', '--write'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /valid Codex model id/u);
});
