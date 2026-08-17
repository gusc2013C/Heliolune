#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDirectory, '..');
const defaultRepositoryRoot = resolve(pluginRoot, '..', '..');

function option(name, fallback) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0 && process.argv[exact + 1]) return process.argv[exact + 1];
  const prefix = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

const repositoryRoot = resolve(option('--repo', defaultRepositoryRoot));
const compact = process.argv.includes('--compact');
const packagedConfig = resolve(pluginRoot, '.codex', 'config.toml');
const agentsDirectory = resolve(option('--agents-dir', resolve(repositoryRoot, '.codex', 'agents')));
const paths = {
  config: existsSync(packagedConfig) ? packagedConfig : resolve(repositoryRoot, '.codex', 'config.toml'),
  manifest: resolve(pluginRoot, '.codex-plugin', 'plugin.json'),
  bindings: resolve(pluginRoot, 'model-bindings.json'),
  skill: resolve(pluginRoot, 'skills', 'heliolune', 'SKILL.md'),
  terminalSkill: resolve(pluginRoot, 'skills', 'helioterm', 'SKILL.md'),
  gate: resolve(pluginRoot, 'scripts', 'native-owner-gate.mjs'),
  roleProof: resolve(pluginRoot, 'scripts', 'inspect-role-proof.mjs'),
  terminalFirewall: resolve(pluginRoot, 'components', 'helioterm', 'firewall.mjs'),
  terminalDirect: resolve(pluginRoot, 'components', 'helioterm', 'direct-runner.mjs'),
  terminalProof: resolve(pluginRoot, 'scripts', 'inspect-terminal-proof.mjs'),
  terminalPreflight: resolve(pluginRoot, 'components', 'helioterm', 'preflight.mjs'),
  locator: resolve(pluginRoot, 'scripts', 'find-rollout.mjs'),
  agentsDirectory,
};

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
}
for (const [name, path] of Object.entries(paths)) check(`${name}-present`, existsSync(path), path);

const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const config = read(paths.config);
const manifest = existsSync(paths.manifest) ? JSON.parse(read(paths.manifest)) : {};
const bindings = existsSync(paths.bindings) ? JSON.parse(read(paths.bindings)) : {};
const skill = read(paths.skill);
const terminalSkill = read(paths.terminalSkill);
const gate = read(paths.gate);
const roleProof = read(paths.roleProof);
const terminalFirewall = read(paths.terminalFirewall);
const terminalProof = read(paths.terminalProof);
const locator = read(paths.locator);

function tomlString(source, name) {
  const match = source.match(new RegExp(`^${name}\\s*=\\s*(?:"""([\\s\\S]*?)"""|"([^"\\r\\n]*)")`, 'mu'));
  return match?.[1] ?? match?.[2] ?? null;
}

