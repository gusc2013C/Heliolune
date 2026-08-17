import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preflightScript = resolve(repositoryRoot, 'plugins', 'heliolune', 'scripts', 'preflight.mjs');
const ownerGateScript = resolve(repositoryRoot, 'plugins', 'heliolune', 'scripts', 'native-owner-gate.mjs');
const inspectorScript = resolve(repositoryRoot, 'plugins', 'heliolune', 'scripts', 'inspect-role-proof.mjs');
const installerScript = resolve(repositoryRoot, 'plugins', 'heliolune', 'scripts', 'install-agents.mjs');
const configureScript = resolve(repositoryRoot, 'plugins', 'heliolune', 'scripts', 'configure-models.mjs');
const standaloneProfiles = [
  ['helioterm-mcp.toml', 'helioterm_mcp'],
  ['helioterm.toml', 'heliolune_helioterm'],
  ['luna-critic.toml', 'heliolune_engineering_critic'],
  ['luna-owner.toml', 'heliolune_engineering_owner'],
  ['luna-peer.toml', 'heliolune_engineering_peer'],
  ['spark-terminal.toml', 'heliolune_spark_terminal'],
];

test('distributable and project custom agents satisfy the Desktop 0.147 standalone schema', () => {
  for (const [file, name] of standaloneProfiles) {
    const source = readFileSync(resolve(repositoryRoot, 'plugins', 'heliolune', 'agents', file), 'utf8');
    const project = readFileSync(resolve(repositoryRoot, '.codex', 'agents', file), 'utf8');
    assert.equal(project, source, file);
    assert.match(source, new RegExp(`^name = "${name}"$`, 'mu'));
    assert.match(source, /^description = "[^"\r\n]+"$/mu);
    assert.match(source, /^developer_instructions = """/mu);
    assert.match(source, /^model = "[^"\r\n]+"$/mu);
    assert.match(source, /^model_reasoning_effort = "[^"\r\n]+"$/mu);
  }
});

test('standalone installer is bounded, deterministic, and preserves unrelated profiles', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-agent-install-'));
  try {
    const target = resolve(directory, 'agents');
    const unrelated = resolve(directory, 'personal-profile.toml');
    writeFileSync(unrelated, 'name = "personal"\n');
    const first = spawnSync(process.execPath, [installerScript, '--target', target, '--compact'], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstPayload = JSON.parse(first.stdout);
    assert.equal(firstPayload.schemaVersion, 'HELIOLUNE_AGENT_INSTALL_V1');
    assert.equal(firstPayload.pass, true);
    assert.deepEqual(firstPayload.installed.map(({ file, name, status }) => ({ file, name, status })), standaloneProfiles.map(([file, name]) => ({ file, name, status: 'written' })));
    assert.equal(readFileSync(unrelated, 'utf8'), 'name = "personal"\n');

    const second = spawnSync(process.execPath, [installerScript, '--target', target, '--compact'], { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondPayload = JSON.parse(second.stdout);
    assert.deepEqual(secondPayload.installed.map(({ file, name, status }) => ({ file, name, status })), standaloneProfiles.map(([file, name]) => ({ file, name, status: 'unchanged' })));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('standalone installer fails before writes on an unrelated filename collision', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-agent-collision-'));
  try {
    const target = resolve(directory, 'agents');
    const collision = resolve(target, 'luna-owner.toml');
    writeFileSync(resolve(directory, 'placeholder'), '');
    const seed = spawnSync(process.execPath, ['-e', `require('node:fs').mkdirSync(${JSON.stringify(target)}, { recursive: true }); require('node:fs').writeFileSync(${JSON.stringify(collision)}, 'name = "personal_owner"\\n')`], { encoding: 'utf8' });
    assert.equal(seed.status, 0, seed.stderr);
    const result = spawnSync(process.execPath, [installerScript, '--target', target, '--compact'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.match(payload.error, /Refusing unrelated profile collision/u);
    assert.equal(readFileSync(collision, 'utf8'), 'name = "personal_owner"\n');
    assert.equal(existsSync(resolve(target, 'helioterm.toml')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('standalone installer rejects a missing target value before writes', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-agent-missing-target-'));
  try {
    const result = spawnSync(process.execPath, [installerScript, '--target', '--compact'], { encoding: 'utf8', cwd: directory });
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.match(payload.error, /explicit agents directory/u);
    assert.equal(existsSync(resolve(directory, '--compact')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('model configurator writes only configured profile bindings', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-model-config-'));
  try {
    const pluginRoot = resolve(directory, 'plugins', 'heliolune');
    const scriptsDirectory = resolve(pluginRoot, 'scripts');
    const agentsDirectory = resolve(pluginRoot, 'agents');
    mkdirSync(scriptsDirectory, { recursive: true });
    mkdirSync(agentsDirectory, { recursive: true });
    copyFileSync(configureScript, resolve(scriptsDirectory, 'configure-models.mjs'));

    const fixtureBindings = {
      schemaVersion: 'HELIOLUNE_MODEL_BINDINGS_V1',
      owner: { model: 'old-model', effort: 'low', configFile: 'agents/luna-owner.toml' },
      peer: { model: 'old-model', effort: 'low', configFile: 'agents/luna-peer.toml' },
      critic: { model: 'old-model', effort: 'low', configFile: 'agents/luna-critic.toml' },
      terminal: { defaultMode: 'direct', directRunner: 'components/helioterm/direct-runner.mjs', model: 'old-model', effort: 'high', configFile: 'agents/helioterm.toml' },
      terminalMcp: { model: 'old-model', effort: 'high', configFile: 'agents/helioterm-mcp.toml' },
    };
    writeFileSync(resolve(pluginRoot, 'model-bindings.json'), `${JSON.stringify(fixtureBindings, null, 2)}\n`);
    for (const binding of Object.values(fixtureBindings).filter((value) => value && typeof value === 'object')) {
      writeFileSync(resolve(pluginRoot, binding.configFile), 'model = "old-model"\nmodel_reasoning_effort = "low"\n');
    }

    const result = spawnSync(process.execPath, [
      resolve(scriptsDirectory, 'configure-models.mjs'),
      '--owner-model', 'gpt-5.6-luna',
      '--owner-effort', 'max',
      '--write',
    ], { encoding: 'utf8', cwd: directory });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.written, true);
    const writtenBindings = JSON.parse(readFileSync(resolve(pluginRoot, 'model-bindings.json'), 'utf8'));
    assert.equal(writtenBindings.owner.model, 'gpt-5.6-luna');
    assert.match(readFileSync(resolve(pluginRoot, 'agents', 'luna-owner.toml'), 'utf8'), /^model = "gpt-5\.6-luna"$/mu);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('model configurator validates every profile before writing any binding', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-model-config-atomic-'));
  try {
    const pluginRoot = resolve(directory, 'plugins', 'heliolune');
    const scriptsDirectory = resolve(pluginRoot, 'scripts');
    const agentsDirectory = resolve(pluginRoot, 'agents');
    mkdirSync(scriptsDirectory, { recursive: true });
    mkdirSync(agentsDirectory, { recursive: true });
    copyFileSync(configureScript, resolve(scriptsDirectory, 'configure-models.mjs'));

    const fixtureBindings = {
      schemaVersion: 'HELIOLUNE_MODEL_BINDINGS_V1',
      owner: { model: 'old-model', effort: 'low', configFile: 'agents/luna-owner.toml' },
      peer: { model: 'old-model', effort: 'low', configFile: 'agents/luna-peer.toml' },
      critic: { model: 'old-model', effort: 'low', configFile: 'agents/luna-critic.toml' },
      terminal: { model: 'old-model', effort: 'high', configFile: 'agents/helioterm.toml' },
      terminalMcp: { model: 'old-model', effort: 'high', configFile: 'agents/helioterm-mcp.toml' },
    };
    const bindingsFile = resolve(pluginRoot, 'model-bindings.json');
    writeFileSync(bindingsFile, `${JSON.stringify(fixtureBindings, null, 2)}\n`);
    const profilePaths = Object.values(fixtureBindings)
      .filter((value) => value && typeof value === 'object')
      .map((value) => resolve(pluginRoot, value.configFile));
    for (const profilePath of profilePaths) writeFileSync(profilePath, 'model = "old-model"\nmodel_reasoning_effort = "low"\n');
    writeFileSync(resolve(pluginRoot, 'agents', 'luna-peer.toml'), 'model = "old-model"\n');

    const beforeBindings = readFileSync(bindingsFile, 'utf8');
    const beforeProfiles = profilePaths.map((profilePath) => readFileSync(profilePath, 'utf8'));
    const run = spawnSync(process.execPath, [
      resolve(scriptsDirectory, 'configure-models.mjs'),
      '--owner-model', 'gpt-5.6-luna',
      '--owner-effort', 'max',
      '--write',
    ], { encoding: 'utf8', cwd: directory });
    assert.equal(run.status, 1, run.stderr || run.stdout);
    assert.match(run.stderr, /exactly one usable model/u);
    assert.equal(readFileSync(bindingsFile, 'utf8'), beforeBindings);
    for (const [index, profilePath] of profilePaths.entries()) {
      assert.equal(readFileSync(profilePath, 'utf8'), beforeProfiles[index], profilePath);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native preflight fails closed when only the obsolete registry is available', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-registry-only-'));
  try {
    const result = spawnSync(process.execPath, [preflightScript, '--repo', directory, '--compact'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.ok(payload.failedChecks.includes('owner-discoverable-profile-present'));
    assert.ok(payload.failedChecks.includes('owner-discoverable-profile-current'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native preflight validates the zero-MCP role bundle', () => {
  const result = spawnSync(process.execPath, [preflightScript, '--repo', repositoryRoot], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.pass, true);
  assert.equal(payload.schemaVersion, 'HELIOLUNE_NATIVE_PREFLIGHT_V1');
  assert.deepEqual(payload.checks.find((entry) => entry.name === 'role-proof-input-token-budget'), {
    name: 'role-proof-input-token-budget',
    pass: true,
    detail: 'persisted latest total_token_usage.input_tokens budget',
  });
});

test('native preflight proves every neutral terminal alias conflict check', () => {
  const gate = readFileSync(ownerGateScript, 'utf8');
  for (const anchor of [
    "check('terminal-policy-alias', !terminalPolicyAlias.conflict",
    "check('terminal-used-alias', !terminalUsedAlias.conflict",
    "check('terminal-agent-path-alias', !terminalAgentPathAlias.conflict",
    "check('terminal-evidence-alias', !terminalEvidenceAlias.conflict",
  ]) {
    assert.equal(gate.includes(anchor), true, anchor);
  }
  const result = spawnSync(process.execPath, [preflightScript, '--repo', repositoryRoot], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.checks.find((entry) => entry.name === 'neutral-terminal-protocol').pass, true);
});

test('compact preflight returns only reusable contract evidence', () => {
  const result = spawnSync(process.execPath, [preflightScript, '--repo', repositoryRoot, '--compact'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(payload), ['schemaVersion', 'version', 'bindings', 'pass', 'failedChecks']);
  assert.equal(payload.bindings.terminal.agentType, 'heliolune_helioterm');
  assert.equal(payload.bindings.terminal.model, 'gpt-5.6-luna');
  assert.equal(payload.bindings.terminal.effort, 'high');
  assert.equal(payload.bindings.terminalMcp.model, 'gpt-5.6-luna');
  assert.equal(payload.bindings.terminalMcp.effort, 'high');
  assert.equal(payload.pass, true);
  assert.deepEqual(payload.failedChecks, []);
});

test('plugin package carries its own model-bound agent registry', () => {
  const config = readFileSync(resolve(repositoryRoot, 'plugins', 'heliolune', '.codex', 'config.toml'), 'utf8');
  assert.match(config, /\[agents\.heliolune_engineering_owner\]/u);
  assert.match(config, /\[agents\.heliolune_helioterm\]/u);
  assert.match(config, /\[agents\.helioterm_mcp\]/u);
  assert.match(config, /\.\.\/agents\/luna-owner\.toml/u);
  assert.match(config, /\.\.\/agents\/helioterm\.toml/u);
});

test('role proof inspector requires real V2 metadata, model, role, and marker', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    const rows = [
      {
        type: 'session_meta',
        payload: {
          id: 'child-1',
          parent_thread_id: 'parent-1',
          originator: 'Codex Desktop',
          cli_version: '0.147.0-alpha.6.5',
          agent_path: '/root/probe',
          multi_agent_version: 'v2',
          source: { subagent: { thread_spawn: { agent_role: 'heliolune_luna_owner' } } },
        },
      },
      {
        type: 'turn_context',
        payload: {
          model: 'gpt-5.6-luna',
          effort: 'max',
          multi_agent_version: 'v2',
          cwd: 'D:\\code\\heliolune',
        },
      },
      { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec_command', call_id: 'call-1' } },
      { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec_command', call_id: 'call-2' } },
      { type: 'response_item', payload: { type: 'function_call', name: 'collaboration.followup_task', call_id: 'call-3' } },
      { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 99999, reasoning_output_tokens: 9999, output_tokens: 8888, cached_input_tokens: 7777, input_tokens: 6666 } } } },
      { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 12345, reasoning_output_tokens: 4321, output_tokens: 6789, cached_input_tokens: 6789, input_tokens: 5678 } } } },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'HELIOLUNE_LUNA_OWNER_ROLE_APPLIED' }],
        },
      },
    ];
    writeFileSync(rollout, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    const result = spawnSync(process.execPath, [
      inspectorScript,
      '--rollout', rollout,
      '--expect-role', 'heliolune_luna_owner',
      '--expect-model', 'gpt-5.6-luna',
      '--expect-effort', 'max',
      '--expect-marker', 'HELIOLUNE_LUNA_OWNER_ROLE_APPLIED',
      '--expect-max-tool-calls', '3',
      '--expect-max-total-tokens', '12345',
      '--expect-max-reasoning-tokens', '4321',
      '--expect-max-output-tokens', '6789',
      '--expect-max-cached-input-tokens', '6789',
      '--expect-max-input-tokens', '5678',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, true);
    assert.equal(payload.actual.toolCallCount, 3);
    assert.equal(payload.expected.maxToolCalls, 3);
    assert.equal(payload.expected.maxTotalTokens, 12345);
    assert.equal(payload.expected.maxReasoningTokens, 4321);
    assert.equal(payload.expected.maxOutputTokens, 6789);
    assert.equal(payload.expected.maxCachedInputTokens, 6789);
    assert.equal(payload.expected.maxInputTokens, 5678);
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-tool-calls'), { name: 'max-tool-calls', pass: true, expected: 3, actual: 3 });
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-total-tokens'), { name: 'max-total-tokens', pass: true, expected: 12345, actual: 12345 });
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-reasoning-tokens'), { name: 'max-reasoning-tokens', pass: true, expected: 4321, actual: 4321 });
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-output-tokens'), { name: 'max-output-tokens', pass: true, expected: 6789, actual: 6789 });
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-cached-input-tokens'), { name: 'max-cached-input-tokens', pass: true, expected: 6789, actual: 6789 });
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-input-tokens'), { name: 'max-input-tokens', pass: true, expected: 5678, actual: 5678 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails when persisted total tokens exceed the expected maximum', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 20001 } } } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-total-tokens', '20000'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-total-tokens'), { name: 'max-total-tokens', pass: false, expected: 20000, actual: 20001 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector remains compatible when persisted input tokens are absent without a budget', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1 } } } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, true);
    assert.equal(Object.hasOwn(payload.expected, 'maxInputTokens'), false);
    assert.equal(payload.checks.some((entry) => entry.name === 'max-input-tokens'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails when persisted input tokens exceed the expected maximum', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 20001 } } } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-input-tokens', '20000'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-input-tokens'), { name: 'max-input-tokens', pass: false, expected: 20000, actual: 20001 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails when persisted total token usage is missing', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-total-tokens', '20000'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-total-tokens'), { name: 'max-total-tokens', pass: false, expected: 20000, actual: null });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails when persisted cached input tokens exceed the expected maximum', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { cached_input_tokens: 20001 } } } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-cached-input-tokens', '20000'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-cached-input-tokens'), { name: 'max-cached-input-tokens', pass: false, expected: 20000, actual: 20001 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails when persisted reasoning output tokens exceed the expected maximum', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { reasoning_output_tokens: 20001 } } } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-reasoning-tokens', '20000'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-reasoning-tokens'), { name: 'max-reasoning-tokens', pass: false, expected: 20000, actual: 20001 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails when persisted output tokens exceed the expected maximum', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { output_tokens: 20001 } } } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-output-tokens', '20000'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-output-tokens'), { name: 'max-output-tokens', pass: false, expected: 20000, actual: 20001 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails closed when persisted output tokens are missing or invalid', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    const cases = [
      { label: 'missing', usage: {} },
      { label: 'negative', usage: { output_tokens: -1 } },
      { label: 'fractional', usage: { output_tokens: 1.5 } },
      { label: 'string', usage: { output_tokens: '1' } },
      { label: 'unsafe', usage: { output_tokens: Number.MAX_SAFE_INTEGER + 1 } },
    ];
    for (const { label, usage } of cases) {
      writeFileSync(rollout, [
        JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
        JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage } } }),
      ].join('\n'));
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-output-tokens', '20000'], { encoding: 'utf8' });
      assert.equal(result.status, 1, `${label}\n${result.stderr || result.stdout}`);
      assert.equal(JSON.parse(result.stdout).checks.find((entry) => entry.name === 'max-output-tokens').pass, false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails closed when persisted reasoning output tokens are missing or invalid', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    const cases = [
      { label: 'missing', usage: {} },
      { label: 'negative', usage: { reasoning_output_tokens: -1 } },
      { label: 'fractional', usage: { reasoning_output_tokens: 1.5 } },
      { label: 'string', usage: { reasoning_output_tokens: '1' } },
      { label: 'unsafe', usage: { reasoning_output_tokens: Number.MAX_SAFE_INTEGER + 1 } },
    ];
    for (const { label, usage } of cases) {
      writeFileSync(rollout, [
        JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
        JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage } } }),
      ].join('\n'));
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-reasoning-tokens', '20000'], { encoding: 'utf8' });
      assert.equal(result.status, 1, `${label}\n${result.stderr || result.stdout}`);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.pass, false);
      assert.equal(payload.checks.find((entry) => entry.name === 'max-reasoning-tokens').pass, false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails closed when persisted input tokens are missing or invalid', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    const cases = [
      { label: 'missing', usage: {} },
      { label: 'negative', usage: { input_tokens: -1 } },
      { label: 'fractional', usage: { input_tokens: 1.5 } },
      { label: 'string', usage: { input_tokens: '1' } },
      { label: 'unsafe', usage: { input_tokens: Number.MAX_SAFE_INTEGER + 1 } },
    ];
    for (const { label, usage } of cases) {
      writeFileSync(rollout, [
        JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
        JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage } } }),
      ].join('\n'));
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-input-tokens', '20000'], { encoding: 'utf8' });
      assert.equal(result.status, 1, `${label}\n${result.stderr || result.stdout}`);
      assert.equal(JSON.parse(result.stdout).checks.find((entry) => entry.name === 'max-input-tokens').pass, false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails closed when persisted cached input tokens are missing or invalid', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    const cases = [
      { label: 'missing', usage: {} },
      { label: 'negative', usage: { cached_input_tokens: -1 } },
      { label: 'fractional', usage: { cached_input_tokens: 1.5 } },
      { label: 'string', usage: { cached_input_tokens: '1' } },
      { label: 'unsafe', usage: { cached_input_tokens: Number.MAX_SAFE_INTEGER + 1 } },
    ];
    for (const { label, usage } of cases) {
      writeFileSync(rollout, [
        JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
        JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage } } }),
      ].join('\n'));
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-cached-input-tokens', '20000'], { encoding: 'utf8' });
      assert.equal(result.status, 1, `${label}\n${result.stderr || result.stdout}`);
      assert.equal(JSON.parse(result.stdout).checks.find((entry) => entry.name === 'max-cached-input-tokens').pass, false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails when persisted tool calls exceed the expected maximum', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'turn_context', payload: { multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'call-1' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'call-2' } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, '--expect-max-tool-calls', '1'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.equal(payload.actual.toolCallCount, 2);
    assert.deepEqual(payload.checks.find((entry) => entry.name === 'max-tool-calls'), { name: 'max-tool-calls', pass: false, expected: 1, actual: 2 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector rejects invalid maximum tool call values', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, `${JSON.stringify({ type: 'session_meta', payload: {} })}\n`);
    for (const invalid of [['--expect-max-tool-calls'], ['--expect-max-tool-calls', '-1'], ['--expect-max-tool-calls', '1.5'], ['--expect-max-tool-calls', 'many']]) {
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, ...invalid], { encoding: 'utf8' });
      assert.equal(result.status, 2, `${invalid.join(' ')}\n${result.stderr || result.stdout}`);
      assert.match(result.stderr, /--expect-max-tool-calls requires a non-negative integer/u);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector rejects invalid maximum total token values', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, `${JSON.stringify({ type: 'session_meta', payload: {} })}\n`);
    for (const invalid of [['--expect-max-total-tokens'], ['--expect-max-total-tokens', '-1'], ['--expect-max-total-tokens', '1.5'], ['--expect-max-total-tokens', 'many'], ['--expect-max-total-tokens', '9007199254740992']]) {
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, ...invalid], { encoding: 'utf8' });
      assert.equal(result.status, 2, `${invalid.join(' ')}\n${result.stderr || result.stdout}`);
      assert.match(result.stderr, /--expect-max-total-tokens requires a non-negative safe integer/u);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector rejects invalid maximum reasoning token values', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, `${JSON.stringify({ type: 'session_meta', payload: {} })}\n`);
    for (const invalid of [['--expect-max-reasoning-tokens'], ['--expect-max-reasoning-tokens', '-1'], ['--expect-max-reasoning-tokens', '1.5'], ['--expect-max-reasoning-tokens', 'many'], ['--expect-max-reasoning-tokens', '9007199254740992']]) {
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, ...invalid], { encoding: 'utf8' });
      assert.equal(result.status, 2, `${invalid.join(' ')}\n${result.stderr || result.stdout}`);
      assert.match(result.stderr, /--expect-max-reasoning-tokens requires a non-negative safe integer/u);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector rejects invalid maximum output token values', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, `${JSON.stringify({ type: 'session_meta', payload: {} })}\n`);
    for (const invalid of [['--expect-max-output-tokens'], ['--expect-max-output-tokens', '-1'], ['--expect-max-output-tokens', '1.5'], ['--expect-max-output-tokens', 'many'], ['--expect-max-output-tokens', '9007199254740992']]) {
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, ...invalid], { encoding: 'utf8' });
      assert.equal(result.status, 2, `${invalid.join(' ')}\n${result.stderr || result.stdout}`);
      assert.match(result.stderr, /--expect-max-output-tokens requires a non-negative safe integer/u);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector rejects invalid maximum cached input token values', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, `${JSON.stringify({ type: 'session_meta', payload: {} })}\n`);
    for (const invalid of [['--expect-max-cached-input-tokens'], ['--expect-max-cached-input-tokens', '-1'], ['--expect-max-cached-input-tokens', '1.5'], ['--expect-max-cached-input-tokens', 'many'], ['--expect-max-cached-input-tokens', '9007199254740992']]) {
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, ...invalid], { encoding: 'utf8' });
      assert.equal(result.status, 2, `${invalid.join(' ')}\n${result.stderr || result.stdout}`);
      assert.match(result.stderr, /--expect-max-cached-input-tokens requires a non-negative safe integer/u);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector rejects invalid maximum input token values', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, `${JSON.stringify({ type: 'session_meta', payload: {} })}\n`);
    for (const invalid of [['--expect-max-input-tokens'], ['--expect-max-input-tokens', '-1'], ['--expect-max-input-tokens', '1.5'], ['--expect-max-input-tokens', 'many'], ['--expect-max-input-tokens', '9007199254740992']]) {
      const result = spawnSync(process.execPath, [inspectorScript, '--rollout', rollout, ...invalid], { encoding: 'utf8' });
      assert.equal(result.status, 2, `${invalid.join(' ')}\n${result.stderr || result.stdout}`);
      assert.match(result.stderr, /--expect-max-input-tokens requires a non-negative safe integer/u);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('role proof inspector fails closed on a model fallback', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'heliolune-role-proof-'));
  try {
    const rollout = resolve(directory, 'rollout.jsonl');
    writeFileSync(rollout, [
      JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', multi_agent_version: 'v2', source: { subagent: { thread_spawn: { agent_role: 'heliolune_luna_owner' } } } } }),
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6-terra', effort: 'max', multi_agent_version: 'v2' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ text: 'HELIOLUNE_LUNA_OWNER_ROLE_APPLIED' }] } }),
    ].join('\n'));
    const result = spawnSync(process.execPath, [
      inspectorScript,
      '--rollout', rollout,
      '--expect-role', 'heliolune_luna_owner',
      '--expect-model', 'gpt-5.6-luna',
      '--expect-effort', 'max',
      '--expect-marker', 'HELIOLUNE_LUNA_OWNER_ROLE_APPLIED',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.pass, false);
    assert.equal(payload.actual.model, 'gpt-5.6-terra');
    assert.equal(payload.actual.toolCallCount, 0);
    assert.equal(Object.hasOwn(payload.expected, 'maxToolCalls'), false);
    assert.equal(Object.hasOwn(payload.expected, 'maxTotalTokens'), false);
    assert.equal(Object.hasOwn(payload.expected, 'maxReasoningTokens'), false);
    assert.equal(Object.hasOwn(payload.expected, 'maxOutputTokens'), false);
    assert.equal(Object.hasOwn(payload.expected, 'maxCachedInputTokens'), false);
    assert.equal(Object.hasOwn(payload.expected, 'maxInputTokens'), false);
    assert.equal(payload.checks.some((entry) => entry.name === 'max-tool-calls'), false);
    assert.equal(payload.checks.some((entry) => entry.name === 'max-total-tokens'), false);
    assert.equal(payload.checks.some((entry) => entry.name === 'max-reasoning-tokens'), false);
    assert.equal(payload.checks.some((entry) => entry.name === 'max-output-tokens'), false);
    assert.equal(payload.checks.some((entry) => entry.name === 'max-cached-input-tokens'), false);
    assert.equal(payload.checks.some((entry) => entry.name === 'max-input-tokens'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
