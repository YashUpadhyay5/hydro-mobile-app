import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CalendarSvgIcon } from '@/components/ui/SvgIcons';
import api from '@/services/api';
import { useAuth } from '../context/AuthContext';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SelectedPeriod {
  label: string;
  key: string;
  year?: number;
  monthIndex?: number;
  subtitle: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function LogsAndShiftsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dynamicHistory, setDynamicHistory] = useState<any[]>([]);
  const [isMonthPickerVisible, setIsMonthPickerVisible] = useState(false);

  // Default selection: Last 30 Days
  const now = new Date();
  const start30 = new Date(now);
  start30.setDate(start30.getDate() - 30);

  const defaultOption: SelectedPeriod = {
    label: 'Last 30 Days',
    key: 'LAST_30',
    subtitle: `(${start30.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`
  };

  const [selectedOption, setSelectedOption] = useState<SelectedPeriod>(defaultOption);
  const [pickerYear, setPickerYear] = useState<number>(now.getFullYear());

  useEffect(() => {
    fetchDynamicHistory(selectedOption);
  }, [user?.id, user?.empCode, selectedOption]);

  const fetchDynamicHistory = async (option: SelectedPeriod) => {
    if (!user?.id && !user?.empCode) return;
    try {
      setLoading(true);
      const res = await api.get('/attendance');
      const recordsMap: Record<string, any> = {};
      
      if (res.data && Array.isArray(res.data)) {
        const empCode = user?.empCode || user?.employeeCode;
        const uId = user?.id;
        const uName = user?.name?.toLowerCase();

        res.data.forEach((rec: any) => {
          const isUserMatch = (
            (empCode && rec.userId === empCode) ||
            (uId && rec.userId === uId) ||
            (empCode && rec.empCode === empCode) ||
            (uId && rec.empCode === uId) ||
            (uName && rec.userName && rec.userName.toLowerCase() === uName)
          );

          if (isUserMatch && rec.date) {
            recordsMap[rec.date] = rec;
          }
        });
      }

      const list: any[] = [];
      const todayISO = now.toISOString().split('T')[0];

      if (option.key === 'LAST_30') {
        for (let i = 0; i < 30; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          processDate(d, recordsMap, list, todayISO);
        }
      } else if (option.year !== undefined && option.monthIndex !== undefined) {
        const lastDayOfMonth = new Date(option.year, option.monthIndex + 1, 0).getDate();
        const startDay = (option.year === now.getFullYear() && option.monthIndex === now.getMonth())
          ? now.getDate()
          : lastDayOfMonth;

        for (let day = startDay; day >= 1; day--) {
          const d = new Date(option.year, option.monthIndex, day);
          processDate(d, recordsMap, list, todayISO);
        }
      }

      setDynamicHistory(list);
    } catch (e: any) {
      console.warn('[LogsAndShifts] Fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processDate = (d: Date, recordsMap: Record<string, any>, list: any[], todayISO: string) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateISO = `${year}-${month}-${day}`;

    const dayOfWeek = d.getDay();
    const dateStrFormatted = d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const isToday = dateISO === todayISO;
    const isSunday = dayOfWeek === 0;
    const rec = recordsMap[dateISO];

    if (isSunday) {
      list.push({
        id: dateISO,
        dateStr: dateStrFormatted,
        statusPill: 'Week Off',
        isOff: true
      });
    } else if (rec) {
      let lateBadge = null;
      let isLate = false;

      if (rec.checkIn) {
        const timeParts = rec.checkIn.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?/i);
        if (timeParts) {
          let hours = parseInt(timeParts[1], 10);
          const minutes = parseInt(timeParts[2], 10);
          const seconds = timeParts[3] ? parseInt(timeParts[3], 10) : 0;
          const ampm = timeParts[4] ? timeParts[4].toUpperCase() : null;

          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;

          const checkInMins = hours * 60 + minutes;
          const shiftStartMins = 9 * 60;

          if (checkInMins > shiftStartMins) {
            isLate = true;
            const diffMins = checkInMins - shiftStartMins;
            const lHrs = Math.floor(diffMins / 60);
            const lMins = diffMins % 60;
            lateBadge = `${lHrs}:${String(lMins).padStart(2, '0')}:${String(seconds).padStart(2, '0')} LATE`;
          }
        }
      }

      const hasMissingOut = !rec.checkOut || rec.checkOut === 'MISSING';
      const statusPill = hasMissingOut ? 'SWIPE(S) MISSING' : null;
      const alertBanner = (isLate || hasMissingOut) && !isToday ? '1 Penalties has been recorded' : null;

      list.push({
        id: dateISO,
        dateStr: dateStrFormatted,
        mode: 'Remote Clock in',
        statusPill,
        shift: '09:00 AM - 05:00 PM • (9AM - 5PM)',
        lateBadge,
        clockIn: rec.checkIn || '--:--',
        clockOut: rec.checkOut || '--:--',
        effectiveHours: rec.workingHours || '0h 0m',
        grossHours: rec.workingHours || '0h 0m',
        hasBlueBorder: isToday,
        alertBanner
      });
    } else {
      list.push({
        id: dateISO,
        dateStr: dateStrFormatted,
        shift: '09:00 AM - 05:00 PM • (9AM - 5PM)',
        noEntries: true,
        hasBlueBorder: isToday
      });
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDynamicHistory(selectedOption);
  };

  const selectMonthYear = (monthIdx: number, year: number) => {
    const monthName = `${MONTH_NAMES[monthIdx]} ${year}`;
    const firstDay = new Date(year, monthIdx, 1);
    const lastDay = new Date(year, monthIdx + 1, 0);
    const subtitle = `(${firstDay.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${lastDay.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;

    setSelectedOption({
      label: monthName,
      key: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
      year,
      monthIndex: monthIdx,
      subtitle
    });
    setIsMonthPickerVisible(false);
  };

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-surface'}`} style={{ paddingTop: Platform.OS === 'ios' ? 50 : 20 }}>
      {/* Header with Calendar SVG Trigger */}
      <View className={`flex-row items-center justify-between px-5 py-4 border-b z-10 ${isDark ? 'bg-[#1E293B] border-slate-700' : 'bg-background border-border'}`}>
        <View className="flex-row items-center">
          <TouchableOpacity 
            className={`w-10 h-10 rounded-full items-center justify-center border mr-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border'}`}
            onPress={() => router.back()}
          >
            <IconSymbol name="chevron.left" color={isDark ? '#F8FAFC' : '#1A1A1A'} size={22} />
          </TouchableOpacity>

          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={() => setIsMonthPickerVisible(true)}
          >
            <Text className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>
              {t('attendance:logs_and_shifts_title', { defaultValue: 'Logs and shifts' })}
            </Text>
            <View className="flex-row items-center gap-1">
              <Text className={`text-xs font-bold ${isDark ? 'text-sky-400' : 'text-primary'}`}>
                {selectedOption.label}
              </Text>
              <Text className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                {selectedOption.subtitle}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Calendar SVG Button to Trigger Month & Year Selection */}
        <TouchableOpacity 
          className={`w-11 h-11 rounded-2xl items-center justify-center border shadow-sm active:opacity-80 ${isDark ? 'bg-blue-950/60 border-blue-800' : 'bg-blue-50 border-blue-100'}`}
          onPress={() => setIsMonthPickerVisible(true)}
        >
          <CalendarSvgIcon size={24} color={isDark ? '#38BDF8' : '#0052CC'} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        className="flex-1 px-4 pt-4" 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[isDark ? '#38BDF8' : '#0052CC']} />}
      >
        {loading && !refreshing ? (
          <View className="py-12 justify-center items-center">
            <ActivityIndicator size="large" color={isDark ? '#38BDF8' : '#0052CC'} />
          </View>
        ) : (
          <View className="gap-3 pb-8">
            {dynamicHistory.map((item) => (
              <View 
                key={item.id} 
                className={`rounded-2xl p-4 border shadow-sm relative overflow-hidden ${isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-background border-border'} ${
                  item.hasBlueBorder ? (isDark ? 'border-l-4 border-l-sky-400' : 'border-l-4 border-l-primary') : ''
                }`}
              >
                {/* Top Row: Date & Status Pill */}
                <View className="flex-row justify-between items-start mb-1">
                  <View>
                    <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.dateStr}</Text>
                    {item.mode && (
                      <Text className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{item.mode}</Text>
                    )}
                  </View>

                  {item.statusPill === 'SWIPE(S) MISSING' && (
                    <View className={`px-2.5 py-0.5 rounded-full border ${isDark ? 'bg-rose-950/60 border-rose-800' : 'bg-rose-50 border-rose-100'}`}>
                      <Text className={`text-[10px] font-bold ${isDark ? 'text-rose-400' : 'color-rose-500'}`}>SWIPE(S) MISSING</Text>
                    </View>
                  )}

                  {item.statusPill === 'Week Off' && (
                    <View className={`px-2.5 py-0.5 rounded-full border ${isDark ? 'bg-blue-950/60 border-blue-800' : 'bg-blue-50 border-blue-100'}`}>
                      <Text className={`text-[10px] font-bold ${isDark ? 'text-sky-400' : 'color-primary'}`}>Week Off</Text>
                    </View>
                  )}
                </View>

                {/* If Week Off, short exit */}
                {item.isOff ? null : item.noEntries ? (
                  <View className={`pt-2 border-t mt-2 ${isDark ? 'border-slate-700' : 'border-border'}`}>
                    <Text className={`text-xs font-semibold mb-1 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                      {item.shift}
                    </Text>
                    <Text className="text-xs font-bold text-rose-500 mt-1">
                      No entries logged
                    </Text>
                  </View>
                ) : (
                  <View className={`pt-2 border-t mt-2 ${isDark ? 'border-slate-700' : 'border-border'}`}>
                    {/* Shift & Late Badge */}
                    <View className="flex-row justify-between items-center mb-3">
                      <Text className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                        {item.shift}
                      </Text>

                      {item.lateBadge && (
                        <View className={`px-2 py-0.5 rounded border ${isDark ? 'bg-amber-950/60 border-amber-800' : 'bg-amber-50 border-amber-100'}`}>
                          <Text className={`text-[10px] font-bold ${isDark ? 'text-amber-400' : 'color-amber-600'}`}>
                            {item.lateBadge}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Clock Times */}
                    <View className="flex-row justify-between items-center mb-3">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-emerald-500 font-black text-xs">↙</Text>
                        <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.clockIn}</Text>
                      </View>

                      <View className="flex-row items-center gap-1.5">
                        <Text className={item.clockOut === '--:--' ? (isDark ? 'text-slate-500 font-black text-xs' : 'text-text-muted font-black text-xs') : (isDark ? 'text-white font-black text-xs' : 'text-text-main font-black text-xs')}>
                          ↗
                        </Text>
                        <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.clockOut}</Text>
                      </View>
                    </View>

                    {/* Hours Summary */}
                    <View className="flex-row justify-between items-center">
                      <Text className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                        Effective hours: <Text className={`font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.effectiveHours}</Text>
                      </Text>
                      <Text className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                        Gross hours: <Text className={`font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.grossHours}</Text>
                      </Text>
                    </View>

                    {/* Penalty Alert Banner */}
                    {item.alertBanner && (
                      <View className={`rounded-xl p-2.5 mt-3 border ${isDark ? 'bg-rose-950/60 border-rose-800' : 'bg-rose-50/80 border-rose-100'}`}>
                        <Text className={`text-xs font-semibold ${isDark ? 'text-rose-400' : 'color-rose-600'}`}>
                          {item.alertBanner}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Dynamic Month & Year Grid Picker Modal */}
      <Modal
        visible={isMonthPickerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsMonthPickerVisible(false)}
      >
        <TouchableOpacity 
          className="flex-1 bg-black/60 justify-end"
          activeOpacity={1}
          onPress={() => setIsMonthPickerVisible(false)}
        >
          <View className={`rounded-t-3xl p-5 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-background border-border'}`}>
            {/* Modal Header */}
            <View className={`flex-row justify-between items-center pb-4 border-b mb-4 ${isDark ? 'border-slate-700' : 'border-border'}`}>
              <View className="flex-row items-center gap-2">
                <CalendarSvgIcon size={22} color={isDark ? '#38BDF8' : '#0052CC'} />
                <Text className={`text-lg font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>Select Month & Year</Text>
              </View>
              <TouchableOpacity 
                className={`w-8 h-8 rounded-full items-center justify-center border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border'}`}
                onPress={() => setIsMonthPickerVisible(false)}
              >
                <Text className={`font-bold text-sm ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Preset: Last 30 Days */}
            <TouchableOpacity
              className={`py-3 px-4 rounded-2xl mb-4 flex-row items-center justify-between border ${
                selectedOption.key === 'LAST_30' 
                  ? (isDark ? 'bg-blue-950/80 border-sky-400' : 'bg-blue-50 border-primary') 
                  : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border')
              }`}
              onPress={() => {
                setSelectedOption(defaultOption);
                setIsMonthPickerVisible(false);
              }}
            >
              <View className="flex-row items-center gap-2.5">
                <Text className="text-base">🕒</Text>
                <View>
                  <Text className={`text-sm font-bold ${selectedOption.key === 'LAST_30' ? (isDark ? 'text-sky-400' : 'text-primary') : (isDark ? 'text-white' : 'text-text-main')}`}>
                    Last 30 Days (Default)
                  </Text>
                  <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{defaultOption.subtitle}</Text>
                </View>
              </View>
              {selectedOption.key === 'LAST_30' && (
                <Text className={`font-bold text-base ${isDark ? 'text-sky-400' : 'text-primary'}`}>✓</Text>
              )}
            </TouchableOpacity>

            {/* Year Selector Navigation Bar */}
            <View className={`flex-row items-center justify-between p-3 rounded-2xl border mb-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border'}`}>
              <TouchableOpacity 
                className={`w-9 h-9 rounded-xl border items-center justify-center ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-background border-border'}`}
                onPress={() => setPickerYear(prev => prev - 1)}
              >
                <Text className={`font-bold text-base ${isDark ? 'text-white' : 'text-text-main'}`}>◀</Text>
              </TouchableOpacity>

              <Text className={`text-lg font-black tracking-wide ${isDark ? 'text-sky-400' : 'text-primary'}`}>
                {pickerYear}
              </Text>

              <TouchableOpacity 
                className={`w-9 h-9 rounded-xl border items-center justify-center ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-background border-border'}`}
                onPress={() => setPickerYear(prev => prev + 1)}
              >
                <Text className={`font-bold text-base ${isDark ? 'text-white' : 'text-text-main'}`}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* 12-Month Grid (3 columns x 4 rows) */}
            <View className="flex-row flex-wrap justify-between gap-y-3 mb-2">
              {MONTH_SHORT.map((mShort, idx) => {
                const isSelected = selectedOption.year === pickerYear && selectedOption.monthIndex === idx;
                const isFuture = pickerYear > now.getFullYear() || (pickerYear === now.getFullYear() && idx > now.getMonth());

                return (
                  <TouchableOpacity
                    key={mShort}
                    disabled={isFuture}
                    style={{ width: '31%' }}
                    className={`py-3.5 rounded-2xl items-center justify-center border ${
                      isSelected 
                        ? (isDark ? 'bg-blue-600 border-blue-500 shadow-sm' : 'bg-primary border-primary shadow-sm') 
                        : isFuture
                        ? (isDark ? 'bg-slate-800/30 border-slate-800/30 opacity-30' : 'bg-surface/40 border-border/40 opacity-40')
                        : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border active:bg-blue-50')
                    }`}
                    onPress={() => selectMonthYear(idx, pickerYear)}
                  >
                    <Text className={`text-sm font-bold ${isSelected ? 'text-white' : (isDark ? 'text-slate-200' : 'text-text-main')}`}>
                      {mShort}
                    </Text>
                    <Text className={`text-[10px] mt-0.5 font-medium ${isSelected ? 'text-white/80' : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
                      {MONTH_NAMES[idx].slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
