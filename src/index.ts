#!/usr/bin/env node
import { Command } from 'commander';
import { loadPolicy } from './policy.js';
import { Logger } from './logger.js';
import { startProxy } from './proxy.js';

// Manually split on '--' so upstream command options (e.g. --port) are never
// parsed by commander as guard options.
const doubleDashIdx = process.argv.indexOf('--');
if (doubleDashIdx === -1) {
  process.stderr.write(
    '[mcp-runtime-guard] Error: Missing upstream command.\n' +
    'Usage: mcp-runtime-guard --policy <path> -- <command> [args...]\n',
  );
  process.exit(1);
}
const guardArgv = process.argv.slice(0, doubleDashIdx);
const upstreamCommand = process.argv.slice(doubleDashIdx + 1);

if (upstreamCommand.length === 0) {
  process.stderr.write('[mcp-runtime-guard] Error: No upstream command specified after --\n');
  process.exit(1);
}

const program = new Command();

program
  .name('mcp-runtime-guard')
  .description('Policy-based MCP tool call proxy')
  .version('0.1.0')
  .requiredOption('-p, --policy <path>', 'Path to YAML policy file')
  .option('--log-level <level>', 'Log level: debug | info | warn', 'info')
  .option('--log-file <path>', 'Optional path for JSONL audit log');

program.parse(guardArgv);

const options = program.opts<{ policy: string; logLevel: string; logFile?: string }>();

try {
  const policy = loadPolicy(options.policy);
  const loggingConfig = {
    level: (options.logLevel ?? policy.logging?.level ?? 'info') as 'debug' | 'info' | 'warn',
    file: options.logFile ?? policy.logging?.file,
  };
  const logger = new Logger(loggingConfig);
  await startProxy({ policy, logger, upstreamCommand });
} catch (err) {
  process.stderr.write(`[mcp-runtime-guard] ERROR: ${String(err)}\n`);
  process.exit(1);
}
