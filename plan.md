# TermBridge - TDD Implementation Plan

This plan follows Test-Driven Development. Each test should be implemented one at a time.
Mark tests with [x] when passing, [ ] when pending.

---

## Phase 1: Shared Types Package

### 1.1 Package Setup
- [x] Test: Shared package builds without errors
- [x] Test: Shared package exports all types from index.ts

### 1.2 Message Types
- [x] Test: MessageType union type includes 'output', 'input', 'error', 'system'
- [x] Test: Message interface has required fields (id, session_id, type, content, created_at)
- [x] Test: RealtimeMessage interface has required fields (type, content, timestamp, seq)
- [x] Test: RealtimeMessage type includes 'ping' and 'pong' message types

### 1.3 Session Types
- [x] Test: SessionStatus union type includes 'active', 'paused', 'ended'
- [x] Test: Session interface has required fields (id, machine_id, status, started_at)
- [x] Test: Session interface has optional fields (working_directory, ended_at)

### 1.4 Machine Types
- [x] Test: MachineStatus union type includes 'online', 'offline'
- [x] Test: Machine interface has required fields (id, user_id, name, status, created_at)
- [x] Test: Machine interface has optional fields (hostname, last_seen_at)

### 1.5 Constants
- [x] Test: REALTIME_CHANNELS.sessionOutput returns correct channel name format
- [x] Test: REALTIME_CHANNELS.sessionInput returns correct channel name format
- [x] Test: REALTIME_CHANNELS.machinePresence returns correct channel name format
- [x] Test: NOTIFICATION_TYPES contains TASK_COMPLETE, ERROR, INPUT_REQUIRED, CONNECTION_LOST

---

## Phase 2: CLI Package

### 2.1 Configuration
- [ ] Test: Config loads Supabase URL from environment
- [ ] Test: Config loads Supabase anon key from environment
- [ ] Test: Config throws error when SUPABASE_URL missing
- [ ] Test: Config throws error when SUPABASE_ANON_KEY missing
- [ ] Test: Config validates SUPABASE_URL format (must be valid URL)
- [ ] Test: Config can save machine ID to file
- [ ] Test: Config can load machine ID from file
- [ ] Test: Config creates config directory if not exists

### 2.2 Logger
- [ ] Test: Logger outputs info level messages
- [ ] Test: Logger outputs error level messages
- [ ] Test: Logger outputs warn level messages
- [ ] Test: Logger outputs debug level messages when DEBUG=true
- [ ] Test: Logger includes timestamp in output
- [ ] Test: Logger includes log level in output
- [ ] Test: Logger can be silenced in test mode

### 2.3 PTY Manager
- [ ] Test: PtyManager can be instantiated
- [ ] Test: PtyManager.spawn() starts a process
- [ ] Test: PtyManager emits 'output' event when process writes to stdout
- [ ] Test: PtyManager emits 'exit' event when process exits
- [ ] Test: PtyManager emits 'exit' with correct exit code
- [ ] Test: PtyManager.write() sends data to the process
- [ ] Test: PtyManager.kill() terminates the process
- [ ] Test: PtyManager.getBuffer() returns accumulated output
- [ ] Test: PtyManager.resize() changes terminal dimensions
- [ ] Test: PtyManager uses xterm-256color as terminal type

### 2.4 Connection Manager
- [ ] Test: ConnectionManager initial state is 'disconnected'
- [ ] Test: ConnectionManager.start() changes state to 'connected'
- [ ] Test: ConnectionManager.stop() changes state to 'disconnected'
- [ ] Test: ConnectionManager emits 'stateChange' on state transitions
- [ ] Test: ConnectionManager.getState() returns current state
- [ ] Test: ConnectionManager starts heartbeat timer on start()
- [ ] Test: ConnectionManager stops heartbeat timer on stop()
- [ ] Test: ConnectionManager sends ping at heartbeat interval (15s)
- [ ] Test: ConnectionManager detects timeout when no pong received (30s)
- [ ] Test: ConnectionManager.onPong() updates lastPongAt timestamp
- [ ] Test: ConnectionManager changes to 'reconnecting' on timeout
- [ ] Test: ConnectionManager attempts reconnect on disconnect
- [ ] Test: ConnectionManager uses exponential backoff for retries
- [ ] Test: ConnectionManager adds jitter to backoff delay (±20%)
- [ ] Test: ConnectionManager emits 'reconnecting' with attempt count
- [ ] Test: ConnectionManager emits 'reconnected' on successful reconnect
- [ ] Test: ConnectionManager emits 'maxRetriesExceeded' after 10 attempts
- [ ] Test: ConnectionManager resets retry count on successful connection

