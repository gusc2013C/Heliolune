#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const componentRoot = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(componentRoot, '..', '..');
const repositoryRoot = resolve(pluginRoot, '..', '..');
const bindingsPath = resolve(pluginRoot, 'model-bindings.json');
const configPath = resolve(repositoryRoot, '.codex', 'config.toml');
const rolePath = resolve(pluginRoot, 'agents', 'helioterm.toml');
const bindings = existsSync(bindingsPath) ? JSON.parse(readFileSync(bindingsPath, 'utf8')) : null;
const terminal = bindings?.terminal ?? null;
const config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
const role = existsSync(rolePath) ? readFileSync(rolePath, 'utf8') : '';
const checks = [
  ['bindings-schema', bindings?.schemaVersion === 'HELIOLUNE_MODEL_BINDINGS_V1'],
  ['terminal-agent-type', typeof terminal?.agentType === 'string' && terminal.agentType.length > 0],
  ['terminal-direct-default', terminal?.defaultMode === 'direct' && terminal?.directRunner === 'components/helioterm/direct-runner.mjs'],
  ['terminal-model', typeof terminal?.model === 'string' && role.includes(`model = "${terminal.model}"`)],
  ['terminal-effort', typeof terminal?.effort === 'string' && role.includes(`model_reasoning_effort = "${terminal.effort}"`)],
  ['terminal-registered', config.includes(`[agents.${terminal?.agentType ?? ''}]`) && config.includes('../plugins/heliolune/agents/helioterm.toml')],
  ['terminal-marker', role.includes('HELIOTERM_ROLE_APPLIED')],
  ['terminal-leaf', role.includes('delegate') && role.includes('model-backed HelioTerm fallback')],
  ['terminal-direct-runner', existsSync(resolve(componentRoot, 'direct-runner.mjs'))],
  ['terminal-firewall', existsSync(resolve(componentRoot, 'firewall.mjs'))],
  ['terminal-proof', existsSync(resolve(componentRoot, 'inspect-proof.mjs'))],
].map(([name, pass]) => ({ name, pass: Boolean(pass) }));
const result = {
  schemaVersion: 'HELIOTERM_PREFLIGHT_V1',
  pass: checks.every((entry) => entry.pass),
  binding: terminal,
  checks,
};
const compact = process.argv.includes('--compact');
process.stdout.write(`${JSON.stringify(compact ? { schemaVersion: result.schemaVersion, pass: result.pass, binding: result.binding, failedChecks: checks.filter((entry) => !entry.pass).map((entry) => entry.name) } : result, null, compact ? 0 : 2)}\n`);
if (!result.pass) process.exitCode = 1;
