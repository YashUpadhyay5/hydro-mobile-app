import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSecureItem, setSecureItem, deleteSecureItem } from '@/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '@/services/NotificationService';
import api from '@/services/api';
import { API_BASE_URL, apiBaseUrlReady } from '@/constants/API';
import { fetchAppSettings } from '@/services/settingsService';
import { syncAttendanceReminders, disableAttendanceReminders } from '@/services/AttendanceReminderService';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { mergeLeaveFields } from '@/utils/leaveBalance';

const AuthContext = createContext<any>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUserProfile = useCallback(async (explicitUserId?: string) => {
    const targetId = explicitUserId || user?.id;
    if (!targetId) return null;

    try {
      const res = await api.get(`/employees/${targetId}`);
      if (res.data) {
        const fresh = res.data;
        setUser((prev: any) => {
          const empIdCode = fresh.empCode || fresh.employeeCode || fresh.employeeId || prev?.empCode || prev?.employeeCode || fresh.id || prev?.id;
          const userPhone = fresh.phoneNo || fresh.phone || prev?.phone || prev?.phoneNo || '';
          
          const updated = {
            ...(prev || {}),
            ...fresh,
            id: fresh.id || prev?.id,
            empCode: empIdCode,
            employeeCode: empIdCode,
            name: fresh.name || prev?.name,
            email: fresh.email || prev?.email,
            role: fresh.role || prev?.role,
            designation: fresh.jobTitle || fresh.designation || prev?.designation,
            jobTitle: fresh.jobTitle || fresh.designation || prev?.jobTitle,
            department: fresh.department || prev?.department,
            location: fresh.location || prev?.location,
            joiningDate: fresh.joiningDate || prev?.joiningDate,
            avatar: fresh.avatar !== undefined ? fresh.avatar : prev?.avatar,
            phone: userPhone,
            phoneNo: userPhone,
            emergencyContactName: fresh.emergencyContactName || prev?.emergencyContactName,
            emergencyContactPhone: fresh.emergencyContactPhone || prev?.emergencyContactPhone,
            // Leave figures: when the server sends availableLeaves they replace the login-time ones
            // entirely (those go stale after an approval); see utils/leaveBalance.ts.
            ...mergeLeaveFields(prev, fresh),
          };
          setSecureItem('userProfile', JSON.stringify(updated)).catch(() => {});
          return updated;
        });
        return res.data;
      }
    } catch (err: any) {
      console.warn('[AuthContext] refreshUserProfile warning:', err.message);
    }
    return null;
  }, [user?.id]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Ensure a saved custom backend URL is loaded before any request fires,
        // otherwise this can race initApiBaseUrl()'s AsyncStorage read and hit
        // the hardcoded default host on cold start.
        await apiBaseUrlReady;

        // Mark first launch without clearing credentials.
        // SecureStore is already empty on a genuine fresh install, so there
        // is no need to wipe it here. Deleting the token when hasLaunched is
        // absent caused forced re-login whenever AsyncStorage was cleared
        // (app reinstall, data wipe, emulator reset) while SecureStore still
        // held a valid session.
        const hasLaunched = await AsyncStorage.getItem('hasLaunched');
        if (!hasLaunched) {
          await AsyncStorage.setItem('hasLaunched', 'true');
        }

        const token = await getSecureItem('userToken');
        const profileStr = await getSecureItem('userProfile');

        if (token) {
          let parsedUser: any = { token };
          if (profileStr) {
            try {
              parsedUser = { ...JSON.parse(profileStr), token };
            } catch (e) {
              parsedUser = { token };
            }
          }
          setUser(parsedUser);

          // Sync fresh profile from DB immediately
          if (parsedUser.id) {
            refreshUserProfile(parsedUser.id).catch(() => {});
          }

          fetchAppSettings().catch(err => console.warn("[AuthInit] Settings fetch warning:", err.message));
        }
      } catch (err) {
        console.error("Auth init error", err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Register push notifications when user logs in
  useEffect(() => {
    if (user && user.id) {
      try {
        registerForPushNotificationsAsync()
          .then(async (token) => {
            if (token) {
              try {
                await api.post('/employees/fcm-token', { token });
                console.log("Successfully saved push token to backend:", token);
              } catch (e: any) {
                console.warn("Failed to save push token to backend:", e.message);
              }
            }
          })
          .catch((err) => {
            console.warn("Silent ignore: Push token registration failed:", err);
          });
      } catch (err) {
        console.warn("Silent ignore: Push registration wrapper error:", err);
      }
      // FCM can rotate the device token at any time: send the new one so pushes keep reaching this phone.
      if (Platform.OS !== 'web') {
        const refreshSub = Notifications.addPushTokenListener(({ data }) => {
          if (typeof data !== 'string' || !data) return;
          api.post('/employees/fcm-token', { token: data })
            .then(() => console.log('Saved refreshed push token to backend'))
            .catch((e: any) => console.warn('Failed to save refreshed push token:', e?.message));
        });
        return () => refreshSub.remove();
      }
    }
  }, [user?.id]);

  // Native clock-in/out reminders: synced on sign-in/cold start (after fresh shift settings), refreshed when
  // the app returns to the foreground (new holidays/leave), and switched off on sign-out.
  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) {
      disableAttendanceReminders();
      return;
    }
    const sync = () => fetchAppSettings().catch(() => null).finally(() => {
      syncAttendanceReminders(user).catch((err) => console.warn('[AuthContext] Reminder sync warning:', err?.message));
    });
    sync();
    let lastSync = Date.now();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastSync > 60 * 60 * 1000) {
        lastSync = Date.now();
        sync();
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync on identity/token changes, not every profile refresh
  }, [isLoading, user?.id, user?.empCode, user?.token]);

  return (
    <AuthContext.Provider value={{ user, setUser, isLoading, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);