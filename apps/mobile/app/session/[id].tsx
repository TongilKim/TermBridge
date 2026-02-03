import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { Terminal } from '../../src/components/Terminal';
import { InputBar } from '../../src/components/InputBar';
import { ModelPicker } from '../../src/components/ModelPicker';

// Format model identifier to friendly display name
function formatModelName(model: string | null): string {
  if (!model) return 'Model';
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

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const [showModelPicker, setShowModelPicker] = useState(false);

  const { connect, disconnect, state, model, availableModels, sendModelChange, requestModels } = useConnectionStore();

  useEffect(() => {
    if (id) {
      connect(id);
    }

    return () => {
      disconnect();
    };
  }, [id]);

  // Request available models when connected
  useEffect(() => {
    if (state === 'connected') {
      requestModels();
    }
  }, [state]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {/* Custom Header */}
      <View style={[styles.header, isDark && styles.headerDark, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, isDark && styles.backTextDark]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>Session</Text>
        <View style={styles.headerRight}>
          {/* Model Badge */}
          <TouchableOpacity
            onPress={() => state === 'connected' && setShowModelPicker(true)}
            disabled={state !== 'connected'}
            style={[
              styles.modelBadge,
              isDark && styles.modelBadgeDark,
              state !== 'connected' && styles.modelBadgeDisabled,
            ]}
          >
            <Text style={[styles.modelText, isDark && styles.modelTextDark]}>
              {formatModelName(model)}
            </Text>
            <Text style={[styles.modelChevron, isDark && styles.modelChevronDark]}>▼</Text>
          </TouchableOpacity>
          {/* Status Badge */}
          <View
            style={[
              styles.statusBadge,
              state === 'connected'
                ? styles.statusBadgeConnected
                : state === 'connecting' || state === 'reconnecting'
                  ? styles.statusBadgeConnecting
                  : styles.statusBadgeDisconnected,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                state === 'connected'
                  ? styles.statusDotConnected
                  : state === 'connecting' || state === 'reconnecting'
                    ? styles.statusDotConnecting
                    : styles.statusDotDisconnected,
              ]}
            />
            <Text
              style={[
                styles.statusText,
                state === 'connected'
                  ? styles.statusTextConnected
                  : state === 'connecting' || state === 'reconnecting'
                    ? styles.statusTextConnecting
                    : styles.statusTextDisconnected,
              ]}
            >
              {state === 'connected'
                ? 'Online'
                : state === 'connecting'
                  ? 'Connecting'
                  : state === 'reconnecting'
                    ? 'Reconnecting'
                    : 'Offline'}
            </Text>
          </View>
        </View>
      </View>
      <Terminal />
      <View style={{ paddingBottom: insets.bottom }}>
        <InputBar disabled={state !== 'connected'} />
      </View>
      {/* Model Picker Modal */}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  // Custom header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerDark: {
    backgroundColor: '#0a0a0a',
    borderBottomColor: '#374151',
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backText: {
    fontSize: 17,
    color: '#3b82f6',
  },
  backTextDark: {
    color: '#60a5fa',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  headerTitleDark: {
    color: '#ffffff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Model badge
  modelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#ede9fe',
    gap: 4,
  },
  modelBadgeDark: {
    backgroundColor: '#4c1d95',
  },
  modelBadgeDisabled: {
    opacity: 0.5,
  },
  modelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6d28d9',
  },
  modelTextDark: {
    color: '#c4b5fd',
  },
  modelChevron: {
    fontSize: 10,
    color: '#6d28d9',
  },
  modelChevronDark: {
    color: '#c4b5fd',
  },
  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  statusBadgeConnected: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeConnecting: {
    backgroundColor: '#fef3c7',
  },
  statusBadgeDisconnected: {
    backgroundColor: '#f3f4f6',
  },
  // Status dot
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotConnected: {
    backgroundColor: '#22c55e',
  },
  statusDotConnecting: {
    backgroundColor: '#f59e0b',
  },
  statusDotDisconnected: {
    backgroundColor: '#9ca3af',
  },
  // Status text
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusTextConnected: {
    color: '#166534',
  },
  statusTextConnecting: {
    color: '#92400e',
  },
  statusTextDisconnected: {
    color: '#6b7280',
  },
});
