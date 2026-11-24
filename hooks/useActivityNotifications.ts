import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/context/AuthContext';
import { useActivity } from '@/context/ActivityContext';

/**
 * Sends the employee to the Extra time screen for a "time is up" push (data.action === 'activity_extend').
 *  - Push arrives while the app is open: refresh from the server and open the screen at once.
 *  - Notification tapped (app in the background): open the screen.
 *  - App started by tapping it (cold start): open the screen once the user and navigation are ready.
 * The native alarm's own notification opens the same screen through a mobileapp:// link that expo-router handles.
 */
export function useActivityNotifications() {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useActivity();
  const navigationState = useRootNavigationState();
  const ready = !!user?.id && !!navigationState?.key;
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;

    const open = (data: Record<string, unknown> | undefined) => {
      if (data?.action !== 'activity_extend') return false;
      const id = data.activityId ? String(data.activityId) : '';
      router.push({ pathname: '/activity-extend', params: id ? { id } : {} } as any);
      return true;
    };

    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      // The same tap can be reported twice (listener and "last response"): act on it once.
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      open(response.notification.request.content.data as Record<string, unknown>);
    };

    Notifications.getLastNotificationResponseAsync().then(onResponse).catch(() => {});
    const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown>;
      if (data?.action !== 'activity_extend') return;
      refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      open(data);
    });
    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [ready, router, refresh]);
}
