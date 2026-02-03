# TermBridge

Remote monitoring and control for Claude Code CLI from your mobile device.

## Installation

**npm (Recommended)**

```bash
npm install -g @tongil_kim/termbridge
```

**Homebrew (macOS)**

```bash
brew tap TongilKim/termbridge
brew install termbridge
```

## Setup

Run the setup command to configure your Supabase credentials:

```bash
termbridge setup
```

You'll need:
- **Supabase Project URL**: Dashboard → Settings → API (e.g., `https://xxxx.supabase.co`)
- **Supabase Anon Key**: Dashboard → Settings → API → `anon` `public` key

## Usage

```bash
# Authenticate
termbridge login

# Start a session
termbridge start

# Start in daemon mode (background)
termbridge start --daemon

# Prevent sleep while running (macOS)
termbridge start --prevent-sleep

# Check status
termbridge status

# Stop the daemon
termbridge stop
```

## Features

- Real-time terminal output streaming to mobile
- Send input from mobile to CLI
- Push notifications for task completion, errors, and input prompts
- Automatic reconnection with exponential backoff
- Sleep prevention option for long-running tasks

## Requirements

- Node.js 18+
- Claude Code CLI installed

## Links

- [GitHub Repository](https://github.com/TongilKim/termbridge)
- [Mobile App](https://github.com/TongilKim/termbridge/tree/main/apps/mobile)

## License

MIT
