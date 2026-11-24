import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActivity } from '@/context/ActivityContext';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';
import { countdownTo, formatIstTime, formatMinutes } from '@/utils/activityTime';
import { finishNeedsReason } from '@/utils/activityRules';
import { failureMessage } from '@/utils/activityMessages';

/**
 * Home-screen card for Day Activities: the running activity with a live countdown, or a way to start one.
 * What it shows always comes from the server (see ActivityContext), never from a stale local copy.
 */
export default function CurrentActivityCard() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  const { current, queued, loading, droppedNotice, dismissDroppedNotice, discardQueued, finish, cancel } = useActivity();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<'finish' | 'cancel' | null>(null);
  const locale = getDateLocale();

  const live = !!current && current.status === 'IN_PROGRESS';
  useEffect(() => {
    if (!live && !queued) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live, queued]);

  const surface = isDark ? '#1E293B' : '#FFFFFF';
  const border = isDark ? '#334155' : '#E2E8F0';
  const heading = isDark ? '#F8FAFC' : '#0F172A';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const box = { backgroundColor: surface, borderColor: border, borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16 } as const;

  const droppedText = droppedNotice === 'TOO_OLD'
    ? t('attendance:act_dropped_old', { defaultValue: 'An activity saved offline was not sent because it started more than 12 hours ago.' })
    : droppedNotice === 'CONFLICT'
      ? t('attendance:act_dropped_conflict', { defaultValue: 'An activity saved offline was not sent because another activity was already running.' })
      : droppedNotice
        ? t('attendance:act_dropped_rejected', { defaultValue: 'An activity saved offline was rejected by the server and was not sent.' })
        : null;
  const notice = droppedText ? (
    <TouchableOpacity onPress={dismissDroppedNotice} style={{ ...box, backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }}>
      <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '600' }}>{droppedText}</Text>
    </TouchableOpacity>
  ) : null;

  if (loading && !current && !queued) return null;

  const openExtend = (id: string) => router.push({ pathname: '/activity-extend', params: { id } } as any);

  if (current && current.status === 'IN_PROGRESS') {
    const countdown = countdownTo(current.deadlineAt, now);
    const over = countdown.overdue;

    const onFinish = async () => {
      if (finishNeedsReason(current, Date.now())) {
        openExtend(current.id); // a late finish needs a reason: ask on the screen that has the reason box
        return;
      }
      setBusy('finish');
      const result = await finish(current.id, {});
      setBusy(null);
      if (!result.ok) {
        if (result.error.code === 'REASON_REQUIRED') openExtend(current.id);
        else Alert.alert(t('common:error', { defaultValue: 'Error' }), failureMessage(t, result.error));
      }
    };

    const onCancel = () => {
      Alert.alert(
        t('attendance:act_cancel_confirm_title', { defaultValue: 'Cancel this activity?' }),
        t('attendance:act_cancel_confirm_msg', { defaultValue: '"{{title}}" will be marked as cancelled.', title: current.title }),
        [
          { text: t('attendance:act_keep', { defaultValue: 'Keep it' }), style: 'cancel' },
          {
            text: t('attendance:act_cancel_activity', { defaultValue: 'Cancel activity' }),
            style: 'destructive',
            onPress: async () => {
              setBusy('cancel');
              const result = await cancel(current.id);
              setBusy(null);
              if (!result.ok) Alert.alert(t('common:error', { defaultValue: 'Error' }), failureMessage(t, result.error));
            },
          },
        ],
      );
    };

    const action = (text: string, onPress: () => void, color: string, solid = false, loadingNow = false) => (
      <TouchableOpacity
        onPress={onPress}
        disabled={busy !== null}
        activeOpacity={0.8}
        style={{
          flex: 1, marginHorizontal: 3, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: solid ? color : 'transparent', borderWidth: 1, borderColor: color, opacity: busy !== null && !loadingNow ? 0.5 : 1,
        }}
      >
        {loadingNow ? <ActivityIndicator size="small" color={solid ? '#fff' : color} /> : (
          <Text style={{ color: solid ? '#fff' : color, fontWeight: '800', fontSize: 13 }}>{text}</Text>
        )}
      </TouchableOpacity>
    );

    return (
      <>
        {notice}
        <View style={{ ...box, borderColor: over ? '#EF4444' : border, borderWidth: over ? 2 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Ionicons name="timer-outline" size={18} color={over ? '#EF4444' : muted} />
            <Text style={{ color: muted, fontSize: 11, fontWeight: '800', marginLeft: 6 }}>
              {t('attendance:act_current', { defaultValue: 'CURRENT ACTIVITY' })}
            </Text>
          </View>
          <Text style={{ color: heading, fontSize: 18, fontWeight: '900' }} numberOfLines={2}>{current.title}</Text>
          {over ? (
            <Text style={{ color: '#EF4444', fontSize: 22, fontWeight: '900', marginTop: 6 }}>
              {t('attendance:act_over_by', { defaultValue: 'Over by {{time}}', time: formatMinutes(countdown.minutes) })}
            </Text>
          ) : (
            <Text style={{ color: heading, fontSize: 26, fontWeight: '900', marginTop: 6, fontVariant: ['tabular-nums'] }}>{countdown.clock}</Text>
          )}
          <Text style={{ color: muted, fontSize: 12, marginTop: 2, marginBottom: 14 }}>
            {t('attendance:act_planned_until', { defaultValue: 'Planned until {{time}}', time: formatIstTime(current.deadlineAt, locale) })}
            {current.extensions.length > 0 ? ` · ${t('attendance:act_extended_n', { defaultValue: 'extended {{count}}×', count: current.extensions.length })}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
            {action(t('attendance:act_extra_time', { defaultValue: 'Extra time' }), () => openExtend(current.id), '#2563EB')}
            {action(t('attendance:act_finish', { defaultValue: 'Finish' }), onFinish, '#16A34A', true, busy === 'finish')}
            {action(t('common:cancel', { defaultValue: 'Cancel' }), onCancel, '#DC2626', false, busy === 'cancel')}
          </View>
          <TouchableOpacity onPress={() => router.push('/my-day' as any)} style={{ alignSelf: 'flex-end', marginTop: 10 }}>
            <Text style={{ color: isDark ? '#38BDF8' : '#2563EB', fontWeight: '800', fontSize: 12 }}>
              {t('attendance:act_my_day', { defaultValue: 'My day' })} ›
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (queued) {
    const left = countdownTo(queued.plannedEndAt, now);
    return (
      <>
        {notice}
        <View style={box}>
          <Text style={{ color: '#B45309', fontSize: 11, fontWeight: '800' }}>
            {t('attendance:act_waiting_sync', { defaultValue: 'SAVED ON THIS PHONE · WAITING FOR A CONNECTION' })}
          </Text>
          <Text style={{ color: heading, fontSize: 18, fontWeight: '900', marginTop: 4 }} numberOfLines={2}>{queued.title}</Text>
          <Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
            {left.overdue
              ? t('attendance:act_over_by', { defaultValue: 'Over by {{time}}', time: formatMinutes(left.minutes) })
              : t('attendance:act_planned_until', { defaultValue: 'Planned until {{time}}', time: formatIstTime(queued.plannedEndAt, locale) })}
          </Text>
          <TouchableOpacity onPress={discardQueued} style={{ marginTop: 12 }}>
            <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 13 }}>{t('attendance:act_discard', { defaultValue: 'Discard' })}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  // Nothing running: the two ways in.
  const entry = (icon: keyof typeof Ionicons.glyphMap, text: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ flex: 1, marginHorizontal: 4, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={icon} size={18} color={isDark ? '#38BDF8' : '#2563EB'} />
      <Text style={{ color: heading, fontWeight: '800', fontSize: 13, marginLeft: 6 }}>{text}</Text>
    </TouchableOpacity>
  );
  return (
    <>
      {notice}
      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 16 }}>
        {entry('add-circle-outline', t('attendance:act_start_activity', { defaultValue: 'Start activity' }), () => router.push('/activity-start' as any))}
        {entry('list-outline', t('attendance:act_my_day', { defaultValue: 'My day' }), () => router.push('/my-day' as any))}
      </View>
    </>
  );
}
