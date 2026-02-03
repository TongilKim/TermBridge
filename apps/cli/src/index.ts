#!/usr/bin/env node

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Load .env from CLI package root
config({ path: resolve(__dirname, '../.env') });

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
);
const version = packageJson.version || '0.0.0';

// Library exports
export { Config, getConfig } from './utils/config.js';
export { Logger, getLogger } from './utils/logger.js';
export { ConnectionManager } from './realtime/connection.js';
export { RealtimeClient } from './realtime/client.js';
export { MessageHandler } from './realtime/handlers.js';
export { SessionManager } from './daemon/session.js';
export { MachineManager } from './daemon/machine.js';
export { Daemon } from './daemon/daemon.js';

// CLI entry point
import { Command } from 'commander';
import { createStartCommand } from './commands/start.js';
import { createStopCommand } from './commands/stop.js';
import { createStatusCommand } from './commands/status.js';
import { createLoginCommand } from './commands/login.js';
import { createSetupCommand } from './commands/setup.js';

const program = new Command();

program
  .name('termbridge')
  .description('Remote control for Claude Code CLI')
  .version(version);

program.addCommand(createSetupCommand());
program.addCommand(createStartCommand());
program.addCommand(createStopCommand());
program.addCommand(createStatusCommand());
program.addCommand(createLoginCommand());

// Only parse when run directly (not when imported as library)
if (process.argv[1]?.includes('termbridge') || process.argv[1]?.endsWith('/index.js') || process.argv[1]?.endsWith('/index.ts')) {
  program.parse();
}
