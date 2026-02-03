import { spawn, execSync, type ChildProcess } from 'child_process';
import * as readline from 'readline';

export interface SleepPreventionState {
  caffeinateProcess: ChildProcess | null;
  pmsetEnabled: boolean;
}

export async function promptYesNo(question: string): Promise<boolean> {
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

export function enableSleepPrevention(): boolean {
  try {
    execSync('sudo pmset -a disablesleep 1', { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

export function disableSleepPrevention(): void {
  try {
    execSync('sudo pmset -a disablesleep 0', { stdio: 'inherit' });
  } catch {
    // Ignore errors on cleanup
  }
}

export function startCaffeinate(): ChildProcess {
  const process = spawn('caffeinate', ['-i', '-s'], {
    stdio: 'ignore',
    detached: false,
  });

  return process;
}

export function stopCaffeinate(process: ChildProcess | null): void {
  if (process) {
    process.kill();
  }
}

export function cleanup(state: SleepPreventionState): void {
  stopCaffeinate(state.caffeinateProcess);
  if (state.pmsetEnabled) {
    disableSleepPrevention();
  }
}

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}
