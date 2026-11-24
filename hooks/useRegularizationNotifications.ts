import { useEffect, useRef } from 'react';
import { Platform, ToastAndroid } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/context/AuthContext';
import { emitRegularizationChanged } from '@/utils/regularizationEvents';

/**
 * The decision push for an attendance regularization (data.type === 'REGULARIZATION'). It is a normal notification:
 *  - Arrives while the app is open: a short message, and an open My requests list reloads.
 *  - Tapped (background) or the app was started by tapping it (cold start): open My requests.
 * It uses the app's existing expo-notifications setup. The push is best effort: My requests also reloads on its own
 * when it opens and when the app returns to the foreground.
 */
export function useRegularizationNotifications() {
  const router = useRouter();
  const { user } = useAuth();
  const navigationState = useRootNavigationState();
  const ready = !!user?.id && !!navigationState?.key;
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;

    const isRegularization = (data: Record<string, unknown> | undefined) => data?.type === 'REGULARIZATION';

    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (!isRegularization(data)) return;
      // The same tap can be reported twice (listener and "last response"): act on it once.
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      emitRegularizationChanged();
      router.push('/regularization-requests' as any);
    };

    Notifications.getLastNotificationResponseAsync().then(onResponse).catch(() => {});
    const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      if (!isRegularization(content.data as Record<string, unknown>)) return;
      emitRegularizationChanged();
      if (Platform.OS === 'android') {
        ToastAndroid.show([content.title, content.body].filter(Boolean).join(': '), ToastAndroid.LONG);
      }
    });
    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [ready, router]);
}
