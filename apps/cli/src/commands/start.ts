import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { Daemon } from '../daemon/daemon.js';
import { MachineManager } from '../daemon/machine.js';
import { MachineRealtimeClient } from '../realtime/machine-client.js';
import { Config, ConfigurationError } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { Spinner } from '../utils/spinner.js';
import {
  promptYesNo,
  enableSleepPrevention,
  disableSleepPrevention,
  startCaffeinate,
  stopCaffeinate,
  isMacOS,
  type SleepPreventionState,
} from '../utils/sleep-prevention.js';
import type { MachineCommand } from 'termbridge-shared';

// Polyfill WebSocket for Node.js (Supabase Realtime needs this)
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error WebSocket polyfill for Node.js
  globalThis.WebSocket = WebSocket;
}

export interface StartOptions {
  name?: string;
  preventSleep?: boolean;
}

export function createStartCommand(): Command {
  const command = new Command('start');

  command
    .description('Start TermBridge and listen for session requests from mobile app')
    .option('-n, --name <name>', 'Machine name')
    .option('--prevent-sleep', 'Auto-enable sleep prevention (skip prompt)')
    .action(async (options: StartOptions) => {
      const config = new Config();
      const logger = new Logger();
      const spinner = new Spinner('Starting TermBridge...');

      let daemon: Daemon | null = null;
      let machineClient: MachineRealtimeClient | null = null;

      try {
        config.requireConfiguration();

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
        const sleepState: SleepPreventionState = {
          caffeinateProcess: null,
          pmsetEnabled: false,
        };

        if (isMacOS()) {
          spinner.stop();

          // Auto-enable if --prevent-sleep flag is used, otherwise ask
          const enableSleep =
            options.preventSleep ||
            (await promptYesNo(
              'Prevent sleep when lid is closed? (keeps termbridge running) [y/N]: '
            ));

          if (enableSleep) {
            logger.info('');
            logger.info('Enabling sleep prevention...');
            if (!options.preventSleep) {
              logger.info('This requires sudo password (auto-restored on exit)');
              logger.info('');
            }

            sleepState.pmsetEnabled = enableSleepPrevention();
            if (sleepState.pmsetEnabled) {
              logger.info('✓ Lid-closed mode enabled');
            } else {
              logger.warn('Failed to enable lid-closed mode. Using basic mode.');
            }

            // Start caffeinate to prevent idle sleep
            sleepState.caffeinateProcess = startCaffeinate();

            sleepState.caffeinateProcess.on('error', () => {
              logger.warn('Failed to start caffeinate');
            });

            logger.info('');
          }

          spinner.start();
        }

        // Cleanup helper
        const cleanup = async () => {
          stopCaffeinate(sleepState.caffeinateProcess);
          if (sleepState.pmsetEnabled) {
            console.log('Restoring sleep settings...');
            disableSleepPrevention();
          }
        };

        // Handle process signals
        let isShuttingDown = false;

        const gracefulShutdown = async (signal: string) => {
          if (isShuttingDown) {
            console.log('\nForce exiting...');
            process.exit(1);
          }
          isShuttingDown = true;
          console.log(`\n[${signal}] Shutting down gracefully...`);
          try {
            if (daemon) {
              await daemon.stop();
              daemon = null;
            }
            if (machineClient) {
              await machineClient.disconnect();
              machineClient = null;
            }
            console.log('[Cleanup] Session ended in database');
            await cleanup();
          } catch (error) {
            console.error('[Cleanup] Error during shutdown:', error);
          }
          process.exit(0);
        };

        process.on('SIGINT', () => {
          gracefulShutdown('SIGINT').catch(console.error);
        });

        process.on('SIGTERM', () => {
          gracefulShutdown('SIGTERM').catch(console.error);
        });

        spinner.update('Registering machine...');

        // Register machine
        const machineManager = new MachineManager({ supabase });
        const machine = await machineManager.registerMachine(
          user.id,
          options.name,
          config.getMachineId()
        );

        // Save machine ID for future use
        config.setMachineId(machine.id);

        spinner.update('Connecting to realtime...');

        // Create machine-level realtime client
        machineClient = new MachineRealtimeClient({
          supabase,
          machineId: machine.id,
        });

        const connected = await machineClient.connect();

        spinner.stop();

        if (!connected) {
          logger.error(
            'Failed to connect to realtime. Check your network connection.'
          );
          process.exit(1);
        }

        logger.info('');
        logger.info('✓ TermBridge is ready!');
        logger.info(`  Machine: ${machine.name}`);
        if (sleepState.caffeinateProcess) {
          logger.info(
            `  Sleep prevention: ${sleepState.pmsetEnabled ? 'Lid-closed mode' : 'Basic mode'}`
          );
        }
        logger.info('');
        logger.info('Open the mobile app to start a session.');
        logger.info('Press Ctrl+C to stop.');
        logger.info('');

        // Handle incoming commands from mobile
        machineClient.on('command', async (cmd: MachineCommand) => {
          if (cmd.type === 'start-session') {
            // Stop existing session if one is running
            if (daemon) {
              logger.info('Stopping existing session to start a new one...');
              try {
                await daemon.stop();
              } catch {
                // Silently handle stop errors
              }
              daemon = null;
            }

            logger.info('Starting session (requested from mobile)...');

            try {
              daemon = new Daemon({
                supabase,
                userId: user.id,
                machineId: machine.id,
                machineName: options.name,
                cwd: process.cwd(),
                hybrid: false,
              });

              daemon.on('started', async ({ session }) => {
                logger.info(`  Session: ${session.id.slice(0, 8)}...`);
                logger.info('  Mobile sync: Enabled');
                logger.info('');

                await machineClient?.broadcastSessionStarted(
                  session.id,
                  process.cwd()
                );
              });

              daemon.on('error', (error: Error) => {
                logger.error(`Session error: ${error.message}`);
              });

              daemon.on('mobile-disconnected', async () => {
                logger.info('Mobile disconnected. Ending session...');
                try {
                  await daemon?.stop();
                } catch {
                  // Silently handle stop errors - stopped handler handles the rest
                }
              });

              daemon.on('stopped', async () => {
                const sessionId = daemon?.getSession()?.id;
                daemon = null;

                if (sessionId) {
                  await machineClient?.broadcastSessionEnded(sessionId);
                }

                logger.info('Session ended.');
                logger.info('');
                logger.info('Waiting for next session request...');
                logger.info('');
              });

              await daemon.start();
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
              logger.error(`Failed to start session: ${errorMessage}`);
              await machineClient?.broadcastError(errorMessage);
              daemon = null;
            }
          }

          if (cmd.type === 'stop-session') {
            if (daemon) {
              logger.info('Stopping session (requested from mobile)...');
              try {
                await daemon.stop();
              } catch {
                // Silently handle stop errors
              }
              daemon = null;
            }
          }
        });
      } catch (error) {
        if (error instanceof ConfigurationError) {
          spinner.stop();
          logger.error(error.message);
          process.exit(1);
        }
        spinner.fail('Failed to start');
        logger.error(
          `${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  return command;
}
