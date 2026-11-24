import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useActivity } from '@/context/ActivityContext';
import { ActivityApiError, WorkList, fetchWorkList, getRecentTitles, toActivityApiError } from '@/services/activityService';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';
import { formatIstTime, formatMinutes } from '@/utils/activityTime';
import {
  NOTES_MAX,
  RuleError,
  TITLE_MAX,
  finishNeedsReason,
  parseWholeNumber,
  validatePlannedEnd,
  validatePlannedMinutes,
  validateTitle,
} from '@/utils/activityRules';
import { ActivityField, failureMessage, fieldForError, ruleErrorMessage } from '@/utils/activityMessages';

type Choice = '30' | '60' | '120' | 'custom' | 'time';
const QUICK: { key: Choice; minutes: number }[] = [
  { key: '30', minutes: 30 },
  { key: '60', minutes: 60 },
  { key: '120', minutes: 120 },
];

type WorkState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; list: WorkList };

export default function ActivityStartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  const { start, finish, cancel } = useActivity();

  const [work, setWork] = useState<WorkState>({ status: 'loading' });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [choice, setChoice] = useState<Choice>('60');
  const [customMinutes, setCustomMinutes] = useState('');
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<ActivityField, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // What the employee may log depends on their work place and can change in the HRMS dashboard: ask the server
  // every time this screen opens, never reuse an earlier answer, and never fall back to free text on a failure.
  const loadWorkList = useCallback(async () => {
    setWork({ status: 'loading' });
    try {
      setWork({ status: 'ready', list: await fetchWorkList() });
    } catch (err) {
      setWork({ status: 'error', message: failureMessage(t, toActivityApiError(err)) });
    }
    // The language changes `t`, which must not refetch; the list is loaded once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadWorkList();
    getRecentTitles().then(setRecent);
  }, [loadWorkList]);

  const list = work.status === 'ready' ? work.list : null;
  const isList = list?.mode === 'LIST';
  const selected = isList ? list.items.find((i) => i.key === selectedKey) ?? null : null;
  const fixedMinutes = selected && selected.minutes !== null ? selected.minutes : null;
  /** The time controls show for free text, and for a list item whose time the employee chooses. */
  const showTime = !!list && (!isList || (!!selected && fixedMinutes === null));

  const muted = isDark ? 'text-slate-400' : 'text-text-muted';
  const heading = isDark ? 'text-white' : 'text-text-main';
  const label = `text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`;
  const setError = (field: ActivityField, message: string | null) =>
    setErrors((prev) => ({ ...prev, [field]: message ?? undefined }));

  /** The end of the activity as the server wants it. Null if the input is not valid yet; {} when the server fixes the time. */
  const buildPlan = (): { plannedMinutes?: number; plannedEndAt?: number } | null => {
    if (fixedMinutes !== null) return {};
    const now = Date.now();
    let problem: RuleError | null = null;
    let field: ActivityField = 'minutes';
    let plan: { plannedMinutes?: number; plannedEndAt?: number } = {};
    if (choice === 'time') {
      field = 'time';
      let endMs: number | null = null;
      if (endTime) {
        const d = new Date(now);
        d.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
        endMs = d.getTime();
      }
      problem = validatePlannedEnd(endMs, now);
      plan = { plannedEndAt: endMs ?? undefined };
    } else {
      const minutes = choice === 'custom' ? parseWholeNumber(customMinutes) : QUICK.find((q) => q.key === choice)?.minutes ?? null;
      problem = validatePlannedMinutes(minutes);
      plan = { plannedMinutes: minutes ?? undefined };
    }
    if (problem) {
      setError(field, ruleErrorMessage(t, problem));
      return null;
    }
    return plan;
  };

  const startNow = async () => {
    if (!list) return;
    setErrors({});
    let whatProblem = false;
    if (isList) {
      if (!selected) {
        setError('title', t('attendance:act_err_work_required', { defaultValue: 'Choose what you are doing.' }));
        whatProblem = true;
      }
    } else {
      const titleProblem = validateTitle(title);
      if (titleProblem) {
        setError('title', ruleErrorMessage(t, titleProblem));
        whatProblem = true;
      }
    }
    const plan = whatProblem && isList ? {} : buildPlan();
    if (whatProblem || !plan) return;

    setSubmitting(true);
    const result = await start(isList && selected ? { work: selected, notes, ...plan } : { title, notes, ...plan });
    setSubmitting(false);

    if ('queued' in result && result.queued) {
      Alert.alert(
        t('attendance:act_saved_offline_title', { defaultValue: 'Saved on this phone' }),
        t('attendance:act_saved_offline_msg', { defaultValue: 'There is no connection. The activity will be sent as soon as you are online, with the time you started it.' }),
      );
      router.back();
      return;
    }
    if (result.ok) {
      router.back();
      return;
    }
    handleStartError(result.error);
  };

  const handleStartError = (error: ActivityApiError) => {
    if (error.code === 'ACTIVITY_IN_PROGRESS' && error.current) {
      const running = error.current;
      Alert.alert(
        t('attendance:act_running_title', { defaultValue: 'Another activity is running' }),
        t('attendance:act_running_msg', { defaultValue: '"{{title}}" is still running. Finish or cancel it first, then your new activity will start.', title: running.title }),
        [
          {
            text: t('attendance:act_finish', { defaultValue: 'Finish' }),
            onPress: async () => {
              if (finishNeedsReason(running, Date.now())) {
                // It ran late, so it needs a reason: answer it on the Extra time screen, then start again.
                router.push({ pathname: '/activity-extend', params: { id: running.id } } as any);
                return;
              }
              await closeThenStart(() => finish(running.id, {}));
            },
          },
          {
            text: t('attendance:act_cancel_activity', { defaultValue: 'Cancel activity' }),
            style: 'destructive',
            onPress: () => closeThenStart(() => cancel(running.id)),
          },
          { text: t('common:close', { defaultValue: 'Close' }), style: 'cancel' },
        ],
      );
      return;
    }
    if (error.code === 'WORK_REQUIRED') {
      // The choice was missing or not on the server's list: show the list it sent (or reload it) and ask again.
      setSelectedKey(null);
      if (error.workList) setWork({ status: 'ready', list: error.workList });
      else loadWorkList();
      setError('title', error.message);
      return;
    }
    setError(fieldForError(error), failureMessage(t, error));
  };

  /** Ends the running activity, then starts the new one with what is on screen. */
  const closeThenStart = async (end: () => Promise<{ ok: boolean; error?: ActivityApiError }>) => {
    setSubmitting(true);
    const ended = await end();
    setSubmitting(false);
    if (!ended.ok) {
      setError('general', ended.error ? failureMessage(t, ended.error) : null);
      return;
    }
    startNow();
  };

  const chipClass = (active: boolean) =>
    `px-4 py-2 rounded-full border mr-2 mb-2 ${
      active
        ? isDark ? 'bg-sky-500 border-sky-500' : 'bg-primary border-primary'
        : isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'
    }`;
  const chipText = (active: boolean) =>
    `text-sm font-bold ${active ? (isDark ? 'text-slate-900' : 'text-white') : isDark ? 'text-slate-300' : 'text-text-main'}`;

  const timeSection = (
    <View className="mb-5">
      <Text className={label}>{t('attendance:act_how_long', { defaultValue: 'When will you be done?' })} *</Text>
      <View className="flex-row flex-wrap">
        {QUICK.map((q) => (
          <TouchableOpacity key={q.key} className={chipClass(choice === q.key)} onPress={() => { setChoice(q.key); setError('minutes', null); setError('time', null); }}>
            <Text className={chipText(choice === q.key)}>{formatMinutes(q.minutes)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity className={chipClass(choice === 'custom')} onPress={() => { setChoice('custom'); setError('minutes', null); setError('time', null); }}>
          <Text className={chipText(choice === 'custom')}>{t('attendance:act_custom', { defaultValue: 'Custom' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity className={chipClass(choice === 'time')} onPress={() => { setChoice('time'); setError('minutes', null); setError('time', null); setShowPicker(true); }}>
          <Text className={chipText(choice === 'time')}>
            {choice === 'time' && endTime
              ? t('attendance:act_until', { defaultValue: 'Until {{time}}', time: formatIstTime(endTime.getTime(), getDateLocale()) })
              : t('attendance:act_pick_end_time', { defaultValue: 'Pick end time' })}
          </Text>
        </TouchableOpacity>
      </View>
      {choice === 'custom' && (
        <Input
          value={customMinutes}
          onChangeText={(v) => { setCustomMinutes(v); setError('minutes', null); }}
          placeholder={t('attendance:act_minutes_placeholder', { defaultValue: 'Minutes (1 to 960)' })}
          keyboardType="number-pad"
          error={errors.minutes}
          className="py-3 mt-1"
        />
      )}
      {choice !== 'custom' && !!errors.minutes && <Text className="text-sm text-red-500 ml-1 mt-1">{errors.minutes}</Text>}
      {!!errors.time && <Text className="text-sm text-red-500 ml-1 mt-1">{errors.time}</Text>}
      {showPicker && (
        <DateTimePicker
          value={endTime ?? new Date(Date.now() + 60 * 60_000)}
          mode="time"
          is24Hour={false}
          onChange={(event, picked) => {
            setShowPicker(false);
            if (event.type === 'set' && picked) { setEndTime(picked); setError('time', null); }
          }}
        />
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}
        contentContainerStyle={{ paddingTop: Math.max(insets.top + 12, 24), paddingBottom: Math.max(insets.bottom + 20, 24), paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center mb-4" accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
          <Text className={`text-base font-semibold ${heading}`}>{t('common:back', { defaultValue: 'Back' })}</Text>
        </TouchableOpacity>

        <Card className={isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-surface border-border'}>
          <CardContent>
            <Text className={`text-2xl font-black text-center mb-6 ${heading}`}>
              {t('attendance:act_start_title', { defaultValue: 'Start an activity' })}
            </Text>

            {work.status === 'loading' && (
              <View className="items-center py-10"><ActivityIndicator size="large" color={isDark ? '#38BDF8' : '#0F172A'} /></View>
            )}

            {work.status === 'error' && (
              <View className="items-center py-6">
                <Text className="text-center text-red-500 mb-4">{work.message}</Text>
                <Text className={`text-xs text-center mb-4 ${muted}`}>
                  {t('attendance:act_worklist_failed', { defaultValue: 'The list of work could not be loaded, so an activity cannot be started yet.' })}
                </Text>
                <Button variant="outline" onPress={loadWorkList}>
                  <Text className={`font-bold ${isDark ? 'text-blue-400' : 'text-primary'}`}>{t('common:retry', { defaultValue: 'Retry' })}</Text>
                </Button>
              </View>
            )}

            {list && (
              <>
                <View className="mb-5">
                  <Text className={label}>{t('attendance:act_what_doing', { defaultValue: 'What are you doing?' })} *</Text>
                  {isList ? (
                    <>
                      {!!list.label && (
                        <Text className={`text-xs mb-2 ${muted}`}>{t('attendance:act_work_place', { defaultValue: 'Work place: {{place}}', place: list.label })}</Text>
                      )}
                      {list.items.map((item) => {
                        const active = item.key === selectedKey;
                        return (
                          <TouchableOpacity
                            key={item.key}
                            activeOpacity={0.8}
                            onPress={() => { setSelectedKey(item.key); setError('title', null); setError('time', null); setError('minutes', null); }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            className={`flex-row items-center px-4 py-3 mb-2 rounded-xl border ${
                              active ? (isDark ? 'border-sky-400 bg-sky-950/40' : 'border-primary bg-blue-50') : isDark ? 'border-slate-700 bg-slate-900' : 'border-border bg-surface'
                            }`}
                          >
                            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? (isDark ? '#38BDF8' : '#0F172A') : isDark ? '#64748B' : '#94A3B8'} />
                            <Text className={`flex-1 ml-3 text-base font-semibold ${heading}`}>{item.title}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      {list.items.length === 0 && (
                        <Text className={`text-sm ${muted}`}>{t('attendance:act_worklist_empty', { defaultValue: 'There is nothing to choose from for your work place yet. Ask your admin.' })}</Text>
                      )}
                      {!!errors.title && <Text className="text-sm text-red-500 ml-1 mt-1">{errors.title}</Text>}
                      {fixedMinutes !== null && (
                        <Text className={`text-sm font-bold mt-2 ${heading}`}>
                          {t('attendance:act_fixed_time', { defaultValue: 'Time: {{minutes}} min', minutes: fixedMinutes })}
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Input
                        value={title}
                        onChangeText={(v) => { setTitle(v); setError('title', null); }}
                        placeholder={t('attendance:act_title_placeholder', { defaultValue: 'e.g. Client visit, Site inspection' })}
                        maxLength={TITLE_MAX}
                        error={errors.title}
                        className="py-3"
                      />
                      {recent.length > 0 && (
                        <View className="flex-row flex-wrap mt-3">
                          {recent.map((r) => (
                            <TouchableOpacity key={r} className={chipClass(title.trim().toLowerCase() === r.toLowerCase())} onPress={() => { setTitle(r); setError('title', null); }}>
                              <Text className={chipText(title.trim().toLowerCase() === r.toLowerCase())} numberOfLines={1}>{r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>

                {showTime && timeSection}

                <View className="mb-6">
                  <Text className={label}>{t('attendance:act_notes', { defaultValue: 'Notes' })} ({t('common:optional', { defaultValue: 'Optional' })})</Text>
                  <Input
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={t('attendance:act_notes_placeholder', { defaultValue: 'Anything your manager should know...' })}
                    maxLength={NOTES_MAX}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    className="min-h-[80px] py-3"
                  />
                </View>

                {!!errors.general && <Text className="text-sm text-red-500 mb-3 text-center">{errors.general}</Text>}

                <Button onPress={startNow} isLoading={submitting} disabled={submitting || (isList && list.items.length === 0)} className="mb-3">
                  <Text className="text-white font-bold text-base">{t('attendance:act_start', { defaultValue: 'Start' })}</Text>
                </Button>
                <Text className={`text-xs text-center ${muted}`}>
                  {t('attendance:act_alarm_hint', { defaultValue: 'When the time is up your phone will ring and ask how much extra time you need.' })}
                </Text>
              </>
            )}
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
