import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import { Config, ConfigurationError } from '../utils/config.js';
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

function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    process.stdout.write(question);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    let password = '';

    const onData = (char: Buffer) => {
      const c = char.toString();

      if (c === '\n' || c === '\r') {
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(0);
      } else if (c === '\u007F' || c === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
        }
      } else {
        password += c;
      }
    };

    process.stdin.on('data', onData);
    process.stdin.resume();
  });
}

export function createLoginCommand(): Command {
  const command = new Command('login');

  command.description('Authenticate with TermBridge').action(async () => {
    const config = new Config();
    const logger = new Logger();

    try {
      config.requireConfiguration();

      const supabaseUrl = config.getSupabaseUrl();
      const supabaseKey = config.getSupabaseAnonKey();

      const supabase = createClient(supabaseUrl, supabaseKey);

      const email = await prompt('Email: ');
      const password = await promptHidden('Password: ');

      if (!email || !password) {
        logger.error('Email and password are required');
        process.exit(1);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error(`Login failed: ${error.message}`);
        process.exit(1);
      }

      if (data.user) {
        logger.info(`Logged in as ${data.user.email}`);

        // Store session tokens securely
        if (data.session) {
          config.setSession({
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          });
          logger.info('Session saved');
        }
      }
    } catch (error) {
      if (error instanceof ConfigurationError) {
        logger.error(error.message);
        process.exit(1);
      }
      logger.error(
        `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  });

  return command;
}
