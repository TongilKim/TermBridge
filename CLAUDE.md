# TermBridge - Project Context

## Overview

TermBridge is a CLI tool for remote monitoring and control of Claude Code sessions. It connects to Supabase for real-time communication.

## Project Structure

```
apps/
  cli/              # Main CLI package (@tongil_kim/termbridge)
    src/
      commands/     # CLI commands (start, stop, status, login, setup)
      daemon/       # Background daemon logic
      realtime/     # Supabase realtime connection
      utils/        # Config, logger utilities
packages/
  shared/           # Shared types (termbridge-shared)
```

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for TDD methodology and coding standards.

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter @tongil_kim/termbridge build

# Run tests
pnpm --filter @tongil_kim/termbridge test
```

### Local Dev

Run in separate terminals:

```bash
# Terminal 1 - CLI
cd apps/cli && pnpm start

# Terminal 2 - Mobile
cd apps/mobile && pnpm start
# Or with tunnel: pnpm start:tunnel
```

## Release Procedure

### Automatic Release (Recommended)

1. Update version in `apps/cli/package.json`
2. Commit: `git commit -m "chore: Bump version to X.Y.Z"`
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub Actions automatically publishes to npm and updates Homebrew formula

### Manual Release (If tag trigger fails)

```bash
gh workflow run release.yml -f version=X.Y.Z
gh run watch
```

### Verify Release

```bash
npm view @tongil_kim/termbridge version
curl -s https://raw.githubusercontent.com/TongilKim/homebrew-termbridge/main/Formula/termbridge.rb | head -6
```

### Required GitHub Secrets

- `NPM_TOKEN`: npm access token for publishing
- `HOMEBREW_TAP_TOKEN`: GitHub PAT with repo scope for homebrew-termbridge