### 2.5 Message Handlers
- [ ] Test: Handler processes output message correctly
- [ ] Test: Handler processes input message correctly
- [ ] Test: Handler processes ping message and responds with pong
- [ ] Test: Handler processes pong message and updates connection
- [ ] Test: Handler processes system message correctly
- [ ] Test: Handler ignores unknown message types
- [ ] Test: Handler emits events for each message type

### 2.6 Realtime Client
- [ ] Test: RealtimeClient can be instantiated with credentials
- [ ] Test: RealtimeClient.connect() subscribes to output channel
- [ ] Test: RealtimeClient.connect() subscribes to input channel
- [ ] Test: RealtimeClient.sendOutput() broadcasts message with seq number
- [ ] Test: RealtimeClient.sendOutput() includes timestamp
- [ ] Test: RealtimeClient increments seq number on each send
- [ ] Test: RealtimeClient emits 'input' event when receiving input message
- [ ] Test: RealtimeClient.disconnect() unsubscribes from channels
- [ ] Test: RealtimeClient handles connection errors gracefully

### 2.7 Session Manager
- [ ] Test: SessionManager can create a new session in database
- [ ] Test: SessionManager.create() returns session with ID
- [ ] Test: SessionManager.create() sets status to 'active'
- [ ] Test: SessionManager.create() stores working_directory
- [ ] Test: SessionManager can end a session (update status to 'ended')
- [ ] Test: SessionManager.end() sets ended_at timestamp
- [ ] Test: SessionManager can get session by ID
- [ ] Test: SessionManager.get() returns null for non-existent session

### 2.8 Machine Manager
- [ ] Test: MachineManager can register a new machine
- [ ] Test: MachineManager.register() uses hostname as name
- [ ] Test: MachineManager.register() upserts on hostname conflict
- [ ] Test: MachineManager can update machine status to 'online'
- [ ] Test: MachineManager can update machine status to 'offline'
- [ ] Test: MachineManager.updateLastSeen() updates last_seen_at
- [ ] Test: MachineManager returns machine ID after register

### 2.9 Daemon
- [ ] Test: Daemon initializes PTY manager
- [ ] Test: Daemon initializes Realtime client
- [ ] Test: Daemon initializes Session manager
- [ ] Test: Daemon initializes Machine manager
- [ ] Test: Daemon.start() registers machine
- [ ] Test: Daemon.start() creates new session
- [ ] Test: Daemon.start() spawns Claude Code process
- [ ] Test: Daemon.start() connects to realtime
- [ ] Test: Daemon pipes PTY output to realtime
- [ ] Test: Daemon pipes PTY output to local stdout (hybrid mode)
- [ ] Test: Daemon pipes realtime input to PTY
- [ ] Test: Daemon.stop() kills PTY process
- [ ] Test: Daemon.stop() ends session
- [ ] Test: Daemon.stop() sets machine offline
- [ ] Test: Daemon.stop() disconnects realtime
- [ ] Test: Daemon detects task completion pattern (/Task completed|Done!|Finished/i)
- [ ] Test: Daemon detects error pattern (/Error:|Exception:|Failed/i)
- [ ] Test: Daemon detects input required pattern (/\?\s*$|y\/n|Enter.*:/i)
- [ ] Test: Daemon sends notification on pattern match

### 2.10 Process Management
- [ ] Test: Daemon writes PID file on start (~/.termbridge/daemon.pid)
- [ ] Test: Daemon removes PID file on stop
- [ ] Test: Daemon creates ~/.termbridge directory if not exists
- [ ] Test: Daemon handles SIGINT gracefully (calls stop)
- [ ] Test: Daemon handles SIGTERM gracefully (calls stop)
- [ ] Test: Daemon prevents multiple instances via lock file
- [ ] Test: Daemon returns error if already running

