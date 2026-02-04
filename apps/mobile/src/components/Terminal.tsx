import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useConnectionStore } from '../stores/connectionStore';
import type { RealtimeMessage } from 'termbridge-shared';

interface TerminalProps {
  maxLines?: number;
}

interface GroupedMessage {
  type: 'input' | 'output' | 'system';
  content: string;
  timestamp: number;
}

// Avatar components using text-based icons
function UserAvatar({ isDark }: { isDark: boolean }) {
  return (
    <View style={[avatarStyles.avatar, avatarStyles.userAvatar]}>
      <Text style={avatarStyles.avatarText}>U</Text>
    </View>
  );
}

function ClaudeAvatar({ isDark }: { isDark: boolean }) {
  return (
    <View style={[avatarStyles.avatar, avatarStyles.claudeAvatar, isDark && avatarStyles.claudeAvatarDark]}>
      <Text style={[avatarStyles.avatarText, avatarStyles.claudeAvatarText]}>C</Text>
    </View>
  );
}

// Tool usage badge component
function ToolBadge({ toolName, isDark }: { toolName: string; isDark: boolean }) {
  return (
    <View style={[toolBadgeStyles.badge, isDark && toolBadgeStyles.badgeDark]}>
      <Text style={[toolBadgeStyles.icon]}>⚡</Text>
      <Text style={[toolBadgeStyles.text, isDark && toolBadgeStyles.textDark]}>
        {toolName}
      </Text>
    </View>
  );
}

// Parse tool usage from content
function parseToolUsage(content: string): { tools: string[]; cleanContent: string } {
  const toolPattern = /\[Using tool: ([^\]]+)\]/g;
  const completedPattern = /\[Tool ([^\]]+) completed\]/g;

  const tools: string[] = [];
  let match;

  while ((match = toolPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }

  // Remove tool messages from content
  const cleanContent = content
    .replace(toolPattern, '')
    .replace(completedPattern, '')
    .trim();

  return { tools, cleanContent };
}

