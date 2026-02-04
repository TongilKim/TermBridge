import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  Alert,
  Image,
  ScrollView,
  Text,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useConnectionStore } from '../stores/connectionStore';
import { convertImageToBase64 } from '../utils/imageUtils';
import { CommandPicker } from './CommandPicker';
import { ModelPicker } from './ModelPicker';
import type { PermissionMode, SlashCommand } from 'termbridge-shared';

// Format model identifier to friendly display name
function formatModelName(model: string | null): string {
  if (!model) return 'Model';
  // Handle SDK shorthand values
  if (model === 'default') return 'Sonnet 4';
  if (model === 'opus') return 'Opus';
  if (model === 'haiku') return 'Haiku';
  if (model === 'sonnet') return 'Sonnet 4';
  // Handle full model identifiers
  if (model.includes('opus-4')) return 'Opus 4';
  if (model.includes('sonnet-4-5')) return 'Sonnet 4.5';
  if (model.includes('sonnet-4-0') || model.includes('sonnet-4-2')) return 'Sonnet 4';
  if (model.includes('haiku')) return 'Haiku 3.5';
  // Fallback: extract model name from identifier
  const parts = model.split('-');
  if (parts.length >= 2) {
    return parts.slice(1, 3).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
  return model;
}

// Helper function to get human-readable mode label
function getModeLabel(mode: PermissionMode | null): string | null {
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
}

interface InputBarProps {
  disabled?: boolean;
}

const MIN_INPUT_HEIGHT = 36;
const MAX_INPUT_HEIGHT = 120;

export function InputBar({ disabled }: InputBarProps) {
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [showCommandPicker, setShowCommandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { sendInput, sendModeChange, sendModelChange, state, permissionMode, commands, isTyping, model, availableModels, isModelChanging } = useConnectionStore();
  const isDisabled = disabled || state !== 'connected' || isSending || isTyping;
  const modeLabel = getModeLabel(permissionMode);

  const handleModePress = () => {
    if (isDisabled) return;

    Alert.alert(
      'Permission Mode',
      'Select how Claude handles edits',
      [
        {
          text: 'Ask before edits',
          onPress: () => sendModeChange('default'),
        },
        {
          text: 'Auto-approve edits',
          onPress: () => sendModeChange('acceptEdits'),
        },
        {
          text: 'Plan mode',
          onPress: () => sendModeChange('plan'),
        },
        {
          text: '🚀 Yolo mode',
          onPress: () => sendModeChange('bypassPermissions'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleSend = async () => {
    if (!input.trim() || isDisabled || isSending) {
      return;
    }

    setIsSending(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // Convert images to base64 attachments
      const attachments = await Promise.all(
        selectedImages.map((uri) => convertImageToBase64(uri))
      );

      const messageContent = input.trim();
      setInput('');
      setSelectedImages([]);
      setInputHeight(MIN_INPUT_HEIGHT);

      await sendInput(messageContent + '\n', attachments.length > 0 ? attachments : undefined);
    } catch {
      // Error handling - silently fail
    } finally {
      setIsSending(false);
    }
  };

  const handleAttachment = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(
      'Add Attachment',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (permission.granted) {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) {
                setSelectedImages([...selectedImages, result.assets[0].uri]);
              }
            }
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permission.granted) {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: true,
                quality: 0.8,
              });
              if (!result.canceled) {
                const uris = result.assets.map(asset => asset.uri);
                setSelectedImages([...selectedImages, ...uris]);
              }
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
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

  const removeImage = (index: number) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index));
  };

  const handleCommandSelect = (command: SlashCommand) => {
    setInput(`/${command.name} `);
    setShowCommandPicker(false);
  };

  const handleCommandsPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCommandPicker(true);
  };

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

        {/* Image previews */}
        {selectedImages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.imagePreviewContainer}
            contentContainerStyle={styles.imagePreviewContent}
          >
            {selectedImages.map((uri, index) => (
              <View key={index} style={styles.imagePreviewWrapper}>
                <Image source={{ uri }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                >
                  <Text style={styles.removeImageText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Bottom toolbar */}
        <View style={[styles.toolbar, isDark && styles.toolbarDark]}>
          <View style={styles.toolbarLeft}>
            <TouchableOpacity
              style={[styles.attachButton, isDisabled && styles.attachButtonDisabled]}
              onPress={handleAttachment}
              disabled={isDisabled}
            >
              <View style={[styles.imageIcon, isDark && styles.imageIconDark]}>
                <View style={[styles.imageIconMountain, isDark && styles.imageIconMountainDark]} />
                <View style={[styles.imageIconSun, isDark && styles.imageIconSunDark]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.commandsButton, isDisabled && styles.commandsButtonDisabled]}
              onPress={handleCommandsPress}
              disabled={isDisabled}
            >
              <Text style={[styles.commandsButtonText, isDark && styles.commandsButtonTextDark]}>/</Text>
            </TouchableOpacity>
          </View>
          {/* Mode indicator - tappable to change mode */}
          <TouchableOpacity
            style={[styles.modeIndicator, isDark && styles.modeIndicatorDark]}
            onPress={handleModePress}
            disabled={isDisabled}
          >
            <Text style={[styles.modeText, isDark && styles.modeTextDark]}>
              {modeLabel || 'Select mode'}
            </Text>
          </TouchableOpacity>
          {/* Model selector - disabled when no models available or changing */}
          <TouchableOpacity
            style={[
              styles.modelIndicator,
              isDark && styles.modelIndicatorDark,
              model && !isModelChanging && styles.modelIndicatorActive,
              model && !isModelChanging && isDark && styles.modelIndicatorActiveDark,
              (isDisabled || availableModels.length === 0 || isModelChanging) && styles.modelIndicatorDisabled,
            ]}
            onPress={() => setShowModelPicker(true)}
            disabled={isDisabled || availableModels.length === 0 || isModelChanging}
          >
            <Text style={[
              styles.modelText,
              isDark && styles.modelTextDark,
              model && !isModelChanging && styles.modelTextActive,
              model && !isModelChanging && isDark && styles.modelTextActiveDark,
            ]}>
              {isModelChanging ? 'Changing...' : formatModelName(model)}
            </Text>
            {!isModelChanging && (
              <Text style={[
                styles.modelChevron,
                isDark && styles.modelChevronDark,
                model && styles.modelChevronActive,
                model && isDark && styles.modelChevronActiveDark,
              ]}>▼</Text>
            )}
          </TouchableOpacity>
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

      <CommandPicker
        visible={showCommandPicker}
        commands={commands}
        onSelect={handleCommandSelect}
        onClose={() => setShowCommandPicker(false)}
      />

      <ModelPicker
        visible={showModelPicker}
        models={availableModels}
        currentModel={model}
        onSelect={(selectedModel) => {
          sendModelChange(selectedModel.value);
          setShowModelPicker(false);
        }}
        onClose={() => setShowModelPicker(false)}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
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
  // Image preview
  imagePreviewContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  imagePreviewContent: {
    gap: 8,
  },
  imagePreviewWrapper: {
    position: 'relative',
  },
  imagePreview: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  // Attachment button
  attachButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachButtonDisabled: {
    opacity: 0.5,
  },
  // Commands button
  commandsButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  commandsButtonDisabled: {
    opacity: 0.5,
  },
  commandsButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
  commandsButtonTextDark: {
    color: '#9ca3af',
  },
  imageIcon: {
    width: 20,
    height: 16,
    borderWidth: 1.5,
    borderColor: '#6b7280',
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  imageIconDark: {
    borderColor: '#9ca3af',
  },
  imageIconMountain: {
    position: 'absolute',
    bottom: 1,
    left: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#6b7280',
  },
  imageIconMountainDark: {
    borderBottomColor: '#9ca3af',
  },
  imageIconSun: {
    position: 'absolute',
    top: 2,
    right: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6b7280',
  },
  imageIconSunDark: {
    backgroundColor: '#9ca3af',
  },
  // Mode indicator
  modeIndicator: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  modeIndicatorDark: {
    backgroundColor: '#374151',
  },
  modeText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  modeTextDark: {
    color: '#9ca3af',
  },
  // Model indicator (inactive - no model selected)
  modelIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    gap: 4,
  },
  modelIndicatorDark: {
    backgroundColor: '#374151',
  },
  // Model indicator active (model selected)
  modelIndicatorActive: {
    backgroundColor: '#ede9fe',
  },
  modelIndicatorActiveDark: {
    backgroundColor: '#4c1d95',
  },
  modelIndicatorDisabled: {
    opacity: 0.5,
  },
  // Model text (inactive)
  modelText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  modelTextDark: {
    color: '#9ca3af',
  },
  // Model text active
  modelTextActive: {
    color: '#6d28d9',
  },
  modelTextActiveDark: {
    color: '#c4b5fd',
  },
  // Model chevron (inactive)
  modelChevron: {
    fontSize: 8,
    color: '#6b7280',
  },
  modelChevronDark: {
    color: '#9ca3af',
  },
  // Model chevron active
  modelChevronActive: {
    color: '#6d28d9',
  },
  modelChevronActiveDark: {
    color: '#c4b5fd',
  },
});
