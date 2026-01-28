import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useConnectionStore } from '../stores/connectionStore';

interface InputBarProps {
  disabled?: boolean;
}

const QUICK_ACTIONS = [
  { label: 'y', value: 'y\n' },
  { label: 'n', value: 'n\n' },
  { label: '↵', value: '\n' },
  { label: '^C', value: '\x03' },
  { label: 'Tab', value: '\t' },
];

export function InputBar({ disabled }: InputBarProps) {
  const [input, setInput] = useState('');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { sendInput, state } = useConnectionStore();
  const isDisabled = disabled || state !== 'connected';

  const handleSend = async () => {
    if (input.trim() && !isDisabled) {
      await sendInput(input + '\n');
      setInput('');
    }
  };

  const handleQuickAction = async (value: string) => {
    if (!isDisabled) {
      await sendInput(value);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={[styles.container, isDark && styles.containerDark]}>
        {/* Quick actions */}
        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[
                styles.quickAction,
                isDark && styles.quickActionDark,
                isDisabled && styles.quickActionDisabled,
              ]}
              onPress={() => handleQuickAction(action.value)}
              disabled={isDisabled}
            >
              <Text
                style={[
                  styles.quickActionText,
                  isDark && styles.quickActionTextDark,
                  isDisabled && styles.quickActionTextDisabled,
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input row */}
        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              isDark && styles.inputDark,
              isDisabled && styles.inputDisabled,
            ]}
            value={input}
            onChangeText={setInput}
            placeholder="Enter command..."
            placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            editable={!isDisabled}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              isDisabled && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={isDisabled || !input.trim()}
          >
            <Text
              style={[
                styles.sendButtonText,
                (isDisabled || !input.trim()) && styles.sendButtonTextDisabled,
              ]}
            >
              Send
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  containerDark: {
    backgroundColor: '#171717',
    borderTopColor: '#374151',
  },
  quickActions: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 8,
  },
  quickAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  quickActionDark: {
    backgroundColor: '#262626',
  },
  quickActionDisabled: {
    opacity: 0.5,
  },
  quickActionText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#1f2937',
  },
  quickActionTextDark: {
    color: '#e5e5e5',
  },
  quickActionTextDisabled: {
    color: '#9ca3af',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#1f2937',
  },
  inputDark: {
    backgroundColor: '#262626',
    color: '#e5e5e5',
  },
  inputDisabled: {
    opacity: 0.5,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  sendButtonTextDisabled: {
    color: '#e5e7eb',
  },
});
