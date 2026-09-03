import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import api from '@/services/api';
import { useAuth } from '../context/AuthContext';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function AttendanceTodayScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [todayFootprints, setTodayFootprints] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [user?.id, user?.empCode]);

  const fetchData = async () => {
    if (!user?.id && !user?.empCode) return;
    try {
      setLoading(true);
      const todayDate = new Date().toISOString().split('T')[0];
      const empCode = user?.empCode || user?.employeeCode;
      const uId = user?.id;
      const uName = user?.name?.toLowerCase();

      const isUserMatch = (item: any) => {
        return (
          (empCode && item.userId === empCode) ||
          (uId && item.userId === uId) ||
          (empCode && item.empCode === empCode) ||
          (uId && item.empCode === uId) ||
          (uName && item.userName && item.userName.toLowerCase() === uName)
        );
      };

      // 1. Fetch today's attendance summary record
      const attRes = await api.get('/attendance');
      if (attRes.data && Array.isArray(attRes.data)) {
        const userAtts = attRes.data.filter(isUserMatch);
        const matchingToday = userAtts.find((item: any) => item.date === todayDate) || userAtts[0];
        setTodayRecord(matchingToday || null);
      }

      // 2. Fetch today's detailed footprints/punches
      const footRes = await api.get('/footprints');
      if (footRes.data && Array.isArray(footRes.data)) {
        const userFoots = footRes.data.filter(isUserMatch);
        const matchingFootprints = userFoots.filter((item: any) => item.date === todayDate || !item.date);
        setTodayFootprints(matchingFootprints.sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp)));
      }
    } catch (e: any) {
      console.warn('[AttendanceToday] Dynamic fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formattedDateHeader = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const clockInTime = todayRecord?.checkIn || (todayFootprints.length > 0 ? new Date(Number(todayFootprints[0].timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'MISSING');
  const clockOutTime = todayRecord?.checkOut || 'MISSING';

  // Dynamic late calculation against 09:00 AM shift start
  const computeLateStatus = () => {
    if (!todayRecord && todayFootprints.length === 0) return { isLate: false, label: 'ON TIME' };
    
    let checkInTimestamp = todayRecord?.timestamp;
    if (!checkInTimestamp && todayFootprints.length > 0) {
      checkInTimestamp = Number(todayFootprints[0].timestamp);
    }

    if (checkInTimestamp) {
      const date = new Date(checkInTimestamp);
      const shiftStart = new Date(date);
      shiftStart.setHours(9, 0, 0, 0);

      if (date.getTime() > shiftStart.getTime()) {
        const diffMs = date.getTime() - shiftStart.getTime();
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        return {
          isLate: true,
          label: `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} LATE`
        };
      }
    }
    return { isLate: false, label: 'ON TIME' };
  };

  const lateInfo = computeLateStatus();
  const effectiveHours = todayRecord?.workingHours || '0h 0m';
  const grossHours = todayRecord?.workingHours || '0h 0m';

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-surface'}`} style={{ paddingTop: Platform.OS === 'ios' ? 50 : 20 }}>
      {/* Top Header */}
      <View className={`flex-row items-center justify-between px-5 py-4 border-b z-10 ${isDark ? 'bg-[#1E293B] border-slate-700' : 'bg-background border-border'}`}>
        <TouchableOpacity 
          className={`w-10 h-10 rounded-full items-center justify-center border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border'}`}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" color={isDark ? '#F8FAFC' : '#1A1A1A'} size={22} />
        </TouchableOpacity>
        
        <Text className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>
          {t('attendance:today_title', { defaultValue: 'Attendance - Today' })}
        </Text>

        <TouchableOpacity 
          className={`w-10 h-10 rounded-full items-center justify-center border ${isDark ? 'bg-blue-950/60 border-blue-800' : 'bg-blue-50 border-blue-100'}`}
          onPress={() => router.push('/logs-and-shifts' as any)}
        >
          <IconSymbol name="clock.arrow.circlepath" color={isDark ? '#38BDF8' : '#0052CC'} size={22} />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={isDark ? '#38BDF8' : '#0052CC'} />
        </View>
      ) : (
        <ScrollView 
          className="flex-1 px-4 pt-4" 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[isDark ? '#38BDF8' : '#0052CC']} />}
        >
          {/* Today Date Header */}
          <Text className={`text-base font-bold mb-3 px-1 ${isDark ? 'text-white' : 'text-text-main'}`}>
            {formattedDateHeader}
          </Text>

          {/* Main Attendance Summary Card */}
          <View className={`rounded-2xl p-4 border shadow-sm mb-6 ${isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-background border-border'}`}>
            {/* Shift & Late Badge Row */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                09:00 AM - 05:00 PM • (9AM - 5PM)
              </Text>
              
              {lateInfo.isLate ? (
                <View className={`px-2.5 py-1 rounded-md border ${isDark ? 'bg-amber-950/60 border-amber-800' : 'bg-amber-50 border-amber-100/50'}`}>
                  <Text className={`text-[11px] font-bold ${isDark ? 'text-amber-400' : 'color-amber-600'}`}>
                    {lateInfo.label}
                  </Text>
                </View>
              ) : (
                <View className={`px-2.5 py-1 rounded-md border ${isDark ? 'bg-emerald-950/60 border-emerald-800' : 'bg-emerald-50 border-emerald-100/50'}`}>
                  <Text className={`text-[11px] font-bold ${isDark ? 'text-emerald-400' : 'color-emerald-600'}`}>
                    ON TIME
                  </Text>
                </View>
              )}
            </View>

            {/* Clock In / Out Times */}
            <View className={`flex-row justify-between items-center pb-4 border-b ${isDark ? 'border-slate-700' : 'border-border'}`}>
              <View className="flex-1">
                <Text className={`text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>Clock In</Text>
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-emerald-500 font-black text-sm">↙</Text>
                  <Text className={`text-base font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{clockInTime}</Text>
                </View>
              </View>

              <View className="flex-1 items-end">
                <Text className={`text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>Clock Out</Text>
                <View className="flex-row items-center gap-1.5">
                  <Text className={clockOutTime === 'MISSING' ? 'text-rose-500 font-black text-sm' : (isDark ? 'text-white font-black text-sm' : 'text-text-main font-black text-sm')}>
                    ↗
                  </Text>
                  <Text className={`text-base font-bold ${clockOutTime === 'MISSING' ? 'text-rose-500' : (isDark ? 'text-white' : 'text-text-main')}`}>
                    {clockOutTime}
                  </Text>
                </View>
              </View>
            </View>

            {/* Effective & Gross Hours */}
            <View className="flex-row justify-between items-center pt-3 mb-5">
              <Text className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                Effective hours <Text className={`font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{effectiveHours}</Text>
              </Text>
              <Text className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                Gross hours <Text className={`font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{grossHours}</Text>
              </Text>
            </View>

            {/* Dynamic Time Logs Section */}
            <Text className={`text-sm font-bold mb-3 ${isDark ? 'text-white' : 'text-text-main'}`}>
              Time Logs ({todayFootprints.length})
            </Text>

            {todayFootprints.length === 0 ? (
              <View className={`py-6 items-center justify-center rounded-xl border border-dashed ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'}`}>
                <Text className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>No time logs recorded today yet.</Text>
              </View>
            ) : (
              todayFootprints.map((item: any, idx: number) => {
                const logTime = item.timestamp ? new Date(Number(item.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Unknown';
                const logLabel = item.trackingMethod === 'CELLULAR' ? 'Cellular Punch' : item.trackingMethod === 'GPS' ? 'Remote Clock In' : 'Location Punch';
                const locationAddr = item.address || (item.latitude && item.longitude ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}` : 'Location Unavailable');

                return (
                  <View key={item.id || idx} className={`rounded-xl p-3 mb-3 border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'}`}>
                    <View className={`self-start px-2 py-0.5 rounded mb-2 ${isDark ? 'bg-slate-800' : 'bg-border/40'}`}>
                      <Text className={`text-[11px] font-semibold ${isDark ? 'text-slate-200' : 'text-text-main'}`}>{logLabel}</Text>
                    </View>

                    <View className="flex-row justify-between items-center mb-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-emerald-500 font-black text-xs">↙</Text>
                        <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{logTime}</Text>
                      </View>
                      <Text className="text-primary text-sm">📍</Text>
                    </View>
                    <Text className={`text-xs font-medium ml-4 mb-2 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                      {locationAddr}
                    </Text>

                    {idx === todayFootprints.length - 1 && clockOutTime === 'MISSING' && (
                      <View className={`flex-row items-center gap-1.5 pt-1 border-t ${isDark ? 'border-slate-800' : 'border-border'}`}>
                        <Text className="text-rose-500 font-black text-xs">↗</Text>
                        <Text className="text-xs font-semibold text-rose-500">OUT missing</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* Bottom Action Button */}
      <View className={`p-4 border-t ${isDark ? 'bg-[#1E293B] border-slate-700' : 'bg-background border-border'}`}>
        <TouchableOpacity 
          className="w-full bg-primary py-3.5 rounded-xl items-center justify-center active:opacity-90 shadow-sm"
          onPress={() => router.push('/leave-create' as any)}
        >
          <Text className="text-white font-bold text-base">Raise Request</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
