import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSecureItem, setSecureItem, deleteSecureItem } from '@/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '@/services/NotificationService';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';
import { fetchAppSettings } from '@/services/settingsService';

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
            allowedLeaves: fresh.allowedLeaves !== undefined ? fresh.allowedLeaves : prev?.allowedLeaves,
            consumedLeaves: fresh.consumedLeaves !== undefined ? fresh.consumedLeaves : prev?.consumedLeaves,
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
        const hasLaunched = await AsyncStorage.getItem('hasLaunched');
        if (!hasLaunched) {
          await deleteSecureItem('userToken');
          await deleteSecureItem('userProfile');
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
    }
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ user, setUser, isLoading, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);