check('native-version', /^0\.8\.0-alpha\.3(?:\+codex\.[0-9A-Za-z.-]+)?$/u.test(manifest.version ?? ''), manifest.version ?? null);
check('zero-mcp-manifest', !Object.hasOwn(manifest, 'mcpServers'), 'mcpServers must be absent');
check('zero-mcp-file', !existsSync(resolve(pluginRoot, '.mcp.json')), '.mcp.json must be absent');
check('bindings-schema', bindings.schemaVersion === 'HELIOLUNE_MODEL_BINDINGS_V1', bindings.schemaVersion ?? null);
check('bundled-helioterm', manifest.skills === './skills/' && existsSync(paths.terminalSkill) && skill.includes('`$helioterm`'), 'manifest exposes the present HelioTerm skill by default');
check('direct-helioterm-default', terminalSkill.includes('no MCP and no child model') && terminalSkill.includes('model=0'), 'ordinary HelioTerm is zero-model direct');
check('direct-helioterm-binding', bindings.terminal?.defaultMode === 'direct' && bindings.terminal?.directRunner === 'components/helioterm/direct-runner.mjs', bindings.terminal);
check('clean-child-invariant', skill.includes('fork_turns="none"'), 'roles use clean child sessions');
check('context-pack-invariant', gate.includes('HELIOLUNE_CONTEXT_PACK_V1') && gate.includes('context-read-first') && skill.includes('at most five repository calls'), 'owner discovery requires a bounded context pack');
check('persistent-owner-policy', gate.includes('maxTurns: 3') && gate.includes('maxToolCalls: 36') && gate.includes('maxEditCalls: 6') && skill.includes('Reuse that owner with `followup_task`'), 'one bounded reusable Luna owner session');
const neutralTerminalAliasChecks = [
  "check('terminal-policy-alias', !terminalPolicyAlias.conflict",
  "check('terminal-used-alias', !terminalUsedAlias.conflict",
  "check('terminal-agent-path-alias', !terminalAgentPathAlias.conflict",
  "check('terminal-evidence-alias', !terminalEvidenceAlias.conflict",
];
check(
  'neutral-terminal-protocol',
  gate.includes('function aliasedField') && neutralTerminalAliasChecks.every((anchor) => gate.includes(anchor)),
  'neutral and legacy terminal fields use aliasedField conflict checks',
);
check('rollout-agent-path-lookup', locator.includes("option('--agent-path')") && locator.includes('metadata.agent_path === agentPath') && locator.includes('metadata.parent_thread_id === parentSessionId'), 'locator resolves path, role, and parent');
check('helioterm-budgets', terminalFirewall.includes('maxRequests: 8') && terminalFirewall.includes('maxCommandsPerRequest: 4') && terminalFirewall.includes('maxRequestBytes: 64') && terminalFirewall.includes('maxResponseBytes: 256'), '8 requests, 4 calls, 64/256 bytes');
check('helioterm-proof-dynamic-binding', terminalProof.includes('expectedRole = defaultTerminalBinding.agentType') && terminalProof.includes('expectedModel = defaultTerminalBinding.model') && terminalProof.includes('expectedEffort = defaultTerminalBinding.effort'), 'proof follows configured binding');
check('helioterm-proof-leaf-and-semantics', terminalProof.includes("check('no-child-spawn'") && terminalProof.includes('exchange-${index + 1}-command-semantics') && terminalProof.includes("payload.type === 'function_call'"), 'leaf, deterministic command, and function-call proof');

const distributableProfiles = [
  ['owner', bindings.owner],
  ['peer', bindings.peer],
  ['critic', bindings.critic],
  ['terminal', bindings.terminal],
  ['terminalMcp', bindings.terminalMcp],
  ['sparkTerminal', {
    agentType: 'heliolune_spark_terminal',
    model: 'gpt-5.6-luna',
    effort: 'high',
    configFile: 'agents/spark-terminal.toml',
  }],
];

for (const [key, profile] of distributableProfiles) {
  const sourcePath = resolve(pluginRoot, profile?.configFile ?? 'missing');
  const source = read(sourcePath);
  const installedPath = resolve(agentsDirectory, basename(profile?.configFile ?? 'missing'));
  const installed = read(installedPath);
  const schema = {
    name: tomlString(source, 'name'),
    description: tomlString(source, 'description'),
    developerInstructions: tomlString(source, 'developer_instructions'),
    model: tomlString(source, 'model'),
    effort: tomlString(source, 'model_reasoning_effort'),
  };
  check(
    `${key}-standalone-profile-schema`,
    schema.name === profile?.agentType
      && Boolean(schema.description?.trim())
      && Boolean(schema.developerInstructions?.trim())
      && schema.model === profile?.model
      && schema.effort === profile?.effort,
    { path: sourcePath, ...schema },
  );
  check(`${key}-discoverable-profile-present`, existsSync(installedPath), installedPath);
  check(
    `${key}-discoverable-profile-current`,
    installed.length > 0 && installed === source,
    { source: sourcePath, installed: installedPath },
  );
}

