#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(pluginRoot, '..', '..');
const bindingsPath = resolve(pluginRoot, 'model-bindings.json');
const effortValues = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

function option(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function validModel(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function inspectTomlBinding(source, path) {
  const modelMatches = [...source.matchAll(/^model = "([^"\r\n]*)"(?=\r?$)/gmu)];
  const effortMatches = [...source.matchAll(/^model_reasoning_effort = "([^"\r\n]*)"(?=\r?$)/gmu)];
  if (modelMatches.length !== 1 || !validModel(modelMatches[0][1])
    || effortMatches.length !== 1 || !effortValues.has(effortMatches[0][1])) {
    throw new Error(`Cannot update model binding in ${path}: expected exactly one usable model and model_reasoning_effort binding`);
  }
}

function replaceTomlBinding(path, model, effort) {
  const source = readFileSync(path, 'utf8');
  inspectTomlBinding(source, path);
  return source
    .replace(/^model = "[^"\r\n]*"(?=\r?$)/mu, `model = "${model}"`)
    .replace(/^model_reasoning_effort = "[^"\r\n]*"(?=\r?$)/mu, `model_reasoning_effort = "${effort}"`);
}

function validateJsonBinding(name, binding) {
  if (!binding || typeof binding !== 'object' || typeof binding.configFile !== 'string') {
    throw new Error(`Invalid model binding for ${name}`);
  }
  if (!validModel(binding.model)) throw new Error(`Invalid model binding for ${name}: model is not usable`);
  if (!effortValues.has(binding.effort)) throw new Error(`Invalid model binding for ${name}: effort is not usable`);
}

const bindings = JSON.parse(readFileSync(bindingsPath, 'utf8'));
const requested = {
  owner: { model: option('--owner-model'), effort: option('--owner-effort') },
  peer: { model: option('--peer-model'), effort: option('--peer-effort') },
  critic: { model: option('--critic-model'), effort: option('--critic-effort') },
  terminal: { model: option('--terminal-model'), effort: option('--terminal-effort') },
};

if (requested.terminal.model !== undefined || requested.terminal.effort !== undefined) {
  if (!bindings.terminalMcp || typeof bindings.terminalMcp !== 'object') throw new Error('Missing model binding for terminalMcp');
  if (requested.terminal.model !== undefined) bindings.terminalMcp.model = requested.terminal.model;
  if (requested.terminal.effort !== undefined) bindings.terminalMcp.effort = requested.terminal.effort;
}

for (const [name, values] of Object.entries(requested)) {
  if (values.model !== undefined && !validModel(values.model)) throw new Error(`--${name}-model requires a valid Codex model id`);
  if (values.effort !== undefined && !effortValues.has(values.effort)) throw new Error(`--${name}-effort requires one of ${[...effortValues].join(', ')}`);
  if (values.model !== undefined || values.effort !== undefined) {
    if (!bindings[name] || typeof bindings[name] !== 'object') throw new Error(`Missing model binding for ${name}`);
    if (values.model !== undefined) bindings[name].model = values.model;
    if (values.effort !== undefined) bindings[name].effort = values.effort;
  }
}

const changed = Object.values(requested).some((entry) => entry.model !== undefined || entry.effort !== undefined);
if (changed && !process.argv.includes('--write')) throw new Error('Model changes require --write');
if (process.argv.includes('--write')) {
  const tomlWrites = [];
  for (const [name, binding] of Object.entries(bindings).filter(([, value]) => value && typeof value === 'object' && typeof value.configFile === 'string')) {
    validateJsonBinding(name, binding);
    const sourcePath = resolve(pluginRoot, binding.configFile);
    tomlWrites.push({ path: sourcePath, content: replaceTomlBinding(sourcePath, binding.model, binding.effort) });
    const projectProfile = resolve(repositoryRoot, '.codex', 'agents', basename(binding.configFile));
    if (existsSync(projectProfile)) {
      tomlWrites.push({ path: projectProfile, content: replaceTomlBinding(projectProfile, binding.model, binding.effort) });
    }
  }
  const bindingsJson = `${JSON.stringify(bindings, null, 2)}\n`;
  for (const write of tomlWrites) writeFileSync(write.path, write.content, 'utf8');
  writeFileSync(bindingsPath, bindingsJson, 'utf8');
}

process.stdout.write(`${JSON.stringify({ schemaVersion: bindings.schemaVersion, written: process.argv.includes('--write'), bindings }, null, 2)}\n`);
