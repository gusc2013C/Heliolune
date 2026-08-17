#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = resolve(pluginRoot, 'agents');
const profileFiles = [
  'helioterm-mcp.toml',
  'helioterm.toml',
  'luna-critic.toml',
  'luna-owner.toml',
  'luna-peer.toml',
  'spark-terminal.toml',
];

function option(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    const value = process.argv[index + 1];
    return value && !value.startsWith('--') ? value : undefined;
  }
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function profileName(source) {
  return source.match(/^name\s*=\s*"([^"\r\n]+)"\s*$/mu)?.[1] ?? null;
}

function digest(source) {
  return createHash('sha256').update(source).digest('hex');
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, process.argv.includes('--compact') ? 0 : 2)}\n`);
}

const targetOption = option('--target');
if (!targetOption) {
  emit({ schemaVersion: 'HELIOLUNE_AGENT_INSTALL_V1', pass: false, error: '--target requires an explicit agents directory' });
  process.exitCode = 2;
} else {
  const targetAgentsDirectory = resolve(targetOption);
  try {
    if (existsSync(targetAgentsDirectory) && !statSync(targetAgentsDirectory).isDirectory()) {
      throw new Error(`Target is not a directory: ${targetAgentsDirectory}`);
    }

    const profiles = profileFiles.map((file) => {
      const sourcePath = resolve(sourceDirectory, file);
      const source = readFileSync(sourcePath, 'utf8');
      const name = profileName(source);
      if (!name) throw new Error(`Source profile lacks a standalone name: ${sourcePath}`);
      const targetPath = resolve(targetAgentsDirectory, basename(file));
      if (existsSync(targetPath)) {
        const existingName = profileName(readFileSync(targetPath, 'utf8'));
        if (existingName !== name) throw new Error(`Refusing unrelated profile collision at ${targetPath}`);
      }
      return { file, name, source, sourcePath, targetPath };
    });

    mkdirSync(targetAgentsDirectory, { recursive: true });
    const installed = profiles.map(({ file, name, source, sourcePath, targetPath }) => {
      const unchanged = existsSync(targetPath) && readFileSync(targetPath, 'utf8') === source;
      if (!unchanged) copyFileSync(sourcePath, targetPath);
      return { file, name, sha256: digest(source), status: unchanged ? 'unchanged' : 'written' };
    });

    emit({
      schemaVersion: 'HELIOLUNE_AGENT_INSTALL_V1',
      sourceDirectory,
      targetAgentsDirectory,
      pass: true,
      installed,
    });
  } catch (error) {
    emit({
      schemaVersion: 'HELIOLUNE_AGENT_INSTALL_V1',
      sourceDirectory,
      targetAgentsDirectory,
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}
