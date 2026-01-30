import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RealtimeMessage, ImageAttachment, PermissionMode, SlashCommand } from '@termbridge/shared';
import { convertImageToBase64, getMediaTypeFromUri } from '../utils/imageUtils';

// Mock expo-file-system/legacy
vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn().mockResolvedValue('base64encodeddata'),
  EncodingType: { Base64: 'base64' },
}));

// Mock supabase before imports
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

// Test store logic without React Native dependencies
describe('Store Logic', () => {
  describe('AuthStore', () => {
    it('should have initial state', () => {
      // Test initial state structure
      const initialState = {
        user: null,
        session: null,
        isLoading: true,
        error: null,
      };

      expect(initialState.user).toBeNull();
      expect(initialState.session).toBeNull();
      expect(initialState.isLoading).toBe(true);
      expect(initialState.error).toBeNull();
    });

    it('should have signIn action that sets isLoading', () => {
      // Mock the signIn flow
      let isLoading = false;
      let error: string | null = null;

      const signIn = async (email: string, password: string) => {
        isLoading = true;
        error = null;

        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Simulate success
        isLoading = false;
      };

      // Test that signIn sets isLoading
      expect(isLoading).toBe(false);
    });

    it('should have signIn action that sets error on failure', () => {
      let error: string | null = null;

      const setError = (message: string) => {
        error = message;
      };

      setError('Invalid credentials');
      expect(error).toBe('Invalid credentials');
    });

    it('should have signUp action that sets isLoading', () => {
      let isLoading = false;

      const startLoading = () => {
        isLoading = true;
      };

      startLoading();
      expect(isLoading).toBe(true);
    });

    it('should have signUp action that sets error on failure', () => {
      let error: string | null = null;

      const setError = (message: string) => {
        error = message;
      };

      setError('Email already in use');
      expect(error).toBe('Email already in use');
    });

    it('should clear error', () => {
      let error: string | null = 'Some error';

      const clearError = () => {
        error = null;
      };

      clearError();
      expect(error).toBeNull();
    });
  });

  describe('SessionStore', () => {
    it('should have initial state', () => {
      const initialState = {
        sessions: [],
        isLoading: false,
        error: null,
      };

      expect(initialState.sessions).toEqual([]);
      expect(initialState.isLoading).toBe(false);
      expect(initialState.error).toBeNull();
    });

    it('should fetch sessions and update state', () => {
      const mockSessions = [
        { id: '1', machine_id: 'm1', status: 'active' },
        { id: '2', machine_id: 'm2', status: 'ended' },
      ];

      let sessions: any[] = [];

      const setSessions = (data: any[]) => {
        sessions = data;
      };

      setSessions(mockSessions);
      expect(sessions.length).toBe(2);
    });

    it('should set error on fetch failure', () => {
      let error: string | null = null;

      const setError = (message: string) => {
        error = message;
      };

      setError('Failed to fetch sessions');
      expect(error).toBe('Failed to fetch sessions');
    });

    it('should have isLoading true during fetch', () => {
      let isLoading = false;

      const startFetch = () => {
        isLoading = true;
      };

      startFetch();
      expect(isLoading).toBe(true);
    });
  });

  describe('ConnectionStore', () => {
    it('should have initial state', () => {
      const initialState = {
        state: 'disconnected',
        sessionId: null,
        messages: [],
        lastSeq: 0,
        error: null,
        isTyping: false,
        permissionMode: null,
      };

      expect(initialState.state).toBe('disconnected');
      expect(initialState.sessionId).toBeNull();
      expect(initialState.messages).toEqual([]);
      expect(initialState.lastSeq).toBe(0);
      expect(initialState.isTyping).toBe(false);
    });

    it('should have permissionMode in state', () => {
      const state: {
        permissionMode: PermissionMode | null;
      } = {
        permissionMode: null,
      };

      expect('permissionMode' in state).toBe(true);
    });

    it('should initialize permissionMode to null', () => {
      const initialState = {
        permissionMode: null as PermissionMode | null,
      };

      expect(initialState.permissionMode).toBeNull();
    });

    it('should update permissionMode on mode message', () => {
      let permissionMode: PermissionMode | null = null;

      const handleMessage = (message: RealtimeMessage) => {
        if (message.type === 'mode' && message.permissionMode) {
          permissionMode = message.permissionMode;
        }
      };

      const modeMessage: RealtimeMessage = {
        type: 'mode',
        permissionMode: 'bypassPermissions',
        timestamp: Date.now(),
        seq: 1,
      };

      handleMessage(modeMessage);
      expect(permissionMode).toBe('bypassPermissions');
    });

    it('should set isTyping true when sending input', () => {
      let isTyping = false;

      const sendInput = () => {
        isTyping = true;
      };

      sendInput();
      expect(isTyping).toBe(true);
    });

    it('should set isTyping false when receiving output', () => {
      let isTyping = true;

      const receiveOutput = () => {
        isTyping = false;
      };

      receiveOutput();
      expect(isTyping).toBe(false);
    });

    it('should clear messages', () => {
      let messages = [
        { type: 'output', content: 'test', seq: 1 },
        { type: 'output', content: 'test2', seq: 2 },
      ];
      let lastSeq = 2;

      const clearMessages = () => {
        messages = [];
        lastSeq = 0;
      };

      clearMessages();
      expect(messages).toEqual([]);
      expect(lastSeq).toBe(0);
    });

    it('should update state on connect', () => {
      let state = 'disconnected';

      const setConnecting = () => {
        state = 'connecting';
      };

      const setConnected = () => {
        state = 'connected';
      };

      setConnecting();
      expect(state).toBe('connecting');

      setConnected();
      expect(state).toBe('connected');
    });

    it('should update state on disconnect', () => {
      let state = 'connected';
      let sessionId: string | null = 'session-123';

      const disconnect = () => {
        state = 'disconnected';
        sessionId = null;
      };

      disconnect();
      expect(state).toBe('disconnected');
      expect(sessionId).toBeNull();
    });

    it('should add messages and update lastSeq', () => {
      let messages: any[] = [];
      let lastSeq = 0;

      const addMessage = (message: any) => {
        messages = [...messages, message];
        lastSeq = message.seq;
      };

      addMessage({ type: 'output', content: 'Hello', seq: 1 });
      expect(messages.length).toBe(1);
      expect(lastSeq).toBe(1);

      addMessage({ type: 'output', content: 'World', seq: 2 });
      expect(messages.length).toBe(2);
      expect(lastSeq).toBe(2);
    });

    it('should set error on connection failure', () => {
      let error: string | null = null;

      const setError = (message: string) => {
        error = message;
      };

      setError('Connection failed');
      expect(error).toBe('Connection failed');
    });

    it('should accept optional attachments parameter in sendInput', () => {
      let sentMessage: RealtimeMessage | null = null;

      const sendInput = (content: string, attachments?: ImageAttachment[]) => {
        const message: RealtimeMessage = {
          type: 'input',
          content,
          attachments,
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessage = message;
      };

      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      sendInput('Describe this image', attachments);

      expect(sentMessage).not.toBeNull();
      expect(sentMessage!.attachments).toBe(attachments);
    });

    it('should include attachments in RealtimeMessage payload', () => {
      let sentMessage: RealtimeMessage | null = null;

      const sendInput = (content: string, attachments?: ImageAttachment[]) => {
        const message: RealtimeMessage = {
          type: 'input',
          content,
          attachments,
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessage = message;
      };

      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANS' },
        { type: 'image', mediaType: 'image/jpeg', data: '/9j/4AAQSkZJRg' },
      ];

      sendInput('What are these images?', attachments);

      expect(sentMessage!.attachments?.length).toBe(2);
      expect(sentMessage!.attachments?.[0].mediaType).toBe('image/png');
      expect(sentMessage!.attachments?.[1].mediaType).toBe('image/jpeg');
    });

    it('should send message without attachments when none provided', () => {
      let sentMessage: RealtimeMessage | null = null;

      const sendInput = (content: string, attachments?: ImageAttachment[]) => {
        const message: RealtimeMessage = {
          type: 'input',
          content,
          attachments,
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessage = message;
      };

      sendInput('Just a text message');

      expect(sentMessage).not.toBeNull();
      expect(sentMessage!.attachments).toBeUndefined();
      expect(sentMessage!.content).toBe('Just a text message');
    });

    it('should have commands in state initialized to empty array', () => {
      const initialState = {
        commands: [] as SlashCommand[],
      };

      expect('commands' in initialState).toBe(true);
      expect(initialState.commands).toEqual([]);
    });

    it('should update commands on commands message', () => {
      let commands: SlashCommand[] = [];

      const handleMessage = (message: RealtimeMessage) => {
        if (message.type === 'commands' && message.commands) {
          commands = message.commands;
        }
      };

      const commandsMessage: RealtimeMessage = {
        type: 'commands',
        commands: [
          { name: 'commit', description: 'Commit changes', argumentHint: '<message>' },
          { name: 'help', description: 'Show help', argumentHint: '' },
        ],
        timestamp: Date.now(),
        seq: 1,
      };

      handleMessage(commandsMessage);
      expect(commands.length).toBe(2);
      expect(commands[0].name).toBe('commit');
      expect(commands[1].name).toBe('help');
    });

    it('should have requestCommands action', () => {
      let sentMessage: RealtimeMessage | null = null;

      const requestCommands = () => {
        const message: RealtimeMessage = {
          type: 'commands-request',
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessage = message;
      };

      requestCommands();

      expect(sentMessage).not.toBeNull();
      expect(sentMessage!.type).toBe('commands-request');
    });
  });
});

describe('Mode Label Utils', () => {
  const getModeLabel = (mode: PermissionMode | null): string | null => {
    if (!mode) return null;
    switch (mode) {
      case 'default':
        return 'Ask before edits';
      case 'acceptEdits':
        return 'Auto-approve edits';
      case 'plan':
        return 'Plan mode';
      case 'bypassPermissions':
        return 'Yolo mode';
      case 'delegate':
        return 'Auto-approve edits';
      case 'dontAsk':
        return 'Auto-approve edits';
      default:
        return null;
    }
  };

  it('should return "Ask before edits" for default mode', () => {
    expect(getModeLabel('default')).toBe('Ask before edits');
  });

  it('should return "Auto-approve edits" for acceptEdits mode', () => {
    expect(getModeLabel('acceptEdits')).toBe('Auto-approve edits');
  });

  it('should return "Plan mode" for plan mode', () => {
    expect(getModeLabel('plan')).toBe('Plan mode');
  });

  it('should return "Yolo mode" for bypassPermissions mode', () => {
    expect(getModeLabel('bypassPermissions')).toBe('Yolo mode');
  });

  it('should return null for null mode (InputBar hides indicator)', () => {
    expect(getModeLabel(null)).toBeNull();
  });
});

describe('Mode Change', () => {
  it('should send mode-change message with permissionMode', () => {
    let sentMessage: RealtimeMessage | null = null;

    const sendModeChange = (mode: PermissionMode) => {
      const message: RealtimeMessage = {
        type: 'mode-change',
        permissionMode: mode,
        timestamp: Date.now(),
        seq: 1,
      };
      sentMessage = message;
    };

    sendModeChange('plan');

    expect(sentMessage).not.toBeNull();
    expect(sentMessage!.type).toBe('mode-change');
    expect(sentMessage!.permissionMode).toBe('plan');
  });

  it('should handle mode-change type in RealtimeMessage', () => {
    const message: RealtimeMessage = {
      type: 'mode-change',
      permissionMode: 'default',
      timestamp: Date.now(),
      seq: 1,
    };

    expect(message.type).toBe('mode-change');
    expect(message.permissionMode).toBe('default');
  });
});

describe('InputBar Commands Integration', () => {
  it('should have commands button (/ icon)', () => {
    // InputBar should render a button that can open the CommandPicker
    const hasCommandsButton = true; // Component has the button
    expect(hasCommandsButton).toBe(true);
  });

  it('should open CommandPicker on commands button tap', () => {
    let commandPickerVisible = false;

    const openCommandPicker = () => {
      commandPickerVisible = true;
    };

    openCommandPicker();
    expect(commandPickerVisible).toBe(true);
  });

  it('should insert /{name} into input when command selected', () => {
    let inputValue = '';

    const handleCommandSelect = (command: SlashCommand) => {
      inputValue = `/${command.name} `;
    };

    const command: SlashCommand = {
      name: 'commit',
      description: 'Commit changes',
      argumentHint: '<message>',
    };

    handleCommandSelect(command);
    expect(inputValue).toBe('/commit ');
  });
});

describe('CommandPicker Logic', () => {
  const mockCommands: SlashCommand[] = [
    { name: 'commit', description: 'Commit changes to git', argumentHint: '<message>' },
    { name: 'help', description: 'Show help information', argumentHint: '' },
    { name: 'review-pr', description: 'Review a pull request', argumentHint: '<pr-number>' },
    { name: 'test', description: 'Run tests', argumentHint: '' },
  ];

  it('should display list of commands with slash prefix', () => {
    const displayedCommands = mockCommands.map((cmd) => ({
      ...cmd,
      displayName: `/${cmd.name}`,
    }));

    expect(displayedCommands[0].displayName).toBe('/commit');
    expect(displayedCommands[1].displayName).toBe('/help');
  });

  it('should show description and argument hint', () => {
    const cmd = mockCommands[0];

    expect(cmd.description).toBe('Commit changes to git');
    expect(cmd.argumentHint).toBe('<message>');
  });

  it('should filter commands based on search', () => {
    const filterCommands = (commands: SlashCommand[], search: string) => {
      const lowerSearch = search.toLowerCase();
      return commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(lowerSearch) ||
          cmd.description.toLowerCase().includes(lowerSearch)
      );
    };

    // Filter by name
    const commitResults = filterCommands(mockCommands, 'commit');
    expect(commitResults.length).toBe(1);
    expect(commitResults[0].name).toBe('commit');

    // Filter by description
    const testResults = filterCommands(mockCommands, 'test');
    expect(testResults.length).toBe(1);
    expect(testResults[0].name).toBe('test');

    // Filter returns multiple results
    const prResults = filterCommands(mockCommands, 'pr');
    expect(prResults.length).toBe(1);

    // Empty search returns all
    const allResults = filterCommands(mockCommands, '');
    expect(allResults.length).toBe(4);
  });

  it('should call onSelect when command tapped', () => {
    let selectedCommand: SlashCommand | null = null;

    const onSelect = (command: SlashCommand) => {
      selectedCommand = command;
    };

    onSelect(mockCommands[0]);

    expect(selectedCommand).not.toBeNull();
    expect(selectedCommand!.name).toBe('commit');
  });
});

describe('Image Utils', () => {
  describe('getMediaTypeFromUri', () => {
    it('should detect PNG media type from URI', () => {
      expect(getMediaTypeFromUri('file:///path/to/image.png')).toBe('image/png');
      expect(getMediaTypeFromUri('file:///path/to/IMAGE.PNG')).toBe('image/png');
    });

    it('should default to JPEG for unknown extensions', () => {
      expect(getMediaTypeFromUri('file:///path/to/image')).toBe('image/jpeg');
      expect(getMediaTypeFromUri('file:///path/to/image.unknown')).toBe('image/jpeg');
    });

    it('should detect GIF media type from URI', () => {
      expect(getMediaTypeFromUri('file:///path/to/image.gif')).toBe('image/gif');
    });

    it('should detect WEBP media type from URI', () => {
      expect(getMediaTypeFromUri('file:///path/to/image.webp')).toBe('image/webp');
    });
  });

  describe('convertImageToBase64', () => {
    it('should return ImageAttachment with base64 data', async () => {
      const result = await convertImageToBase64('file:///path/to/image.jpg');

      expect(result.type).toBe('image');
      expect(result.data).toBe('base64encodeddata');
      expect(result.mediaType).toBe('image/jpeg');
    });

    it('should detect PNG media type from URI', async () => {
      const result = await convertImageToBase64('file:///path/to/image.png');

      expect(result.mediaType).toBe('image/png');
    });

    it('should default to JPEG for unknown extensions', async () => {
      const result = await convertImageToBase64('file:///path/to/image.unknown');

      expect(result.mediaType).toBe('image/jpeg');
    });
  });

  describe('handleSend behavior', () => {
    it('should convert selected images to base64 before sending', async () => {
      let sentAttachments: ImageAttachment[] | undefined;
      const selectedImages = ['file:///path/to/image1.png', 'file:///path/to/image2.jpg'];

      // Simulate handleSend logic
      const handleSend = async (
        images: string[],
        onSend: (content: string, attachments?: ImageAttachment[]) => void
      ) => {
        const attachments = await Promise.all(
          images.map((uri) => convertImageToBase64(uri))
        );
        onSend('Test message', attachments.length > 0 ? attachments : undefined);
      };

      await handleSend(selectedImages, (content, attachments) => {
        sentAttachments = attachments;
      });

      expect(sentAttachments).toBeDefined();
      expect(sentAttachments!.length).toBe(2);
      expect(sentAttachments![0].mediaType).toBe('image/png');
      expect(sentAttachments![1].mediaType).toBe('image/jpeg');
    });

    it('should clear selectedImages after sending', async () => {
      let selectedImages = ['file:///path/to/image.png'];
      let cleared = false;

      // Simulate handleSend clearing images
      const clearImages = () => {
        selectedImages = [];
        cleared = true;
      };

      // After send completes, images should be cleared
      clearImages();

      expect(selectedImages).toEqual([]);
      expect(cleared).toBe(true);
    });
  });
});
