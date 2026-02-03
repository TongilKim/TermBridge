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
        logger.info('');
        logger.info('To find your credentials:');
        logger.info('  1. Go to your Supabase project dashboard');
        logger.info('  2. Settings > General > Copy "Project URL"');
        logger.info('  3. Settings > API Keys > Copy "anon public" key');
        logger.info('');

        const url = await prompt('Supabase Project URL (e.g., https://xxxx.supabase.co): ');
        if (!url) {
          logger.error('Supabase URL is required');
          process.exit(1);
        }

        // Validate URL format
        try {
          const parsedUrl = new URL(url);

          // Check if it's a dashboard URL (common mistake)
          if (parsedUrl.hostname === 'supabase.com') {
            logger.error('');
            logger.error('This looks like a dashboard URL, not the API URL.');
            logger.error('');
            logger.error('Please use the Project URL from Settings > API, which looks like:');
            logger.error('  https://your-project-id.supabase.co');
            logger.error('');
            logger.error('NOT the dashboard URL:');
            logger.error('  https://supabase.com/dashboard/project/...');
            process.exit(1);
          }

          // Validate it ends with .supabase.co
          if (!parsedUrl.hostname.endsWith('.supabase.co')) {
            logger.error('');
            logger.error('Invalid Supabase URL format.');
            logger.error('The URL should end with .supabase.co');
            logger.error('Example: https://your-project-id.supabase.co');
            process.exit(1);
          }
        } catch {
          logger.error('Invalid URL format. Please enter a valid URL (e.g., https://xxxx.supabase.co)');
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
