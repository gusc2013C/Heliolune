#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HELIOTERM_LIMITS = Object.freeze({
  maxRequests: 8,
  maxCommandsPerRequest: 4,
  maxRequestBytes: 64,
  maxResponseBytes: 256,
});

export const TERMINAL_LIMITS = HELIOTERM_LIMITS;
const OPERATIONS = new Set(['test', 'build', 'git', 'search', 'bench', 'process']);
const RESPONSE_KINDS = new Set(['OK', 'FAIL', 'MATCH', 'MORE']);

function check(name, pass, actual, expected) {
  return { name, pass: Boolean(pass), actual, ...(expected === undefined ? {} : { expected }) };
}

export function utf8Bytes(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : '', 'utf8');
}

export function validateTerminalRequest(request) {
  const match = typeof request === 'string' ? /^T\|([a-z]+)\|([^\r\n]+)$/u.exec(request) : null;
  const bytes = utf8Bytes(request);
  const operation = match?.[1] ?? null;
  const argument = match?.[2] ?? null;
  const checks = [
    check('request-shape', Boolean(match), request ?? null, 'T|operation|argument on one line'),
    check('request-operation', OPERATIONS.has(operation), operation, [...OPERATIONS]),
    check('request-byte-limit', bytes <= HELIOTERM_LIMITS.maxRequestBytes, bytes, HELIOTERM_LIMITS.maxRequestBytes),
  ];
  return { pass: checks.every((entry) => entry.pass), bytes, operation, argument, checks };
}

export function validateTerminalResponse(response) {
  const match = typeof response === 'string' ? /^(OK|FAIL|MATCH|MORE)\|([^\r\n]+)$/u.exec(response) : null;
  const bytes = utf8Bytes(response);
  const kind = match?.[1] ?? null;
  const observation = match?.[2] ?? null;
  const checks = [
    check('response-shape', Boolean(match), response ?? null, 'OK|..., FAIL|..., MATCH|..., or MORE|... on one line'),
    check('response-kind', RESPONSE_KINDS.has(kind), kind, [...RESPONSE_KINDS]),
    check('response-byte-limit', bytes <= HELIOTERM_LIMITS.maxResponseBytes, bytes, HELIOTERM_LIMITS.maxResponseBytes),
  ];
  return { pass: checks.every((entry) => entry.pass), bytes, kind, observation, checks };
}

export function measureExchange({ request, response, commands, rawOutput = '' }) {
  const requestValidation = validateTerminalRequest(request);
  const responseValidation = validateTerminalResponse(response);
  const commandCheck = check(
    'command-budget',
    Number.isSafeInteger(commands) && commands >= 0 && commands <= HELIOTERM_LIMITS.maxCommandsPerRequest,
    commands,
    `integer 0..${HELIOTERM_LIMITS.maxCommandsPerRequest}`,
  );
  const claimedCommands = typeof response === 'string'
    ? Number(/(?:^|\|)calls=(\d+)(?:\||$)/u.exec(response)?.[1] ?? Number.NaN)
    : Number.NaN;
  const responseCommandCheck = check(
    'response-command-count',
    Number.isSafeInteger(claimedCommands) && claimedCommands === commands,
    Number.isSafeInteger(claimedCommands) ? claimedCommands : null,
    commands,
  );
  const rawOutputBytes = utf8Bytes(rawOutput);
  const compressedBytes = responseValidation.bytes;
  const checks = [...requestValidation.checks, ...responseValidation.checks, commandCheck, responseCommandCheck];
  return {
    schemaVersion: 'HELIOTERM_EXCHANGE_V1',
    pass: checks.every((entry) => entry.pass),
    request,
    response,
    commands,
    metrics: {
      requestBytes: requestValidation.bytes,
      responseBytes: responseValidation.bytes,
      rawOutputBytes,
      compressedBytes,
      compressionRatio: rawOutputBytes > 0 ? compressedBytes / rawOutputBytes : null,
    },
    checks,
  };
}

function option(argv, name) {
  const exact = argv.indexOf(name);
  if (exact >= 0) return argv[exact + 1];
  const prefix = `${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

export function runFirewallCli(argv = process.argv.slice(2)) {
  const request = option(argv, '--request');
  const response = option(argv, '--response');
  const commandValue = option(argv, '--commands');
  if (request === undefined || response === undefined || commandValue === undefined || !/^\d+$/u.test(commandValue)) {
    process.stderr.write('Usage: firewall.mjs --request <T|operation|argument> --response <OK|...> --commands <0..4> [--raw-output <path>]\n');
    process.exitCode = 2;
    return;
  }
  const rawOutputPath = option(argv, '--raw-output');
  const rawOutput = rawOutputPath ? readFileSync(resolve(rawOutputPath), 'utf8') : '';
  const result = measureExchange({ request, response, commands: Number(commandValue), rawOutput });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runFirewallCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
