import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { Daemon } from '../daemon/daemon.js';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { Spinner } from '../utils/spinner.js';

// Polyfill WebSocket for Node.js (Supabase Realtime needs this)
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error WebSocket polyfill for Node.js
  globalThis.WebSocket = WebSocket;
}

export interface StartOptions {
  daemon?: boolean;
  name?: string;
}

export function createStartCommand(): Command {
  const command = new Command('start');

  command
    .description('Start a Claude Code session')
    .option('-d, --daemon', 'Run in background (daemon mode)')
    .option('-n, --name <name>', 'Machine name')
    .argument('[command...]', 'Command to run', ['claude'])
    .action(async (args: string[], options: StartOptions) => {
      const config = new Config();
      const logger = new Logger();
      const spinner = new Spinner('Starting TermBridge...');

      try {
        spinner.start();

        const supabaseUrl = config.getSupabaseUrl();
        const supabaseKey = config.getSupabaseAnonKey();

        const supabase = createClient(supabaseUrl, supabaseKey, {
          realtime: {
            params: {
              eventsPerSecond: 10,
            },
            timeout: 30000, // 30 second timeout for WebSocket connection
          },
        });

        // Restore session from stored tokens
        const sessionTokens = config.getSessionTokens();
        if (!sessionTokens) {
          logger.error('Not authenticated. Run "termbridge login" first.');
          process.exit(1);
        }

        spinner.update('Authenticating...');

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: sessionTokens.accessToken,
          refresh_token: sessionTokens.refreshToken,
        });

        if (sessionError) {
          spinner.fail('Session expired');
          logger.error('Run "termbridge login" again.');
          config.clearSessionTokens();
          process.exit(1);
        }

        // Get current user
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          spinner.fail('Not authenticated');
          logger.error('Run "termbridge login" first.');
          process.exit(1);
        }

        spinner.update('Registering machine...');

        const commandArgs = args.length > 0 ? args : ['claude'];
        const cmd = commandArgs[0] ?? 'claude';
        const cmdArgs = commandArgs.slice(1);

        const daemon = new Daemon({
          supabase,
          userId: user.id,
          machineId: config.getMachineId(),
          machineName: options.name,
          command: cmd,
          args: cmdArgs,
          cwd: process.cwd(),
          hybrid: !options.daemon,
        });

        daemon.on('started', ({ machine, session, mobileSyncEnabled }) => {
          // Save machine ID for future use
          config.setMachineId(machine.id);

          // Stop spinner and show success message
          spinner.stop();
          logger.info('');
          logger.info('✓ TermBridge is ready!');
          logger.info(`  Session: ${session.id.slice(0, 8)}...`);
          logger.info(`  Machine: ${machine.name}`);
          if (mobileSyncEnabled) {
            logger.info('  Mobile sync: Enabled');
          } else {
            logger.warn('  Mobile sync: Disabled (check Supabase Realtime settings)');
          }
          logger.info('');
        });

        daemon.on('notification', ({ type, message }) => {
          logger.debug(`Notification: ${type} - ${message}`);
        });

        daemon.on('stopped', () => {
          // Restore terminal to normal mode
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          logger.info('Session ended');
        });

        // Handle process signals
        process.on('SIGINT', async () => {
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          await daemon.stop();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          await daemon.stop();
          process.exit(0);
        });

        await daemon.start();

        // If not daemon mode, pipe stdin to PTY
        if (!options.daemon) {
          // Set raw mode if TTY is available
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
          }

          // Resume stdin to receive data
          process.stdin.resume();

          process.stdin.on('data', (data) => {
            daemon.write(data.toString());
          });

          // Handle resize (only works with TTY)
          if (process.stdout.isTTY) {
            process.stdout.on('resize', () => {
              daemon.resize(
                process.stdout.columns || 80,
                process.stdout.rows || 24
              );
            });
          }
        }
      } catch (error) {
        spinner.fail('Failed to start');
        logger.error(
          `${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  return command;
}