### 2.11 CLI Commands
- [ ] Test: 'login' command prompts for email
- [ ] Test: 'login' command prompts for password
- [ ] Test: 'login' command authenticates with Supabase
- [ ] Test: 'login' command saves session tokens to config
- [ ] Test: 'login' command handles invalid credentials
- [ ] Test: 'login' command shows success message
- [ ] Test: 'start' command starts daemon in hybrid mode
- [ ] Test: 'start' command requires login first
- [ ] Test: 'start --daemon' runs in background mode
- [ ] Test: 'stop' command stops daemon gracefully
- [ ] Test: 'stop' command shows error if not running
- [ ] Test: 'status' command shows 'running' when daemon active
- [ ] Test: 'status' command shows 'stopped' when daemon inactive
- [ ] Test: 'status' command shows current session info
- [ ] Test: 'status' command shows connection state

---

## Phase 3: Supabase Backend

### 3.1 Database Schema - Tables
- [ ] Test: machines table exists with correct columns
- [ ] Test: machines.id is UUID primary key
- [ ] Test: machines.user_id references auth.users
- [ ] Test: machines.hostname has unique constraint
- [ ] Test: sessions table exists with correct columns
- [ ] Test: sessions.machine_id references machines with CASCADE delete
- [ ] Test: sessions.status has CHECK constraint
- [ ] Test: messages table exists with correct columns
- [ ] Test: messages.session_id references sessions with CASCADE delete
- [ ] Test: messages.type has CHECK constraint
- [ ] Test: push_tokens table exists with correct columns
- [ ] Test: push_tokens.token has unique constraint
- [ ] Test: push_tokens.platform has CHECK constraint

### 3.2 Database Schema - Indexes
- [ ] Test: Index exists on machines(user_id)
- [ ] Test: Index exists on sessions(machine_id)
- [ ] Test: Index exists on messages(session_id)
- [ ] Test: Index exists on messages(created_at)

### 3.3 Database Schema - RLS
- [ ] Test: RLS enabled on machines table
- [ ] Test: RLS enabled on sessions table
- [ ] Test: RLS enabled on messages table
- [ ] Test: RLS enabled on push_tokens table
- [ ] Test: RLS policy allows user to read own machines
- [ ] Test: RLS policy prevents user from reading other's machines
- [ ] Test: RLS policy allows user to read own sessions
- [ ] Test: RLS policy prevents user from reading other's sessions
- [ ] Test: RLS policy allows user to read own messages
- [ ] Test: RLS policy allows user to manage own push tokens

### 3.4 Database Schema - Realtime
- [ ] Test: Realtime publication includes messages table

### 3.5 Edge Function: send-notification
- [ ] Test: Function returns 400 if userId missing
- [ ] Test: Function returns 400 if type missing
- [ ] Test: Function returns 200 with sent:0 if no push tokens
- [ ] Test: Function fetches user's push tokens from database
- [ ] Test: Function sends notification to Expo Push API
- [ ] Test: Function sends to multiple tokens if user has multiple devices
- [ ] Test: Function includes sessionId in notification data
- [ ] Test: Function handles Expo API errors gracefully

---

## Phase 4: Mobile App

### 4.1 Supabase Service
- [ ] Test: Supabase client initializes with correct URL
- [ ] Test: Supabase client initializes with correct anon key
- [ ] Test: Supabase client uses SecureStore adapter for getItem
- [ ] Test: Supabase client uses SecureStore adapter for setItem
- [ ] Test: Supabase client uses SecureStore adapter for removeItem
- [ ] Test: Supabase client has autoRefreshToken enabled
- [ ] Test: Supabase client has persistSession enabled

### 4.2 Auth Store
- [ ] Test: Initial state has null user
- [ ] Test: Initial state has null session
- [ ] Test: Initial state has isLoading false
- [ ] Test: Initial state has error null
- [ ] Test: signIn sets isLoading true during operation
- [ ] Test: signIn updates user and session state on success
- [ ] Test: signIn sets error state on failure
- [ ] Test: signIn sets isLoading false after completion
- [ ] Test: signOut clears user and session state
- [ ] Test: signOut clears error state
- [ ] Test: signUp creates new user
- [ ] Test: signUp sets error state on failure

