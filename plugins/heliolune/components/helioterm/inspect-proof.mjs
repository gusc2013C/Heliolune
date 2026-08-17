#!/usr/bin/env node

export { inspectTerminalRows, runTerminalProofCli } from '../../scripts/inspect-terminal-proof.mjs';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTerminalProofCli } from '../../scripts/inspect-terminal-proof.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runTerminalProofCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
