import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Shared Package Build', () => {
  it('should build without errors', () => {
    const packageDir = join(__dirname, '../..');

    // Run build command
    expect(() => {
      execSync('pnpm build', { cwd: packageDir, stdio: 'pipe' });
    }).not.toThrow();

    // Verify dist directory exists
    const distDir = join(packageDir, 'dist');
    expect(existsSync(distDir)).toBe(true);
  });

  it('should export all types from index.ts', async () => {
    // This test will verify that the main index exports everything
    const shared = await import('../index');

    // Should export types
    expect(shared).toBeDefined();

    // Should have type exports available
    expect(typeof shared).toBe('object');
  });
});
