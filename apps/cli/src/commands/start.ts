import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import * as readline from 'readline';
import { spawn, execSync } from 'child_process';
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
  preventSleep?: boolean;
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

function enableSleepPrevention(): boolean {
  try {
    execSync('sudo pmset -a disablesleep 1', { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function disableSleepPrevention(): void {
  try {
    execSync('sudo pmset -a disablesleep 0', { stdio: 'inherit' });
  } catch {
    // Ignore errors on cleanup
  }
}

export function createStartCommand(): Command {
  const command = new Command('start');

  command
    .description('Start a Claude Code session')
    .option('-d, --daemon', 'Run in background (daemon mode)')
    .option('-n, --name <name>', 'Machine name')
    .option('--prevent-sleep', 'Auto-enable sleep prevention (skip prompt)')
    .action(async (options: StartOptions) => {
      let pmsetEnabled = false;
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
            timeout: 30000,
          },
        });

        // Restore session from stored tokens
        const sessionTokens = config.getSessionTokens();
        if (!sessionTokens) {
          spinner.fail('Not authenticated');
          logger.error('Run "termbridge login" first.');
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

        // Handle sleep prevention (macOS only)
        let caffeinateProcess: ReturnType<typeof spawn> | null = null;
        let sleepPreventionEnabled = false;

        if (process.platform === 'darwin') {
          spinner.stop();

          // Auto-enable if --prevent-sleep flag is used, otherwise ask
          const enableSleep = options.preventSleep ||
            await promptYesNo('Prevent sleep when lid is closed? (keeps termbridge running) [y/N]: ');

          if (enableSleep) {
            sleepPreventionEnabled = true;
            logger.info('');
            logger.info('Enabling sleep prevention...');
            if (!options.preventSleep) {
              logger.info('This requires sudo password (auto-restored on exit)');
              logger.info('');
            }

            pmsetEnabled = enableSleepPrevention();
            if (pmsetEnabled) {
              logger.info('✓ Lid-closed mode enabled');
            } else {
              logger.warn('Failed to enable lid-closed mode. Using basic mode.');
            }

            // Start caffeinate to prevent idle sleep
            caffeinateProcess = spawn('caffeinate', ['-i', '-s'], {
              stdio: 'ignore',
              detached: false,
            });

            caffeinateProcess.on('error', () => {
              logger.warn('Failed to start caffeinate');
            });

            logger.info('');
          }

          spinner.start();
        }

        spinner.update('Registering machine...');

        const daemon = new Daemon({
          supabase,
          userId: user.id,
          machineId: config.getMachineId(),
          machineName: options.name,
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
          if (sleepPreventionEnabled) {
            logger.info(`  Sleep prevention: ${pmsetEnabled ? 'Lid-closed mode' : 'Basic mode'}`);
          }
          logger.info('');
          logger.info('Type your prompts below or send from mobile app.');
          logger.info('Type "exit" to quit.');
          logger.info('');
        });

        daemon.on('notification', ({ type, message }) => {
          logger.debug(`Notification: ${type} - ${message}`);
        });

        daemon.on('stopped', () => {
          logger.info('Session ended');
          process.exit(0);
        });

        daemon.on('error', (error: Error) => {
          logger.error(`Error: ${error.message}`);
        });

        // Handle process signals
        const cleanup = async () => {
          if (caffeinateProcess) {
            caffeinateProcess.kill();
          }
          if (pmsetEnabled) {
            console.log('Restoring sleep settings...');
            disableSleepPrevention();
          }
        };

        process.on('SIGINT', async () => {
          console.log('\nShutting down...');
          await daemon.stop();
          await cleanup();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          await daemon.stop();
          await cleanup();
          process.exit(0);
        });

        await daemon.start();

        // If not daemon mode, read local input
        if (!options.daemon) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const promptForInput = () => {
            rl.question('', async (input) => {
              const trimmed = input.trim();

              if (trimmed.toLowerCase() === 'exit') {
                await daemon.stop();
                await cleanup();
                rl.close();
                return;
              }

              if (trimmed) {
                await daemon.sendPrompt(trimmed);
              }

              promptForInput();
            });
          };

          promptForInput();
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
