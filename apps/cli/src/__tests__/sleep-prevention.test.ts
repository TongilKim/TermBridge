import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type ChildProcess } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

// Mock readline
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

import {
  enableSleepPrevention,
  disableSleepPrevention,
  startCaffeinate,
  stopCaffeinate,
  cleanup,
  isMacOS,
  type SleepPreventionState,
} from '../utils/sleep-prevention.js';
import { execSync, spawn } from 'child_process';

describe('Sleep Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enableSleepPrevention', () => {
    it('should call sudo pmset with disablesleep 1', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      const result = enableSleepPrevention();

      expect(execSync).toHaveBeenCalledWith('sudo pmset -a disablesleep 1', { stdio: 'inherit' });
      expect(result).toBe(true);
    });

    it('should return false when execSync throws', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('sudo failed');
      });

      const result = enableSleepPrevention();

      expect(result).toBe(false);
    });
  });

  describe('disableSleepPrevention', () => {
    it('should call sudo pmset with disablesleep 0', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      disableSleepPrevention();

      expect(execSync).toHaveBeenCalledWith('sudo pmset -a disablesleep 0', { stdio: 'inherit' });
    });

    it('should not throw when execSync fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('sudo failed');
      });

      expect(() => disableSleepPrevention()).not.toThrow();
    });
  });

  describe('startCaffeinate', () => {
    it('should spawn caffeinate with -i and -s flags', () => {
      const mockProcess = {
        on: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);

      const result = startCaffeinate();

      expect(spawn).toHaveBeenCalledWith('caffeinate', ['-i', '-s'], {
        stdio: 'ignore',
        detached: false,
      });
      expect(result).toBe(mockProcess);
    });
  });

  describe('stopCaffeinate', () => {
    it('should kill the process if provided', () => {
      const mockProcess = {
        kill: vi.fn(),
      } as unknown as ChildProcess;

      stopCaffeinate(mockProcess);

      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should do nothing if process is null', () => {
      expect(() => stopCaffeinate(null)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should stop caffeinate and disable pmset when enabled', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      const mockProcess = {
        kill: vi.fn(),
      } as unknown as ChildProcess;

      const state: SleepPreventionState = {
        caffeinateProcess: mockProcess,
        pmsetEnabled: true,
      };

      cleanup(state);

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(execSync).toHaveBeenCalledWith('sudo pmset -a disablesleep 0', { stdio: 'inherit' });
    });

    it('should only stop caffeinate when pmset is not enabled', () => {
      const mockProcess = {
        kill: vi.fn(),
      } as unknown as ChildProcess;

      const state: SleepPreventionState = {
        caffeinateProcess: mockProcess,
        pmsetEnabled: false,
      };

      cleanup(state);

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should handle null caffeinate process', () => {
      const state: SleepPreventionState = {
        caffeinateProcess: null,
        pmsetEnabled: false,
      };

      expect(() => cleanup(state)).not.toThrow();
    });
  });

  describe('isMacOS', () => {
    it('should return true on darwin platform', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      expect(isMacOS()).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return false on non-darwin platform', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      expect(isMacOS()).toBe(false);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });
});
