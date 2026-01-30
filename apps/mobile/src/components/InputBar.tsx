import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useConnectionStore } from '../stores/connectionStore';

interface InputBarProps {
  disabled?: boolean;
}

const MIN_INPUT_HEIGHT = 36;
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
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await sendInput(input + '\n');
      setInput('');
      setInputHeight(MIN_INPUT_HEIGHT);
    }
  };

  const handleContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const contentHeight = event.nativeEvent.contentSize.height;
      const newHeight = Math.min(Math.max(contentHeight + 12, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
      setInputHeight(newHeight);
    },
    []
  );

  const canSend = input.trim() && !isDisabled;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.inputCard, isDark && styles.inputCardDark]}>
        {/* Input area */}
        <TextInput
          style={[
            styles.input,
            isDark && styles.inputDark,
            { height: inputHeight },
          ]}
          value={input}
          onChangeText={setInput}
          placeholder={isDisabled ? 'Session disconnected' : 'Message Claude...'}
          placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
          editable={!isDisabled}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          autoCapitalize="none"
          autoCorrect={false}
          multiline={true}
          textAlignVertical="top"
          onContentSizeChange={handleContentSizeChange}
          blurOnSubmit={false}
        />

        {/* Bottom toolbar */}
        <View style={[styles.toolbar, isDark && styles.toolbarDark]}>
          <View style={styles.toolbarLeft} />
          <TouchableOpacity
            style={[
              styles.sendButton,
              isDark && styles.sendButtonDark,
              canSend && styles.sendButtonActive,
            ]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <View style={[styles.sendArrow, canSend && styles.sendArrowActive]}>
              <View style={[styles.arrowUp, canSend && styles.arrowUpActive]} />
              <View style={[styles.arrowStem, canSend && styles.arrowStemActive]} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  inputCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  inputCardDark: {
    backgroundColor: '#1f1f1f',
    borderColor: '#374151',
  },
  input: {
    minHeight: MIN_INPUT_HEIGHT,
    maxHeight: MAX_INPUT_HEIGHT,
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 20,
    paddingTop: 0,
    paddingBottom: 0,
  },
  inputDark: {
    color: '#e5e5e5',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 8,
  },
  toolbarDark: {
    borderTopColor: '#374151',
  },
  toolbarLeft: {
    flex: 1,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDark: {
    backgroundColor: '#374151',
  },
  sendButtonActive: {
    backgroundColor: '#d4a574',
  },
  sendArrow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrowActive: {},
  arrowUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#9ca3af',
  },
  arrowUpActive: {
    borderBottomColor: '#ffffff',
  },
  arrowStem: {
    width: 2,
    height: 6,
    backgroundColor: '#9ca3af',
    marginTop: -1,
  },
  arrowStemActive: {
    backgroundColor: '#ffffff',
  },
});
