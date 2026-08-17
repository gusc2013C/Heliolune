#!/usr/bin/env node

import { closeSync, existsSync, openSync, readSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function option(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefix = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  return inline?.slice(prefix.length);
}

function walk(directory, files, limit = 20000) {
  if (!existsSync(directory) || files.length >= limit) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (files.length >= limit) break;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path, files, limit);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path);
  }
}

function firstLine(path, maxBytes = 1024 * 1024) {
  const descriptor = openSync(path, 'r');
  try {
    const chunks = [];
    let offset = 0;
    while (offset < maxBytes) {
      const buffer = Buffer.alloc(Math.min(65536, maxBytes - offset));
      const count = readSync(descriptor, buffer, 0, buffer.length, offset);
      if (count === 0) break;
      const newline = buffer.indexOf(10, 0);
      chunks.push(buffer.subarray(0, newline >= 0 && newline < count ? newline : count));
      offset += count;
      if (newline >= 0 && newline < count) return Buffer.concat(chunks).toString('utf8');
    }
    throw new Error(`session_meta first line exceeds ${maxBytes} bytes or is unterminated`);
  } finally {
    closeSync(descriptor);
  }
}

export function findRollouts(sessionId, roots) {
  return findRolloutsByMetadata({ sessionId }, roots);
}

function sessionMetadata(path) {
  try {
    const row = JSON.parse(firstLine(path));
    return row.type === 'session_meta' ? row.payload ?? {} : {};
  } catch {
    return {};
  }
}

export function findRolloutsByMetadata({ sessionId = null, agentPath = null, role = null, parentSessionId = null }, roots) {
  const files = [];
  for (const root of roots) walk(root, files);
  return files.filter((path) => {
    const metadata = sessionMetadata(path);
    return (!sessionId || metadata.id === sessionId)
      && (!agentPath || metadata.agent_path === agentPath)
      && (!role || metadata.agent_role === role)
      && (!parentSessionId || metadata.parent_thread_id === parentSessionId);
  });
}

function main() {
  const sessionId = option('--session-id');
  const agentPath = option('--agent-path');
  const role = option('--role');
  const parentSessionId = option('--parent-session-id');
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  const pathPattern = /^\/root\/[a-z0-9_/-]+$/u;
  const validSessionQuery = sessionId && uuidPattern.test(sessionId);
  const validPathQuery = agentPath && pathPattern.test(agentPath) && role && /^[a-z0-9_]+$/u.test(role);
  if ((!validSessionQuery && !validPathQuery) || parentSessionId && !uuidPattern.test(parentSessionId)) {
    process.stderr.write('Usage: find-rollout.mjs (--session-id <uuid> | --agent-path </root/path> --role <name>) [--parent-session-id <uuid>] [--root <sessions-directory>]\n');
    process.exitCode = 2;
    return;
  }

  const explicitRoot = option('--root');
  const roots = explicitRoot
    ? [resolve(explicitRoot)]
    : [resolve(homedir(), '.codex', 'sessions'), resolve(homedir(), '.codex', 'archived_sessions')];
  const matches = findRolloutsByMetadata({
    sessionId: validSessionQuery ? sessionId : null,
    agentPath: validPathQuery ? agentPath : null,
    role: validPathQuery ? role : null,
    parentSessionId: parentSessionId ?? null,
  }, roots);
  const matchedMetadata = matches.length === 1 ? sessionMetadata(matches[0]) : {};
  const result = {
    schemaVersion: 'HELIOLUNE_ROLLOUT_LOCATION_V1',
    pass: matches.length === 1,
    sessionId: matchedMetadata.id ?? sessionId ?? null,
    agentPath: matchedMetadata.agent_path ?? agentPath ?? null,
    role: matchedMetadata.agent_role ?? role ?? null,
    parentSessionId: matchedMetadata.parent_thread_id ?? parentSessionId ?? null,
    rolloutPath: matches.length === 1 ? matches[0] : null,
    matches,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