### 4.3 Session Store
- [ ] Test: Initial state has empty sessions array
- [ ] Test: Initial state has isLoading false
- [ ] Test: Initial state has error null
- [ ] Test: fetchSessions sets isLoading true during fetch
- [ ] Test: fetchSessions populates sessions from database
- [ ] Test: fetchSessions filters by current user's machines
- [ ] Test: fetchSessions sets error state on failure
- [ ] Test: fetchSessions sets isLoading false after completion
- [ ] Test: refreshSessions clears and re-fetches sessions

### 4.4 Connection Store
- [ ] Test: Initial state is 'disconnected'
- [ ] Test: Initial sessionId is null
- [ ] Test: Initial messages array is empty
- [ ] Test: Initial lastSeq is -1
- [ ] Test: connect() sets state to 'connecting'
- [ ] Test: connect() sets sessionId
- [ ] Test: connect() subscribes to session output channel
- [ ] Test: connect() subscribes to session input channel
- [ ] Test: connect() sets state to 'connected' on success
- [ ] Test: disconnect() unsubscribes from output channel
- [ ] Test: disconnect() unsubscribes from input channel
- [ ] Test: disconnect() resets state to 'disconnected'
- [ ] Test: disconnect() clears sessionId
- [ ] Test: sendInput() broadcasts input message to channel
- [ ] Test: sendInput() includes timestamp in message
- [ ] Test: addMessage() appends to messages array
- [ ] Test: addMessage() updates lastSeq
- [ ] Test: addMessage() detects sequence gap (logs warning)
- [ ] Test: clearMessages() empties messages array
- [ ] Test: clearMessages() resets lastSeq to -1

### 4.5 Hooks
- [ ] Test: useSession returns session data
- [ ] Test: useSession returns loading state
- [ ] Test: useSession returns error state
- [ ] Test: useSession fetches on mount
- [ ] Test: useRealtime subscribes on mount
- [ ] Test: useRealtime unsubscribes on unmount
- [ ] Test: useRealtime handles reconnection
- [ ] Test: useConnection returns connection state
- [ ] Test: useConnection returns connect method
- [ ] Test: useConnection returns disconnect method
- [ ] Test: useConnection returns sendInput method

### 4.6 Terminal Component
- [ ] Test: Terminal renders without crashing
- [ ] Test: Terminal displays messages from connection store
- [ ] Test: Terminal filters for output and error messages only
- [ ] Test: Terminal parses ANSI codes for colors
- [ ] Test: Terminal renders bold text correctly
- [ ] Test: Terminal auto-scrolls to bottom on new message
- [ ] Test: Terminal shows status banner when disconnected
- [ ] Test: Terminal shows status banner when connecting
- [ ] Test: Terminal shows status banner when reconnecting
- [ ] Test: Terminal hides status banner when connected

### 4.7 InputBar Component
- [ ] Test: InputBar renders text input field
- [ ] Test: InputBar renders send button
- [ ] Test: InputBar renders quick action button 'y'
- [ ] Test: InputBar renders quick action button 'n'
- [ ] Test: InputBar renders quick action button 'Enter'
- [ ] Test: InputBar renders quick action button 'Ctrl+C'
- [ ] Test: InputBar calls sendInput on send button press
- [ ] Test: InputBar appends newline to input on send
- [ ] Test: InputBar clears input after sending
- [ ] Test: InputBar disables input when not connected
- [ ] Test: InputBar disables send button when not connected
- [ ] Test: InputBar disables quick actions when not connected
- [ ] Test: Quick action 'y' sends "y\n"
- [ ] Test: Quick action 'n' sends "n\n"
- [ ] Test: Quick action 'Enter' sends "\n"
- [ ] Test: Quick action 'Ctrl+C' sends "\x03"

### 4.8 SessionCard Component
- [ ] Test: SessionCard renders machine name
- [ ] Test: SessionCard renders working directory
- [ ] Test: SessionCard renders status indicator for 'active'
- [ ] Test: SessionCard renders status indicator for 'ended'
- [ ] Test: SessionCard renders last activity time
- [ ] Test: SessionCard is touchable
- [ ] Test: SessionCard navigates to session detail on press

### 4.9 EmptyState Component
- [ ] Test: EmptyState renders message text
- [ ] Test: EmptyState renders call to action text
- [ ] Test: EmptyState shows CLI instructions

