import { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useSessionStore } from '../../src/stores/sessionStore';
import { SessionCard } from '../../src/components/SessionCard';
import { EmptyState } from '../../src/components/EmptyState';

interface MachineSection {
  id: string;
  title: string;
  hostname?: string;
  data: any[];
  onlineCount: number;
  offlineCount: number;
}

export default function SessionsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const { sessions, isLoading, fetchSessions, refreshSessions, setOpenSwipeableId } =
    useSessionStore();

  useEffect(() => {
    fetchSessions();
  }, []);

  const onRefresh = useCallback(() => {
    refreshSessions();
  }, []);

  // Group sessions by machine
  const sections: MachineSection[] = useMemo(() => {
    const machineMap = new Map<string, MachineSection>();

    sessions.forEach((session: any) => {
      const machineId = session.machines?.id || 'unknown';
      const machineName = session.machines?.name || 'Unknown Machine';
      const hostname = session.machines?.hostname;

      if (!machineMap.has(machineId)) {
        machineMap.set(machineId, {
          id: machineId,
          title: machineName,
          hostname,
          data: [],
          onlineCount: 0,
          offlineCount: 0,
        });
      }

      const section = machineMap.get(machineId)!;
      section.data.push(session);
      if (session.status === 'active') {
        section.onlineCount++;
      } else {
        section.offlineCount++;
      }
    });

    return Array.from(machineMap.values());
  }, [sessions]);

  // Calculate total session counts
  const sessionCounts = useMemo(() => {
    const total = sessions.length;
    const online = sessions.filter((s: any) => s.status === 'active').length;
    const offline = total - online;
    return { total, online, offline };
  }, [sessions]);

  const toggleSection = (sectionId: string) => {
    // Close any open swipeable
    setOpenSwipeableId(null);

    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

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
      {/* Session Stats */}
      <View style={[styles.statsContainer, isDark && styles.statsContainerDark]}>
        <Pressable
          style={styles.statsContent}
          onPress={() => setOpenSwipeableId(null)}
        >
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, isDark && styles.statNumberDark]}>
              {sessionCounts.total}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <View style={[styles.statusDot, styles.statusDotOnline]} />
              <Text style={[styles.statNumber, styles.statNumberOnline]}>
                {sessionCounts.online}
              </Text>
            </View>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Online</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <View style={[styles.statusDot, styles.statusDotOffline]} />
              <Text style={[styles.statNumber, isDark && styles.statNumberDark]}>
                {sessionCounts.offline}
              </Text>
            </View>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Offline</Text>
          </View>
        </Pressable>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={isDark ? '#9ca3af' : '#6b7280'} />
          ) : (
            <Text style={[styles.refreshIcon, isDark && styles.refreshIconDark]}>↻</Text>
          )}
        </TouchableOpacity>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, section }) =>
          collapsedSections.has(section.id) ? null : <SessionCard session={item} />
        }
        renderSectionHeader={({ section }) => (
          <TouchableOpacity
            style={[styles.sectionHeader, isDark && styles.sectionHeaderDark]}
            onPress={() => toggleSection(section.id)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderLeft}>
              <Text style={[styles.sectionChevron, isDark && styles.sectionChevronDark]}>
                {collapsedSections.has(section.id) ? '▶' : '▼'}
              </Text>
              <View>
                <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                  {section.title}
                </Text>
                {section.hostname && (
                  <Text style={[styles.sectionHostname, isDark && styles.sectionHostnameDark]}>
                    {section.hostname}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.sectionBadges}>
              {section.onlineCount > 0 && (
                <View style={[styles.sectionBadge, styles.sectionBadgeOnline, isDark && styles.sectionBadgeOnlineDark]}>
                  <Text style={[styles.sectionBadgeText, isDark && styles.sectionBadgeTextDark]}>{section.onlineCount}</Text>
                </View>
              )}
              {section.offlineCount > 0 && (
                <View style={[styles.sectionBadge, styles.sectionBadgeOffline, isDark && styles.sectionBadgeOfflineDark]}>
                  <Text style={[styles.sectionBadgeText, styles.sectionBadgeTextOffline, isDark && styles.sectionBadgeTextOfflineDark]}>
                    {section.offlineCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={isDark ? '#ffffff' : '#000000'}
          />
        }
        stickySectionHeadersEnabled={false}
        onScrollBeginDrag={() => setOpenSwipeableId(null)}
        ListFooterComponent={
          <Pressable
            style={styles.listFooter}
            onPress={() => setOpenSwipeableId(null)}
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
    flexGrow: 1,
  },
  listFooter: {
    flex: 1,
    minHeight: 200,
  },
  // Session stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  statsContainerDark: {
    backgroundColor: '#1f1f1f',
  },
  statsContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshIcon: {
    fontSize: 22,
    color: '#6b7280',
    fontWeight: '600',
  },
  refreshIconDark: {
    color: '#9ca3af',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  statNumberDark: {
    color: '#f3f4f6',
  },
  statNumberOnline: {
    color: '#22c55e',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statLabelDark: {
    color: '#9ca3af',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e5e7eb',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOnline: {
    backgroundColor: '#22c55e',
  },
  statusDotOffline: {
    backgroundColor: '#9ca3af',
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e0e7ff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  sectionHeaderDark: {
    backgroundColor: '#1e1b4b',
    borderLeftColor: '#818cf8',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionChevron: {
    fontSize: 12,
    color: '#6b7280',
  },
  sectionChevronDark: {
    color: '#9ca3af',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  sectionTitleDark: {
    color: '#f3f4f6',
  },
  sectionHostname: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  sectionHostnameDark: {
    color: '#9ca3af',
  },
  sectionBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  sectionBadgeOnline: {
    backgroundColor: '#dcfce7',
  },
  sectionBadgeOnlineDark: {
    backgroundColor: '#14532d',
  },
  sectionBadgeOffline: {
    backgroundColor: '#f3f4f6',
  },
  sectionBadgeOfflineDark: {
    backgroundColor: '#374151',
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  sectionBadgeTextDark: {
    color: '#4ade80',
  },
  sectionBadgeTextOffline: {
    color: '#6b7280',
  },
  sectionBadgeTextOfflineDark: {
    color: '#9ca3af',
  },
});
