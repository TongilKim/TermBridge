import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../src/stores/authStore';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { user, isLoading, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  // Initialize auth on app load
  useEffect(() => {
    initialize();
  }, []);

  // Redirect based on auth state - only after navigation is ready
  useEffect(() => {
    if (isLoading) return;
    if (!navigationState?.key) return; // Wait for navigator to be ready

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // Not authenticated, redirect to login
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Authenticated, redirect to main app
      router.replace('/(tabs)');
    }
  }, [user, segments, isLoading, navigationState?.key]);

  // Show loading screen while initializing or waiting for navigation
  if (isLoading || !navigationState?.key) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#0a0a0a' : '#ffffff' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: isDark ? '#0a0a0a' : '#ffffff',
          },
          headerTintColor: isDark ? '#ffffff' : '#000000',
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5',
          },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="session/[id]"
          options={{
            title: 'Session',
            presentation: 'card',
          }}
        />
      </Stack>
    </>
  );
}
