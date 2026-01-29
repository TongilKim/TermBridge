import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
} from 'react-native';
import * as Haptics from 'expo-haptics';
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

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 120;

export function InputBar({ disabled }: InputBarProps) {
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { sendInput, state } = useConnectionStore();
  const isDisabled = disabled || state !== 'connected';

  const handleSend = async () => {
    if (input.trim() && !isDisabled) {
      // Haptic feedback on send
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await sendInput(input + '\n');
      setInput('');
      setInputHeight(MIN_INPUT_HEIGHT);
    }
  };

  const handleQuickAction = async (value: string) => {
    if (!isDisabled) {
      // Haptic feedback on quick action
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await sendInput(value);
    }
  };

  const handleContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const contentHeight = event.nativeEvent.contentSize.height;
      const newHeight = Math.min(Math.max(contentHeight + 16, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
      setInputHeight(newHeight);
    },
    []
  );

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
              { height: inputHeight },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            editable={!isDisabled}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            autoCapitalize="none"
            autoCorrect={false}
            multiline={true}
            textAlignVertical="center"
            onContentSizeChange={handleContentSizeChange}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              isDisabled && styles.sendButtonDisabled,
              !input.trim() && styles.sendButtonEmpty,
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
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: MIN_INPUT_HEIGHT,
    maxHeight: MAX_INPUT_HEIGHT,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f3f4f6',
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 20,
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
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  sendButtonEmpty: {
    backgroundColor: '#d1d5db',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  sendButtonTextDisabled: {
    color: '#f3f4f6',
  },
});
