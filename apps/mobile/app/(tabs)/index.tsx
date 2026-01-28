import { useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSessionStore } from '../../src/stores/sessionStore';
import { SessionCard } from '../../src/components/SessionCard';
import { EmptyState } from '../../src/components/EmptyState';

export default function SessionsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { sessions, isLoading, error, fetchSessions, refreshSessions } =
    useSessionStore();

  useEffect(() => {
    fetchSessions();
  }, []);

  const onRefresh = useCallback(() => {
    refreshSessions();
  }, []);

  if (isLoading && sessions.length === 0) {
    return (
      <View style={[styles.loading, isDark && styles.loadingDark]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <EmptyState
          title="No Sessions"
          message="Start a Claude Code session on your computer using 'termbridge start' to see it here."
          icon="💻"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SessionCard session={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={isDark ? '#ffffff' : '#000000'}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingDark: {
    backgroundColor: '#0a0a0a',
  },
  list: {
    paddingVertical: 8,
  },
});
