import { useEffect } from 'react';
import {
  View,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { Terminal } from '../../src/components/Terminal';
import { InputBar } from '../../src/components/InputBar';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerHeight = useHeaderHeight();

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
          title: state === 'connected' ? 'Live Session' : 'Session',
          headerRight: () => (
            <View
              style={[
                styles.statusIndicator,
                state === 'connected'
                  ? styles.statusConnected
                  : styles.statusDisconnected,
              ]}
            />
          ),
        }}
      />
      <Terminal />
      <InputBar disabled={state !== 'connected'} />
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
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusConnected: {
    backgroundColor: '#22c55e',
  },
  statusDisconnected: {
    backgroundColor: '#9ca3af',
  },
});