export function Terminal({ maxLines = 1000 }: TerminalProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { messages, state, isTyping } = useConnectionStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isTyping]);

  // Group consecutive messages of the same type
  const groupedMessages = useMemo(() => {
    const groups: GroupedMessage[] = [];
    let currentGroup: GroupedMessage | null = null;

    // Sort messages by timestamp to ensure correct chronological order
    // (seq can't be used because mobile and CLI have separate seq counters)
    const sortedMessages = [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const msg of sortedMessages) {
      const msgType = msg.type === 'input' ? 'input' :
                      msg.type === 'output' ? 'output' : 'system';

      if (currentGroup && currentGroup.type === msgType) {
        // Append to current group
        currentGroup.content += msg.content || '';
      } else {
        // Start new group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          type: msgType,
          content: msg.content || '',
          timestamp: msg.timestamp,
        };
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }, [messages]);

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {state !== 'connected' && (
        <View style={[styles.statusBanner, styles[`status_${state}`]]}>
          <Text style={styles.statusText}>
            {state === 'connecting'
              ? 'Connecting...'
              : state === 'reconnecting'
                ? 'Reconnecting...'
                : 'Disconnected'}
          </Text>
        </View>
      )}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {groupedMessages.length === 0 && !isTyping ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
              Send a message to start chatting with Claude
            </Text>
          </View>
        ) : (
          <>
            {groupedMessages.map((group, index) => (
              <AnimatedBubble key={`${group.timestamp}-${index}`}>
                <MessageBubble
                  message={group}
                  isDark={isDark}
                />
              </AnimatedBubble>
            ))}
            {isTyping && (
              <AnimatedBubble>
                <TypingIndicator isDark={isDark} />
              </AnimatedBubble>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Animated wrapper for fade-in effect
function AnimatedBubble({ children }: { children: React.ReactNode }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
    >
      {children}
    </Animated.View>
  );
}

interface TypingIndicatorProps {
  isDark: boolean;
}

function TypingIndicator({ isDark }: TypingIndicatorProps) {
  return (
    <View style={styles.messageRow}>
      <ClaudeAvatar isDark={isDark} />
      <View style={styles.bubbleContainerClaude}>
        <View style={[styles.typingBubble, isDark && styles.typingBubbleDark]}>
          <ActivityIndicator size="small" color={isDark ? '#9ca3af' : '#6b7280'} />
          <Text style={[styles.typingText, isDark && styles.typingTextDark]}>
            Claude is thinking...
          </Text>
        </View>
      </View>
    </View>
  );
}

interface MessageBubbleProps {
  message: GroupedMessage;
  isDark: boolean;
}

function MessageBubble({ message, isDark }: MessageBubbleProps) {
  const isUser = message.type === 'input';
  const isSystem = message.type === 'system';

  // Clean up the content - remove excessive whitespace for user messages
  const rawContent = isUser
    ? message.content.trim()
    : message.content;

  // Parse tool usage for Claude messages
  const { tools, cleanContent } = isUser
    ? { tools: [], cleanContent: rawContent }
    : parseToolUsage(rawContent);

  // Skip empty messages (but show if there are tools)
  if (!cleanContent.trim() && tools.length === 0) {
    return null;
  }

  // Format timestamp
  const formattedTime = formatTimestamp(message.timestamp);

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={[styles.systemText, isDark && styles.systemTextDark]}>
          {rawContent}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {!isUser && <ClaudeAvatar isDark={isDark} />}
      <View
        style={[
          styles.bubbleContainer,
          isUser ? styles.bubbleContainerUser : styles.bubbleContainerClaude,
        ]}
      >
        {/* Tool badges */}
        {tools.length > 0 && (
          <View style={styles.toolBadgesContainer}>
            {tools.map((tool, index) => (
              <ToolBadge key={index} toolName={tool} isDark={isDark} />
            ))}
          </View>
        )}

        {/* Message bubble */}
        {cleanContent.trim() && (
          <View
            style={[
              styles.bubble,
              isUser
                ? [styles.bubbleUser, isDark && styles.bubbleUserDark]
                : [styles.bubbleClaude, isDark && styles.bubbleClaudeDark],
            ]}
          >
            {isUser ? (
              <Text style={[styles.bubbleTextUser, isDark && styles.bubbleTextUserDark]}>
                {cleanContent}
              </Text>
            ) : (
              <ClaudeMessage content={cleanContent} isDark={isDark} />
            )}
          </View>
        )}

        {/* Timestamp and status */}
        <View style={[styles.timestampRow, isUser && styles.timestampRowUser]}>
          <Text
            style={[
              styles.timestamp,
              isDark && styles.timestampDark,
            ]}
          >
            {isUser ? 'You' : 'Claude'} · {formattedTime}
          </Text>
          {isUser && (
            <Text style={[styles.statusIndicator, isDark && styles.statusIndicatorDark]}>
              ✓
            </Text>
          )}
        </View>
      </View>
      {isUser && <UserAvatar isDark={isDark} />}
    </View>
  );
}

interface ClaudeMessageProps {
  content: string;
  isDark: boolean;
}

function ClaudeMessage({ content, isDark }: ClaudeMessageProps) {
  const copyToClipboard = useCallback(async (text: string) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(text);
  }, []);

  // Check if content contains code blocks
  const hasCodeBlock = content.includes('```');

  // Markdown styles
  const markdownStyles = useMemo(() => ({
    body: {
      color: isDark ? '#e5e5e5' : '#1f2937',
      fontSize: 14,
      lineHeight: 20,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
    },
    heading1: {
      color: isDark ? '#ffffff' : '#111827',
      fontSize: 20,
      fontWeight: 'bold' as const,
      marginBottom: 8,
      marginTop: 12,
    },
    heading2: {
      color: isDark ? '#ffffff' : '#111827',
      fontSize: 18,
      fontWeight: 'bold' as const,
      marginBottom: 6,
      marginTop: 10,
    },
    heading3: {
      color: isDark ? '#ffffff' : '#111827',
      fontSize: 16,
      fontWeight: 'bold' as const,
      marginBottom: 4,
      marginTop: 8,
    },
    strong: {
      fontWeight: 'bold' as const,
    },
    em: {
      fontStyle: 'italic' as const,
    },
    code_inline: {
      backgroundColor: isDark ? '#374151' : '#f3f4f6',
      color: isDark ? '#fbbf24' : '#dc2626',
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 13,
    },
    code_block: {
      backgroundColor: isDark ? '#1e1e1e' : '#1f2937',
      color: isDark ? '#d4d4d4' : '#e5e7eb',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 13,
      marginVertical: 8,
      overflow: 'hidden' as const,
    },
    fence: {
      backgroundColor: isDark ? '#1e1e1e' : '#1f2937',
      color: isDark ? '#d4d4d4' : '#e5e7eb',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 13,
      marginVertical: 8,
    },
    blockquote: {
      backgroundColor: isDark ? '#374151' : '#f9fafb',
      borderLeftColor: isDark ? '#6b7280' : '#d1d5db',
      borderLeftWidth: 4,
      paddingLeft: 12,
      paddingVertical: 4,
      marginVertical: 8,
    },
    list_item: {
      marginBottom: 4,
    },
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    link: {
      color: '#3b82f6',
    },
    hr: {
      backgroundColor: isDark ? '#4b5563' : '#e5e7eb',
      height: 1,
      marginVertical: 12,
    },
  }), [isDark]);

  // Custom code block renderer with copy button
  const renderCodeBlock = useCallback((node: any, children: any, parent: any, styles: any) => {
    const codeContent = node.content || '';
    return (
      <View key={node.key} style={codeBlockStyles.container}>
        <View style={[codeBlockStyles.header, isDark && codeBlockStyles.headerDark]}>
          <Text style={[codeBlockStyles.language, isDark && codeBlockStyles.languageDark]}>
            {node.sourceInfo || 'code'}
          </Text>
          <TouchableOpacity
            onPress={() => copyToClipboard(codeContent)}
            style={codeBlockStyles.copyButton}
          >
            <Text style={[codeBlockStyles.copyText, isDark && codeBlockStyles.copyTextDark]}>
              Copy
            </Text>
          </TouchableOpacity>
        </View>
        <View style={[codeBlockStyles.codeContainer, isDark && codeBlockStyles.codeContainerDark]}>
          <Text style={[codeBlockStyles.code, isDark && codeBlockStyles.codeDark]}>
            {codeContent}
          </Text>
        </View>
      </View>
    );
  }, [isDark, copyToClipboard]);

  return (
    <Markdown
      style={markdownStyles}
      rules={{
        fence: renderCodeBlock,
        code_block: renderCodeBlock,
      }}
    >
      {content}
    </Markdown>
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const timeStr = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  if (isToday) {
    return timeStr;
  }

  // If not today, include the date
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day} ${timeStr}`;
}

const avatarStyles = StyleSheet.create({
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  userAvatar: {
    backgroundColor: '#3b82f6',
  },
  claudeAvatar: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  claudeAvatarDark: {
    backgroundColor: '#262626',
    borderColor: '#404040',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  claudeAvatarText: {
    color: '#d97706',
  },
});

const toolBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
    alignSelf: 'flex-start',
    gap: 4,
  },
  badgeDark: {
    backgroundColor: '#422006',
  },
  icon: {
    fontSize: 10,
  },
  text: {
    fontSize: 11,
    fontWeight: '500',
    color: '#92400e',
  },
  textDark: {
    color: '#fbbf24',
  },
});

const codeBlockStyles = StyleSheet.create({
  container: {
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerDark: {
    backgroundColor: '#2d2d2d',
  },
  language: {
    color: '#9ca3af',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  languageDark: {
    color: '#9ca3af',
  },
  copyButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  copyText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  copyTextDark: {
    color: '#9ca3af',
  },
  codeContainer: {
    backgroundColor: '#1f2937',
    padding: 12,
  },
  codeContainerDark: {
    backgroundColor: '#1e1e1e',
  },
  code: {
    color: '#e5e7eb',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  codeDark: {
    color: '#d4d4d4',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  statusBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  status_disconnected: {
    backgroundColor: '#ef4444',
  },
  status_connecting: {
    backgroundColor: '#f59e0b',
  },
  status_reconnecting: {
    backgroundColor: '#f59e0b',
  },
  status_connected: {
    backgroundColor: '#22c55e',
  },
  statusText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },
  emptyTextDark: {
    color: '#9ca3af',
  },
  // Message row with avatar
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    gap: 8,
    alignItems: 'flex-start',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  // Bubble container
  bubbleContainer: {
    maxWidth: '75%',
    flexShrink: 1,
  },
  bubbleContainerUser: {
    alignItems: 'flex-end',
  },
  bubbleContainerClaude: {
    alignItems: 'flex-start',
  },
  // Tool badges container
  toolBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  // Bubble styles
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  bubbleUserDark: {
    backgroundColor: '#2563eb',
  },
  bubbleClaude: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  bubbleClaudeDark: {
    backgroundColor: '#1f1f1f',
    borderColor: '#333333',
  },
  // Typing indicator
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  typingBubbleDark: {
    backgroundColor: '#1f1f1f',
    borderColor: '#333333',
  },
  typingText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  typingTextDark: {
    color: '#9ca3af',
  },
  // Text styles
  bubbleTextUser: {
    fontSize: 15,
    lineHeight: 20,
    color: '#ffffff',
  },
  bubbleTextUserDark: {
    color: '#ffffff',
  },
  // Timestamp row
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  timestampRowUser: {
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
  },
  timestampDark: {
    color: '#6b7280',
  },
  // Status indicator
  statusIndicator: {
    fontSize: 11,
    color: '#22c55e',
  },
  statusIndicatorDark: {
    color: '#4ade80',
  },
  // System message
  systemContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  systemText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  systemTextDark: {
    color: '#9ca3af',
  },
});
