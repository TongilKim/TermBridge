import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Session } from '@termbridge/shared';

interface SessionCardProps {
  session: Session & {
    machines?: {
      id: string;
      name: string;
      hostname?: string;
      status: string;
    };
  };
}

export function SessionCard({ session }: SessionCardProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const machine = session.machines;
  const isActive = session.status === 'active';
  const machineOnline = machine?.status === 'online';

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <TouchableOpacity
      style={[styles.container, isDark && styles.containerDark]}
      onPress={() => router.push(`/session/${session.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.machineName, isDark && styles.machineNameDark]}>
            {machine?.name || 'Unknown Machine'}
          </Text>
          <View
            style={[
              styles.statusDot,
              isActive && machineOnline
                ? styles.statusActive
                : styles.statusInactive,
            ]}
          />
        </View>
        <Text style={[styles.statusText, isDark && styles.statusTextDark]}>
          {isActive ? (machineOnline ? 'Active' : 'Paused') : 'Ended'}
        </Text>
      </View>

      {session.working_directory && (
        <Text
          style={[styles.directory, isDark && styles.directoryDark]}
          numberOfLines={1}
        >
          {session.working_directory}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={[styles.timestamp, isDark && styles.timestampDark]}>
          Started {formatTime(session.started_at)}
        </Text>
        {session.ended_at && (
          <Text style={[styles.timestamp, isDark && styles.timestampDark]}>
            • Ended {formatTime(session.ended_at)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  containerDark: {
    backgroundColor: '#1f1f1f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  machineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  machineNameDark: {
    color: '#f3f4f6',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: '#22c55e',
  },
  statusInactive: {
    backgroundColor: '#9ca3af',
  },
  statusText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  statusTextDark: {
    color: '#9ca3af',
  },
  directory: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#4b5563',
    marginBottom: 8,
  },
  directoryDark: {
    color: '#9ca3af',
  },
  footer: {
    flexDirection: 'row',
    gap: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  timestampDark: {
    color: '#6b7280',
  },
});
