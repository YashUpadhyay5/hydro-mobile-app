import "../global.css";
import "@/src/i18n"; // Initialize i18next
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LanguageProvider } from "@/src/components/i18n/LanguageProvider";
import { Stack, useRouter, useSegments, useRootNavigationState } from "expo-router";
import React, { useEffect, Component, ReactNode } from "react";
import { LogBox, Platform, useColorScheme, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import "../services/BackgroundLocationTask";
import { syncOfflineData } from "@/services/syncService";
import geotagPhotoSyncManager from "@/services/GeotagPhotoSyncManager";
import offlinePhotoRepository from "@/services/OfflinePhotoRepository";

// Register global JS error handler to prevent unexpected app auto-close
if (typeof (global as any).ErrorUtils !== 'undefined') {
  const defaultHandler = (global as any).ErrorUtils.getGlobalHandler && (global as any).ErrorUtils.getGlobalHandler();
  (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
    console.error(`[GlobalErrorHandler] Caught unhandled error (isFatal=${isFatal}):`, error);
    if (!isFatal && defaultHandler) {
      defaultHandler(error, isFatal);
    }
  });
}

if (Platform.OS === 'web') {
  LogBox.ignoreAllLogs(true);
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("[GlobalErrorBoundary] App render error caught:", error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.icon}>⚠️</Text>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            The application recovered from an unexpected error. Please tap below to resume.
          </Text>
          <TouchableOpacity style={errorStyles.button} onPress={this.handleRestart} activeOpacity={0.8}>
            <Text style={errorStyles.buttonText}>Restart Application Screen</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default function RootLayout() {
  return (
    <GlobalErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <LayoutContent />
        </AuthProvider>
      </LanguageProvider>
    </GlobalErrorBoundary>
  );
}


function LayoutContent() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const colorScheme = useColorScheme();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    // Initialize offline photo engine and continuous auto-sync engine across the entire app
    offlinePhotoRepository.init().catch(() => {});
    geotagPhotoSyncManager.startListening();

    // Synchronize any offline buffered location telemetry, attendance, or photos whenever app opens or reconnects
    syncOfflineData();
    const interval = setInterval(() => {
      syncOfflineData();
    }, 15000); // Check every 15s
    return () => {
      clearInterval(interval);
      geotagPhotoSyncManager.stopListening();
    };
  }, []);

  useEffect(() => {
    if (isLoading || !rootNavigationState?.key) return;
    
    const inAuthGroup = segments[0] === "(auth)";
    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments, router, rootNavigationState?.key]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        try {
          const data = response?.notification?.request?.content?.data;
          if (data && rootNavigationState?.key) {
            if (data.senderId || data.chatId || data.type === 'CHAT') {
              router.push({
                pathname: '/(tabs)/explore',
                params: {
                  openChatId: String(data.chatId || ''),
                  senderId: String(data.senderId || ''),
                  senderName: String(data.senderName || ''),
                  openChatTime: String(Date.now()),
                },
              });
            } else if (data.deepLink) {
              router.push("/(tabs)");
            }
          }
        } catch (innerErr) {
          console.warn('[Notification Navigation Warning]', innerErr);
        }
      });
      return () => {
        try {
          subscription.remove();
        } catch (e) {}
      };
    } catch (e) {
      console.warn('[Notification Setup Warning]', e);
    }
  }, [router, rootNavigationState?.key]);

  if (isLoading) {
    return null;
  }

  const isDark = colorScheme === 'dark';

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: isDark ? '#0F172A' : '#FAFAFA' },
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="profile"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="app-settings"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="help-support"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="attendance-today"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="document-upload"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="expense-create"
          options={{
            title: 'Add Expense',
            presentation: 'card',
            headerStyle: { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' },
            headerTintColor: isDark ? '#F8FAFC' : '#0F172A',
          }}
        />
        <Stack.Screen
          name="leave-create"
          options={{
            title: 'Apply Leave',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="logs-and-shifts"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="admin-employees"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="admin-geofence"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="admin-live-tracking"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="admin-route-replay"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            title: 'Modal',
          }}
        />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}