import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import Anser from 'anser';
import { useConnectionStore } from '../stores/connectionStore';
import type { RealtimeMessage } from '@termbridge/shared';

interface TerminalProps {
  maxLines?: number;
}

interface GroupedMessage {
  type: 'input' | 'output' | 'system';
  content: string;
  timestamp: number;
}

export function Terminal({ maxLines = 1000 }: TerminalProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { messages, state } = useConnectionStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Group consecutive messages of the same type
  const groupedMessages = useMemo(() => {
    const groups: GroupedMessage[] = [];
    let currentGroup: GroupedMessage | null = null;

    for (const msg of messages) {
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
        {groupedMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
              Send a message to start chatting with Claude
            </Text>
          </View>
        ) : (
          groupedMessages.map((group, index) => (
            <MessageBubble
              key={`${group.timestamp}-${index}`}
              message={group}
              isDark={isDark}
            />
          ))
        )}
      </ScrollView>
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
  const content = isUser
    ? message.content.trim()
    : message.content;

  // Skip empty messages
  if (!content.trim()) {
    return null;
  }

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={[styles.systemText, isDark && styles.systemTextDark]}>
          {content}
        </Text>
      </View>
    );
  }

  // Parse ANSI codes for output messages
  const parsedContent = isUser
    ? null
    : Anser.ansiToJson(content, { json: true, remove_empty: true });

  return (
    <View
      style={[
        styles.bubbleContainer,
        isUser ? styles.bubbleContainerUser : styles.bubbleContainerClaude,
      ]}
    >
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
            {content}
          </Text>
        ) : (
          <Text style={[styles.bubbleTextClaude, isDark && styles.bubbleTextClaudeDark]}>
            {parsedContent?.map((part, index) => (
              <Text
                key={index}
                style={[
                  part.fg && { color: getAnsiColor(part.fg, isDark) },
                  part.bg && { backgroundColor: getAnsiColor(part.bg, isDark) },
                  part.decoration === 'bold' && styles.bold,
                  part.decoration === 'italic' && styles.italic,
                  part.decoration === 'underline' && styles.underline,
                ]}
              >
                {part.content}
              </Text>
            ))}
          </Text>
        )}
      </View>
      <Text
        style={[
          styles.timestamp,
          isDark && styles.timestampDark,
          isUser ? styles.timestampUser : styles.timestampClaude,
        ]}
      >
        {isUser ? 'You' : 'Claude'}
      </Text>
    </View>
  );
}

function getAnsiColor(colorName: string, isDark: boolean): string {
  const colors: Record<string, string> = {
    // Standard colors
    black: isDark ? '#000000' : '#000000',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: isDark ? '#ffffff' : '#1f2937',
    // Bright colors
    'bright-black': '#6b7280',
    'bright-red': '#f87171',
    'bright-green': '#4ade80',
    'bright-yellow': '#fde047',
    'bright-blue': '#60a5fa',
    'bright-magenta': '#c084fc',
    'bright-cyan': '#22d3ee',
    'bright-white': '#f9fafb',
  };

  return colors[colorName] || (isDark ? '#e5e5e5' : '#1f2937');
}

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
  // Bubble container
  bubbleContainer: {
    marginVertical: 4,
    maxWidth: '85%',
  },
  bubbleContainerUser: {
    alignSelf: 'flex-end',
  },
  bubbleContainerClaude: {
    alignSelf: 'flex-start',
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
  // Text styles
  bubbleTextUser: {
    fontSize: 15,
    lineHeight: 20,
    color: '#ffffff',
  },
  bubbleTextUserDark: {
    color: '#ffffff',
  },
  bubbleTextClaude: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1f2937',
    fontFamily: 'monospace',
  },
  bubbleTextClaudeDark: {
    color: '#e5e5e5',
  },
  // Timestamp / label
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
  },
  timestampDark: {
    color: '#6b7280',
  },
  timestampUser: {
    textAlign: 'right',
    marginRight: 4,
  },
  timestampClaude: {
    textAlign: 'left',
    marginLeft: 4,
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
  // Text decorations
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
});
