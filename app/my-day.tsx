import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import ActivityStateBadge from '@/components/ActivityStateBadge';
import { Activity, fetchActivitiesForDate, toActivityApiError } from '@/services/activityService';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';
import { formatIstTime, formatMinutes, istDateString, shiftDateString } from '@/utils/activityTime';
import { failureMessage } from '@/utils/activityMessages';

export default function MyDayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  const locale = getDateLocale();

  const today = istDateString(Date.now());
  const [date, setDate] = useState(today);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async (forDate: string, pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const day = await fetchActivitiesForDate(forDate);
      setActivities(day.activities);
    } catch (err) {
      setError(failureMessage(t, toActivityApiError(err)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    load(date);
    // Reload only when the day changes; `load` changes with the language, which must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const heading = isDark ? 'text-white' : 'text-text-main';
  const muted = isDark ? 'text-slate-400' : 'text-text-muted';
  const body = isDark ? 'text-slate-300' : 'text-text-secondary';

  const dateLabel = new Date(`${date}T12:00:00+05:30`).toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });

  const range = (from: number, to: number | null) =>
    `${formatIstTime(from, locale)} – ${to ? formatIstTime(to, locale) : t('attendance:act_now', { defaultValue: 'now' })}`;

  const renderItem = ({ item }: { item: Activity }) => {
    const running = item.status === 'IN_PROGRESS';
    const actualMinutes = item.takenMinutes ?? Math.max(0, Math.floor(((item.endedAt ?? Date.now()) - item.startedAt) / 60_000));
    return (
      <Card className={`mb-3 p-4 ${isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-surface border-border'}`}>
        <View className="flex-row justify-between items-start mb-2">
          <Text className={`flex-1 mr-3 text-base font-extrabold ${heading}`}>{item.title}</Text>
          <ActivityStateBadge state={item.state} />
        </View>
        <Text className={`text-xs ${muted}`}>
          {t('attendance:act_planned', { defaultValue: 'Planned' })}: {range(item.startedAt, item.plannedEndAt)} ({formatMinutes(item.plannedMinutes)})
        </Text>
        <Text className={`text-xs mt-0.5 ${body}`}>
          {running ? t('attendance:act_so_far', { defaultValue: 'So far' }) : t('attendance:act_actual', { defaultValue: 'Actual' })}: {range(item.startedAt, item.endedAt)} ({formatMinutes(actualMinutes)})
        </Text>
        {item.overMinutes > 0 && (
          <Text className="text-xs mt-0.5 text-red-500 font-bold">
            {t('attendance:act_over_by', { defaultValue: 'Over by {{time}}', time: formatMinutes(item.overMinutes) })}
          </Text>
        )}
        {!!item.notes && <Text className={`text-xs mt-2 ${body}`}>{item.notes}</Text>}
        {item.extensions.length > 0 && (
          <View className={`mt-3 pt-3 border-t ${isDark ? 'border-slate-700' : 'border-border'}`}>
            <Text className={`text-xs font-bold mb-1 ${muted}`}>{t('attendance:act_extensions', { defaultValue: 'Extra time asked' })}</Text>
            {item.extensions.map((e, i) => (
              <Text key={i} className={`text-xs mb-1 ${body}`}>
                +{formatMinutes(e.extraMinutes)}{e.at ? ` (${formatIstTime(e.at, locale)})` : ''} — {e.reason}
              </Text>
            ))}
          </View>
        )}
        {!!item.finishReason && (
          <Text className={`text-xs mt-2 ${body}`}>
            {t('attendance:act_finish_reason', { defaultValue: 'Reason for finishing late' })}: {item.finishReason}
          </Text>
        )}
      </Card>
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: isDark ? '#0F172A' : '#FAFAFA', paddingTop: Math.max(insets.top + 8, 20) }}>
      <View className="flex-row items-center px-4 mb-3">
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" className="p-2">
          <Ionicons name="chevron-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
        </TouchableOpacity>
        <Text className={`flex-1 text-xl font-black ${heading}`}>{t('attendance:act_my_day', { defaultValue: 'My day' })}</Text>
        {date !== today && (
          <TouchableOpacity onPress={() => setDate(today)} className="px-3 py-1.5">
            <Text className={`text-sm font-bold ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('attendance:act_today', { defaultValue: 'Today' })}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="flex-row items-center justify-between px-4 mb-3">
        <TouchableOpacity onPress={() => setDate(shiftDateString(date, -1))} className="p-2" accessibilityLabel={t('attendance:act_prev_day', { defaultValue: 'Previous day' })}>
          <Ionicons name="chevron-back-circle-outline" size={26} color={isDark ? '#94A3B8' : '#475569'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowPicker(true)} className="flex-1 items-center">
          <Text className={`text-base font-bold ${heading}`}>{dateLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setDate(shiftDateString(date, 1))}
          disabled={date >= today}
          className="p-2"
          accessibilityLabel={t('attendance:act_next_day', { defaultValue: 'Next day' })}
        >
          <Ionicons name="chevron-forward-circle-outline" size={26} color={date >= today ? (isDark ? '#334155' : '#CBD5E1') : isDark ? '#94A3B8' : '#475569'} />
        </TouchableOpacity>
      </View>

      {showPicker && (
        <DateTimePicker
          value={new Date(`${date}T12:00:00+05:30`)}
          mode="date"
          maximumDate={new Date()}
          onChange={(event, picked) => {
            setShowPicker(false);
            if (event.type === 'set' && picked) {
              const chosen = istDateString(new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 12).getTime());
              setDate(chosen > today ? today : chosen);
            }
          }}
        />
      )}

      {loading ? (
        <ActivityIndicator className="mt-10" size="large" color={isDark ? '#38BDF8' : '#0F172A'} />
      ) : error ? (
        <View className="items-center px-8 mt-10">
          <Text className="text-center text-red-500 mb-4">{error}</Text>
          <TouchableOpacity onPress={() => load(date)} className={`px-5 py-2 rounded-full border ${isDark ? 'border-sky-400' : 'border-primary'}`}>
            <Text className={`font-bold ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('common:retry', { defaultValue: 'Retry' })}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(a) => a.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 20, 24) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(date, true)} />}
          ListEmptyComponent={
            <Text className={`text-center mt-12 ${muted}`}>{t('attendance:act_empty_day', { defaultValue: 'No activities logged for this day.' })}</Text>
          }
        />
      )}
    </View>
  );
}
