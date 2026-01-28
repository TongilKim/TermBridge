import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface ConfigData {
  machineId?: string;
  sessionTokens?: {
    accessToken: string;
    refreshToken: string;
  };
}

export class Config {
  private configDir: string;
  private configFile: string;
  private data: ConfigData;

  constructor(configDir?: string) {
    this.configDir = configDir ?? join(homedir(), '.termbridge');
    this.configFile = join(this.configDir, 'config.json');
    this.data = this.loadConfig();
  }

  private loadConfig(): ConfigData {
    if (existsSync(this.configFile)) {
      try {
        return JSON.parse(readFileSync(this.configFile, 'utf-8'));
      } catch {
        return {};
      }
    }
    return {};
  }

  private saveConfig(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    writeFileSync(this.configFile, JSON.stringify(this.data, null, 2));
  }

  getSupabaseUrl(): string {
    const url = process.env['SUPABASE_URL'];
    if (!url) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error('SUPABASE_URL must be a valid URL');
    }

    return url;
  }

  getSupabaseAnonKey(): string {
    const key = process.env['SUPABASE_ANON_KEY'];
    if (!key) {
      throw new Error('SUPABASE_ANON_KEY environment variable is not set');
    }
    return key;
  }

  getMachineId(): string | undefined {
    return this.data.machineId;
  }

  setMachineId(machineId: string): void {
    this.data.machineId = machineId;
    this.saveConfig();
  }

  getSessionTokens(): ConfigData['sessionTokens'] | undefined {
    return this.data.sessionTokens;
  }

  setSessionTokens(tokens: ConfigData['sessionTokens']): void {
    this.data.sessionTokens = tokens;
    this.saveConfig();
  }

  // Alias for setSessionTokens
  setSession(tokens: { accessToken: string; refreshToken: string }): void {
    this.setSessionTokens(tokens);
  }

  clearSessionTokens(): void {
    delete this.data.sessionTokens;
    this.saveConfig();
  }
}

// Default singleton instance
let defaultConfig: Config | null = null;

export function getConfig(): Config {
  if (!defaultConfig) {
    defaultConfig = new Config();
  }
  return defaultConfig;
}
