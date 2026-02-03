import { useEffect } from 'react';
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

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const { connect, disconnect, state } = useConnectionStore();

  useEffect(() => {
    if (id) {
      connect(id);
    }

    return () => {
      disconnect();
    };
  }, [id]);

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
      <Terminal />
      <View style={{ paddingBottom: insets.bottom }}>
        <InputBar disabled={state !== 'connected'} />
      </View>
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
