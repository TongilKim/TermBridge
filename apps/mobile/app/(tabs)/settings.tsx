import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '../../src/stores/authStore';
import {
  registerForPushNotifications,
  savePushToken,
  removePushToken,
} from '../../src/services/notifications';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { user, signOut, isLoading } = useAuthStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    // Check current notification status
    // This would need actual implementation to check stored token
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            if (pushToken) {
              await removePushToken(pushToken);
            }
            await signOut();
          },
        },
      ]
    );
  };

  const toggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const token = await registerForPushNotifications();
      if (token && user) {
        await savePushToken(user.id, token);
        setPushToken(token);
        setNotificationsEnabled(true);
      } else {
        Alert.alert(
          'Notifications',
          'Unable to enable push notifications. Please check your device settings.'
        );
      }
    } else {
      if (pushToken) {
        await removePushToken(pushToken);
        setPushToken(null);
      }
      setNotificationsEnabled(false);
    }
  };

  const appVersion = Constants.expoConfig?.version || '0.1.0';

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={styles.content}
    >
      {/* Account Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
          Account
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.row}>
            <Text style={[styles.label, isDark && styles.labelDark]}>Email</Text>
            <Text style={[styles.value, isDark && styles.valueDark]}>
              {user?.email || 'Not signed in'}
            </Text>
          </View>
        </View>
      </View>

      {/* Notifications Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
          Notifications
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.rowWithSwitch}>
            <View style={styles.switchLabelContainer}>
              <Text style={[styles.label, isDark && styles.labelDark]}>
                Push Notifications
              </Text>
              <Text style={[styles.hint, isDark && styles.hintDark]}>
                Get notified about task completions and errors
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={notificationsEnabled ? '#3b82f6' : '#f4f3f4'}
            />
          </View>
        </View>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
          About
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.row}>
            <Text style={[styles.label, isDark && styles.labelDark]}>
              Version
            </Text>
            <Text style={[styles.value, isDark && styles.valueDark]}>
              {appVersion}
            </Text>
          </View>
        </View>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity
        style={[styles.logoutButton, isLoading && styles.logoutButtonDisabled]}
        onPress={handleLogout}
        disabled={isLoading}
      >
        <Text style={styles.logoutButtonText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
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
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionTitleDark: {
    color: '#9ca3af',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardDark: {
    backgroundColor: '#1f1f1f',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowWithSwitch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    color: '#1f2937',
  },
  labelDark: {
    color: '#f3f4f6',
  },
  value: {
    fontSize: 16,
    color: '#6b7280',
  },
  valueDark: {
    color: '#9ca3af',
  },
  hint: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  hintDark: {
    color: '#6b7280',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonDisabled: {
    opacity: 0.7,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
