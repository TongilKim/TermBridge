import React, { useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import Anser from 'anser';
import { useConnectionStore } from '../stores/connectionStore';

interface TerminalProps {
  maxLines?: number;
}

export function Terminal({ maxLines = 1000 }: TerminalProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { messages, state } = useConnectionStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: false });
    }
  }, [messages]);

  // Combine all messages and truncate to maxLines
  const fullOutput = messages
    .map((m) => m.content || '')
    .join('')
    .split('\n')
    .slice(-maxLines)
    .join('\n');

  // Parse ANSI codes
  const parsedOutput = Anser.ansiToJson(fullOutput, {
    json: true,
    remove_empty: true,
  });

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
        <Text style={[styles.terminalText, isDark && styles.terminalTextDark]}>
          {parsedOutput.map((part, index) => (
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
      </ScrollView>
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

  return colors[colorName] || (isDark ? '#ffffff' : '#000000');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
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
  },
  terminalText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
    color: '#1f2937',
  },
  terminalTextDark: {
    color: '#e5e5e5',
  },
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
