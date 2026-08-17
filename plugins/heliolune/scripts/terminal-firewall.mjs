#!/usr/bin/env node

export * from '../components/helioterm/firewall.mjs';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFirewallCli } from '../components/helioterm/firewall.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runFirewallCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