### 4.10 Auth Screens
- [ ] Test: Login screen renders email input field
- [ ] Test: Login screen renders password input field
- [ ] Test: Login screen renders submit button
- [ ] Test: Login screen renders link to register
- [ ] Test: Login screen calls signIn on submit
- [ ] Test: Login screen shows loading during signIn
- [ ] Test: Login screen shows error on invalid credentials
- [ ] Test: Login screen navigates to main on success
- [ ] Test: Register screen renders email input field
- [ ] Test: Register screen renders password input field
- [ ] Test: Register screen renders confirm password field
- [ ] Test: Register screen renders submit button
- [ ] Test: Register screen calls signUp on submit
- [ ] Test: Register screen validates password match
- [ ] Test: Register screen shows error on mismatch
- [ ] Test: Register screen shows error on signup failure

### 4.11 Sessions List Screen
- [ ] Test: Sessions list fetches sessions on mount
- [ ] Test: Sessions list renders SessionCard for each session
- [ ] Test: Sessions list shows EmptyState when no sessions
- [ ] Test: Sessions list supports pull-to-refresh
- [ ] Test: Sessions list shows loading indicator during fetch

### 4.12 Session Detail Screen
- [ ] Test: Session detail connects to session on mount
- [ ] Test: Session detail disconnects on unmount
- [ ] Test: Session detail renders Terminal component
- [ ] Test: Session detail renders InputBar component
- [ ] Test: Session detail shows loading state while connecting

### 4.13 Settings Screen
- [ ] Test: Settings screen renders logout button
- [ ] Test: Settings screen logout calls signOut
- [ ] Test: Settings screen logout navigates to login
- [ ] Test: Settings screen shows notification toggle
- [ ] Test: Settings screen shows app version
- [ ] Test: Settings screen shows user email

### 4.14 Auth Guard
- [ ] Test: Auth guard checks auth state on mount
- [ ] Test: Auth guard shows loading while checking
- [ ] Test: Auth guard redirects to login when not authenticated
- [ ] Test: Auth guard allows access when authenticated
- [ ] Test: Auth guard subscribes to auth state changes

### 4.15 Notifications Service
- [ ] Test: registerForPushNotifications requests permissions
- [ ] Test: registerForPushNotifications gets Expo push token
- [ ] Test: registerForPushNotifications saves token to database
- [ ] Test: registerForPushNotifications handles permission denied
- [ ] Test: handleNotification parses notification data
- [ ] Test: handleNotification navigates to session on tap

---

## Phase 5: Integration Tests

### 5.1 CLI to Mobile Flow
- [ ] Test: CLI output appears in mobile terminal
- [ ] Test: Mobile input reaches CLI process
- [ ] Test: Session ends when CLI exits
- [ ] Test: Mobile shows session as 'ended' when CLI exits

### 5.2 Reconnection
- [ ] Test: CLI reconnects after network interruption
- [ ] Test: Mobile reconnects after network interruption
- [ ] Test: Messages are not lost during brief disconnection
- [ ] Test: Sequence numbers continue correctly after reconnect

### 5.3 Push Notifications
- [ ] Test: Mobile receives notification on task complete
- [ ] Test: Mobile receives notification on error
- [ ] Test: Mobile receives notification on input required
- [ ] Test: Tapping notification opens correct session
- [ ] Test: Notification shows correct title and body

### 5.4 Edge Cases
- [ ] Test: Large output buffer doesn't crash mobile app
- [ ] Test: Rapid messages don't cause UI freeze
- [ ] Test: Multiple sessions from same machine work correctly
- [ ] Test: Session can be resumed after app restart
- [ ] Test: Session list updates when new session created

### 5.5 Error Handling
- [ ] Test: CLI shows error when Supabase unreachable
- [ ] Test: Mobile shows error when session not found
- [ ] Test: Both apps handle token expiration gracefully
- [ ] Test: Mobile shows error when connection fails

---

## Progress Tracking

- **Phase 1**: 18 tests
- **Phase 2**: 93 tests
- **Phase 3**: 30 tests
- **Phase 4**: 102 tests
- **Phase 5**: 21 tests

**Total Tests: 264**
**Passing: 0**
**Remaining: 264**
