# TermBridge

Remote control for Claude Code CLI from your mobile device.

## Overview

TermBridge allows you to monitor and control Claude Code CLI sessions running on your computer from your iOS or Android device. See terminal output in real-time, send inputs, and receive push notifications when tasks complete or require attention.

## Tech Stack

- **CLI Wrapper**: Node.js + TypeScript + node-pty
- **Mobile App**: React Native + Expo (iOS & Android)
- **Backend**: Supabase (Realtime, Auth, Database, Edge Functions)
- **Monorepo**: pnpm workspaces

## Features

- 📱 Real-time terminal output streaming to mobile
- ⌨️ Send input from mobile to CLI
- 🔔 Push notifications for task completion, errors, and input prompts
- 🔄 Automatic reconnection with exponential backoff
- 🌙 Dark mode support
- 🔐 Secure authentication with Supabase

## Project Structure

```
TermBridge/
├── apps/
│   ├── cli/              # CLI wrapper package
│   └── mobile/           # Expo mobile app
├── packages/
│   └── shared/           # Shared types and constants
├── supabase/
│   ├── migrations/       # Database schema
│   └── functions/        # Edge functions
├── tests/
│   └── integration/      # Integration tests
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Supabase account
- Expo account (for push notifications)

### Installation

**Using npm (Recommended)**

```bash
npm install -g @tongil_kim/termbridge
```

**Using Homebrew (macOS)**

```bash
brew tap TongilKim/termbridge
brew install termbridge
```

**From source**

```bash
# Clone the repository
git clone https://github.com/TongilKim/termbridge.git
cd termbridge

# Install dependencies
pnpm install

# Build packages
pnpm build
```

### Environment Setup

Create `.env` files:

```bash
# apps/cli/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Supabase Setup

1. Create a new Supabase project
2. Run the database migration:
   ```bash
   supabase db push
   ```
3. Deploy the edge function:
   ```bash
   supabase functions deploy send-notification
   ```

### CLI Usage

```bash
# First-time setup (configure Supabase credentials)
termbridge setup

# Authenticate
termbridge login

# Start a session (hybrid mode - local + remote)
termbridge start

# Start in daemon mode (background only)
termbridge start --daemon

# Check status
termbridge status

# Stop the daemon
termbridge stop
```

### Mobile App

```bash
cd apps/mobile

# Start development server
pnpm start

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

## Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @termbridge/cli test
pnpm --filter @termbridge/mobile test
pnpm --filter @termbridge/tests test
```

### Test Summary

- **Total Tests**: 196
  - Shared Package: 16 tests
  - CLI Package: 105 tests
  - Mobile App: 16 tests
  - Integration Tests: 59 tests

## Architecture

### CLI Flow

1. User runs `termbridge start`
2. CLI spawns Claude Code process via node-pty
3. CLI creates session in Supabase database
4. PTY output is broadcast to Supabase Realtime channel
5. Mobile app connects to the same channel to receive output
6. Input from mobile is sent via Realtime to CLI
7. CLI writes input to PTY

### Push Notifications

1. CLI detects trigger patterns in output (errors, completion, input required)
2. CLI calls Supabase Edge Function
3. Edge Function fetches user's push tokens
4. Notifications sent via Expo Push API

## License

MIT