const tokenBudgets = [
  ['total', 'total_tokens', 'totalTokens'],
  ['reasoning', 'reasoning_output_tokens', 'reasoningOutputTokens'],
  ['output', 'output_tokens', 'outputTokens'],
  ['cached-input', 'cached_input_tokens', 'cachedInputTokens'],
  ['input', 'input_tokens', 'inputTokens'],
];
check('role-proof-tool-call-budget', roleProof.includes("['custom_tool_call', 'function_call'].includes(row.payload?.type)") && roleProof.includes("nonNegativeIntegerOption('--expect-max-tool-calls')") && roleProof.includes('toolCallCount'), 'real persisted function/custom calls counted');
for (const [flag, field, variable] of tokenBudgets) {
  check(
    `role-proof-${flag}-token-budget`,
    roleProof.includes(`nonNegativeIntegerOption('--expect-max-${flag}-tokens', 'non-negative safe integer')`)
      && roleProof.includes(`actual.usage?.${field}`)
      && roleProof.includes(`Number.isSafeInteger(${variable})`),
    `persisted latest total_token_usage.${field} budget`,
  );
}

for (const [name, binding] of Object.entries(bindings).filter(([name]) => name !== 'schemaVersion')) {
  const rolePath = resolve(pluginRoot, binding.configFile ?? 'missing');
  const role = read(rolePath);
  check(`${name}-binding-shape`, typeof binding.agentType === 'string' && typeof binding.model === 'string' && typeof binding.effort === 'string', binding);
  const registeredPath = [`../${binding.configFile}`, `../plugins/heliolune/${binding.configFile}`].some((candidate) => config.includes(candidate));
  check(`${name}-registered`, config.includes(`[agents.${binding.agentType}]`) && registeredPath, binding.agentType);
  check(`${name}-model`, role.includes(`model = "${binding.model}"`), binding.model);
  check(`${name}-effort`, role.includes(`model_reasoning_effort = "${binding.effort}"`), binding.effort);
  check(`${name}-instructions`, role.includes('developer_instructions = """'), binding.configFile);
  if (name === 'owner') {
    check('owner-identity-marker', role.includes('Begin the first owner turn with exactly HELIOLUNE_ENGINEERING_OWNER_ROLE_APPLIED'), 'marker before first tool call');
    check('owner-no-duplicate-preflight', role.includes('never rerun Heliolune or HelioTerm preflight'), 'preflight evidence is root-owned');
    check('owner-context-budget', role.includes('initial read pass in at most five repository calls') && role.includes('Do not run `rg --files`'), 'bounded discovery without repository enumeration');
    check('owner-session-reuse', role.includes('Remain reusable for at most three turns') && role.includes('HELIOLUNE_OWNER_FOLLOWUP_V1'), 'same-contract implementation, repair, and evidence turns');
    check('owner-persistent-helioterm', role.includes('exactly one configured `heliolune_helioterm`') && role.includes('Reuse that exact child with `followup_task`'), 'one reusable HelioTerm child');
    check('owner-tool-call-budget', role.includes('at most 36 total tool calls') && role.includes('six across the reused session'), 'owner cumulative tool/edit cap');
    check('owner-neutral-result', role.includes('terminalUsed, terminalAgentPath, terminalEvidence'), 'neutral result fields');
  }
  if (name === 'terminal') {
    check('terminal-identity-marker', role.includes('HELIOTERM_ROLE_APPLIED'), 'HelioTerm identity marker');
    check('terminal-deterministic-test', role.includes('map test=`node --test`') && role.includes('Without discovery'), 'fallback command map without discovery');
    check('terminal-leaf', role.includes('delegate') && role.includes('model-backed HelioTerm fallback'), 'terminal is an optional leaf');
  }
}

const result = {
  schemaVersion: 'HELIOLUNE_NATIVE_PREFLIGHT_V1',
  repositoryRoot,
  pluginRoot,
  version: manifest.version ?? null,
  bindings,
  pass: checks.every((entry) => entry.pass),
  checks,
};
const output = compact
  ? { schemaVersion: result.schemaVersion, version: result.version, bindings: result.bindings, pass: result.pass, failedChecks: checks.filter((entry) => !entry.pass).map((entry) => entry.name) }
  : result;
process.stdout.write(`${JSON.stringify(output, null, compact ? 0 : 2)}\n`);
if (!result.pass) process.exitCode = 1;
