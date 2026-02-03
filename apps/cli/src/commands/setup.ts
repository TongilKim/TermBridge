import { Command } from 'commander';
import * as readline from 'readline';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export function createSetupCommand(): Command {
  const command = new Command('setup');

  command
    .description('Configure TermBridge with Supabase credentials')
    .action(async () => {
      const config = new Config();
      const logger = new Logger();

      try {
        logger.info('TermBridge Setup');
        logger.info('================');
        logger.info('');
        logger.info('Enter your Supabase credentials to connect TermBridge.');
        logger.info('You can find these in your Supabase project settings.');
        logger.info('');

        const url = await prompt('Supabase URL: ');
        if (!url) {
          logger.error('Supabase URL is required');
          process.exit(1);
        }

        // Validate URL format
        try {
          new URL(url);
        } catch {
          logger.error('Invalid URL format. Please enter a valid URL (e.g., https://xxx.supabase.co)');
          process.exit(1);
        }

        const anonKey = await prompt('Supabase Anon Key: ');
        if (!anonKey) {
          logger.error('Supabase Anon Key is required');
          process.exit(1);
        }

        config.setSupabaseCredentials({ url, anonKey });

        logger.info('');
        logger.info('✓ Configuration saved successfully!');
        logger.info('');
        logger.info('Next steps:');
        logger.info('  1. Run "termbridge login" to authenticate');
        logger.info('  2. Run "termbridge start" to begin a session');
      } catch (error) {
        logger.error(
          `Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  return command;
}
