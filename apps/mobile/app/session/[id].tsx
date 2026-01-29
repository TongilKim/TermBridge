import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { Terminal } from '../../src/components/Terminal';
import { InputBar } from '../../src/components/InputBar';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const { connect, disconnect, clearMessages, state } = useConnectionStore();

  useEffect(() => {
    if (id) {
      clearMessages();
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
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen
        options={{
          title: 'Session',
          headerRight: () => (
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
                  ? 'Live'
                  : state === 'connecting'
                    ? 'Connecting'
                    : state === 'reconnecting'
                      ? 'Reconnecting'
                      : 'Offline'}
              </Text>
            </View>
          ),
        }}
      />
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
  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 8,
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
