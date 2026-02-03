# TermBridge

Remote monitoring and control for Claude Code CLI from your mobile device.

## Installation

```bash
npm install -g @tongil_kim/termbridge
```

## Usage

```bash
# First-time setup (configure Supabase credentials)
termbridge setup

# Authenticate
termbridge login

# Start a session
termbridge start

# Start in daemon mode (background)
termbridge start --daemon

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

## Requirements

- Node.js 18+
- Claude Code CLI installed

## Links

- [GitHub Repository](https://github.com/TongilKim/termbridge)
- [Mobile App](https://github.com/TongilKim/termbridge/tree/main/apps/mobile)

## License

MIT
