import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CellularTracker from '../modules/cellular-tracker';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import ActivityStateBadge from '@/components/ActivityStateBadge';
import { useActivity } from '@/context/ActivityContext';
import { Activity, ActivityApiError, fetchActivitiesForDate } from '@/services/activityService';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';
import { countdownTo, formatIstTime, formatMinutes } from '@/utils/activityTime';
import { REASON_MAX, finishNeedsReason, parseWholeNumber, validateExtraMinutes, validateReason } from '@/utils/activityRules';
import { failureMessage, isStaleError, ruleErrorMessage } from '@/utils/activityMessages';

const QUICK_MINUTES = [15, 30, 60];

/** Removes the time-is-up notification(s) from the tray, without touching chat notifications. */
async function clearActivityNotifications() {
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => (n.request.content.data as any)?.action === 'activity_extend')
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    // the tray is a convenience; the sound was already stopped natively
  }
}

export default function ActivityExtendScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { current, loading, refresh, extend, finish } = useActivity();

  const [other, setOther] = useState<Activity | null>(null); // an activity that is no longer the running one
  const [lookedUp, setLookedUp] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [minutesChoice, setMinutesChoice] = useState<number | 'custom'>(30);
  const [customMinutes, setCustomMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [minutesError, setMinutesError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'extend' | 'finish' | null>(null);
  const [serverWantsReason, setServerWantsReason] = useState(false);

  // Opening this screen answers the alarm: stop the ringing and clear the notification.
  useEffect(() => {
    CellularTracker.silenceActivityAlarm();
    clearActivityNotifications();
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The activity named by the alarm may have ended already (answered on another phone, or finished): show how it ended.
  const target = current && (!id || current.id === id) ? current : null;
  useEffect(() => {
    if (loading || target || !id || lookedUp) return;
    setLookedUp(true);
    fetchActivitiesForDate()
      .then((day) => setOther(day.activities.find((a) => a.id === id) ?? null))
      .catch(() => setOther(null));
  }, [loading, target, id, lookedUp]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const surface = isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-surface border-border';
  const heading = isDark ? 'text-white' : 'text-text-main';
  const muted = isDark ? 'text-slate-400' : 'text-text-muted';
  const label = `text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`;

  const showError = (error: ActivityApiError) => {
    if (isStaleError(error)) {
      // The activity is gone or already ended: tell the employee, the context has re-read the server.
      Alert.alert(t('attendance:act_no_longer_title', { defaultValue: 'Activity already ended' }), error.message, [{ text: t('common:ok', { defaultValue: 'OK' }), onPress: leave }]);
      return;
    }
    if (error.code === 'REASON_REQUIRED') {
      setServerWantsReason(true);
      setReasonError(error.message);
      return;
    }
    if (error.code === 'INVALID_EXTRA_MINUTES') {
      setMinutesError(error.message);
      return;
    }
    setGeneralError(failureMessage(t, error));
  };

  if (loading && !target) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}>
        <ActivityIndicator size="large" color={isDark ? '#38BDF8' : '#0F172A'} />
      </View>
    );
  }

  const shell = (children: React.ReactNode) => (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}
        contentContainerStyle={{ paddingTop: Math.max(insets.top + 12, 24), paddingBottom: Math.max(insets.bottom + 20, 24), paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={leave} className="flex-row items-center mb-4" accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
          <Text className={`text-base font-semibold ${heading}`}>{t('common:back', { defaultValue: 'Back' })}</Text>
        </TouchableOpacity>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // No running activity: show the one the alarm was about with how it ended, or say there is none.
  if (!target) {
    const done = other;
    return shell(
      <Card className={surface}>
        <CardContent>
          {done ? (
            <>
              <Text className={`text-xl font-black mb-2 ${heading}`}>{done.title}</Text>
              <ActivityStateBadge state={done.state} />
              <Text className={`text-sm mt-4 ${muted}`}>
                {done.endedAt
                  ? t('attendance:act_ended_at', { defaultValue: 'Ended at {{time}}.', time: formatIstTime(done.endedAt, getDateLocale()) })
                  : t('attendance:act_not_running', { defaultValue: 'This activity is no longer running.' })}
              </Text>
              {!!done.finishReason && <Text className={`text-sm mt-2 ${heading}`}>{done.finishReason}</Text>}
            </>
          ) : (
            <Text className={`text-base ${heading}`}>{t('attendance:act_none_running', { defaultValue: 'You have no running activity.' })}</Text>
          )}
          <Button onPress={leave} className="mt-6"><Text className="text-white font-bold">{t('common:ok', { defaultValue: 'OK' })}</Text></Button>
        </CardContent>
      </Card>,
    );
  }

  const countdown = countdownTo(target.deadlineAt, now);
  const lateFinish = finishNeedsReason(target, now) || serverWantsReason;
  const chip = (active: boolean) =>
    `px-4 py-2 rounded-full border mr-2 mb-2 ${active ? (isDark ? 'bg-sky-500 border-sky-500' : 'bg-primary border-primary') : isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'}`;
  const chipText = (active: boolean) =>
    `text-sm font-bold ${active ? (isDark ? 'text-slate-900' : 'text-white') : isDark ? 'text-slate-300' : 'text-text-main'}`;

  const extraMinutes = minutesChoice === 'custom' ? parseWholeNumber(customMinutes) : minutesChoice;

  const sendExtra = async () => {
    setMinutesError(null);
    setReasonError(null);
    setGeneralError(null);
    const minutesProblem = validateExtraMinutes(extraMinutes);
    const reasonProblem = validateReason(reason, true);
    if (minutesProblem) setMinutesError(ruleErrorMessage(t, minutesProblem));
    if (reasonProblem) setReasonError(ruleErrorMessage(t, reasonProblem));
    if (minutesProblem || reasonProblem) return;
    setBusy('extend');
    const result = await extend(target.id, extraMinutes as number, reason);
    setBusy(null);
    if (result.ok) {
      CellularTracker.silenceActivityAlarm(); // the new deadline re-arms the alarm; nothing should still be ringing
      leave();
      return;
    }
    showError(result.error);
  };

  const finishNow = async () => {
    setReasonError(null);
    setGeneralError(null);
    const reasonProblem = validateReason(reason, lateFinish);
    if (reasonProblem) {
      setReasonError(ruleErrorMessage(t, reasonProblem));
      return;
    }
    setBusy('finish');
    const result = await finish(target.id, { reason });
    setBusy(null);
    if (result.ok) {
      leave();
      return;
    }
    showError(result.error);
  };

  return shell(
    <Card className={surface}>
      <CardContent>
        <Text className={`text-2xl font-black mb-1 ${heading}`}>{target.title}</Text>
        <Text className={`text-sm mb-1 ${muted}`}>
          {t('attendance:act_planned_until', { defaultValue: 'Planned until {{time}}', time: formatIstTime(target.deadlineAt, getDateLocale()) })}
        </Text>
        {countdown.overdue ? (
          <Text className="text-lg font-black text-red-500 mb-5">
            {t('attendance:act_over_by', { defaultValue: 'Over by {{time}}', time: formatMinutes(countdown.minutes) })}
          </Text>
        ) : (
          <Text className={`text-lg font-black mb-5 ${heading}`}>
            {t('attendance:act_left', { defaultValue: '{{time}} left', time: countdown.clock })}
          </Text>
        )}

        <Text className={`text-base font-bold mb-3 ${heading}`}>
          {t('attendance:act_extra_question', { defaultValue: 'How much extra time do you need, and why?' })}
        </Text>

        <View className="mb-4">
          <Text className={label}>{t('attendance:act_extra_minutes', { defaultValue: 'Extra time' })}</Text>
          <View className="flex-row flex-wrap">
            {QUICK_MINUTES.map((m) => (
              <TouchableOpacity key={m} className={chip(minutesChoice === m)} onPress={() => { setMinutesChoice(m); setMinutesError(null); }}>
                <Text className={chipText(minutesChoice === m)}>{formatMinutes(m)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity className={chip(minutesChoice === 'custom')} onPress={() => { setMinutesChoice('custom'); setMinutesError(null); }}>
              <Text className={chipText(minutesChoice === 'custom')}>{t('attendance:act_custom', { defaultValue: 'Custom' })}</Text>
            </TouchableOpacity>
          </View>
          {minutesChoice === 'custom' && (
            <Input
              value={customMinutes}
              onChangeText={(v) => { setCustomMinutes(v); setMinutesError(null); }}
              placeholder={t('attendance:act_extra_placeholder', { defaultValue: 'Minutes (5 to 480)' })}
              keyboardType="number-pad"
              className="py-3"
            />
          )}
          {!!minutesError && <Text className="text-sm text-red-500 ml-1 mt-1">{minutesError}</Text>}
        </View>

        <View className="mb-5">
          <Text className={label}>
            {t('attendance:act_reason', { defaultValue: 'Reason' })}{lateFinish ? ' *' : ''}
          </Text>
          <Input
            value={reason}
            onChangeText={(v) => { setReason(v); setReasonError(null); }}
            placeholder={t('attendance:act_reason_placeholder', { defaultValue: 'Why do you need more time?' })}
            maxLength={REASON_MAX}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            error={reasonError ?? undefined}
            className="min-h-[90px] py-3"
          />
        </View>

        {!!generalError && <Text className="text-sm text-red-500 mb-3 text-center">{generalError}</Text>}

        <Button onPress={sendExtra} isLoading={busy === 'extend'} disabled={busy !== null} className="mb-3">
          <Text className="text-white font-bold text-base">{t('attendance:act_send_extra', { defaultValue: 'Send extra time' })}</Text>
        </Button>
        <Button variant="outline" onPress={finishNow} isLoading={busy === 'finish'} disabled={busy !== null}>
          <Text className={`font-bold text-base ${isDark ? 'text-blue-400' : 'text-primary'}`}>{t('attendance:act_finish_now', { defaultValue: 'Finish now' })}</Text>
        </Button>
        {lateFinish && (
          <Text className={`text-xs text-center mt-3 ${muted}`}>
            {t('attendance:act_late_reason_hint', { defaultValue: 'This activity ran late, so finishing needs a reason.' })}
          </Text>
        )}
      </CardContent>
    </Card>,
  );
}
