import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import { Daemon } from '../daemon/daemon.js';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

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

      try {
        const supabaseUrl = config.getSupabaseUrl();
        const supabaseKey = config.getSupabaseAnonKey();

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Restore session from stored tokens
        const sessionTokens = config.getSessionTokens();
        if (!sessionTokens) {
          logger.error('Not authenticated. Run "termbridge login" first.');
          process.exit(1);
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: sessionTokens.accessToken,
          refresh_token: sessionTokens.refreshToken,
        });

        if (sessionError) {
          logger.error('Session expired. Run "termbridge login" again.');
          config.clearSessionTokens();
          process.exit(1);
        }

        // Get current user
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          logger.error('Not authenticated. Run "termbridge login" first.');
          process.exit(1);
        }

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

        daemon.on('started', ({ machine, session }) => {
          // Save machine ID for future use
          config.setMachineId(machine.id);

          // Show success message
          logger.info('');
          logger.info('✓ TermBridge is ready!');
          logger.info(`  Session: ${session.id.slice(0, 8)}...`);
          logger.info(`  Machine: ${machine.name}`);
          logger.info('  Mobile app can now connect to this session.');
          logger.info('');
        });

        daemon.on('notification', ({ type, message }) => {
          logger.debug(`Notification: ${type} - ${message}`);
        });

        daemon.on('stopped', () => {
          logger.info('Session ended');
        });

        // Handle process signals
        process.on('SIGINT', async () => {
          await daemon.stop();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
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
        logger.error(
          `Failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  return command;
}
