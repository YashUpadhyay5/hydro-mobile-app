import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { Picker } from '@react-native-picker/picker';
import { applyForLeave, fetchLeaveCategories, fetchEmployeeHolidays, describeLoadError, leaveErrorMessage } from '@/services/leaveService';
import { LeaveCategory, maxEndDate, describeDuration } from '@/utils/leaveCategory';
import { holidayMap, splitLeaveDays } from '@/utils/workingDays';
import { getLeaveSummary, formatLeaveDays, countInclusiveDays, estimateLeaveSplit } from '@/utils/leaveBalance';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDateISO } from '@/utils/date';

export default function LeaveCreateScreen() {
  const { user, refreshUserProfile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['leave', 'common']);

  const [reason, setReason] = useState('');

  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [selectionStep, setSelectionStep] = useState<'start' | 'end'>('start');

  const [submitting, setSubmitting] = useState(false);

  // Special leave categories come from the server. '' (nothing chosen) means ordinary leave, paid from EL and then LOP.
  type CategoriesState =
    | { status: 'loading' }
    | { status: 'ready'; categories: LeaveCategory[] }
    | { status: 'unsupported' }
    | { status: 'error'; message: string };
  const [categoriesState, setCategoriesState] = useState<CategoriesState>({ status: 'loading' });
  const [categoryCode, setCategoryCode] = useState('');

  // This employee's holidays (they differ by location). null = not known, so only Sundays are skipped in the estimate.
  const [holidays, setHolidays] = useState<{ date: string; title: string }[] | null>(null);
  const [holidaysNote, setHolidaysNote] = useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetchEmployeeHolidays(user)
      .then((list) => {
        if (cancelled) return;
        setHolidays(list);
        setHolidaysNote(list === null ? t('leave:holidays_unavailable', { defaultValue: 'Your holiday calendar is not available from this server, so this estimate only skips Sundays. The server skips your holidays when it counts.' }) : null);
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.warn('[LeaveCreate] holidays failed:', err?.message);
        setHolidaysNote(t('leave:holidays_failed', { defaultValue: 'Could not load your holidays, so this estimate only skips Sundays. The server skips your holidays when it counts.' }));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening of the screen
  }, []);

  const loadCategories = useCallback(async () => {
    setCategoriesState({ status: 'loading' });
    try {
      const list = await fetchLeaveCategories();
      setCategoriesState(list === null ? { status: 'unsupported' } : { status: 'ready', categories: list });
    } catch (err: any) {
      console.warn('[LeaveCreate] categories failed:', err?.message);
      setCategoriesState({ status: 'error', message: describeLoadError(err) });
    }
  }, []);

  React.useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const selectedCategory =
    categoriesState.status === 'ready' ? categoriesState.categories.find((c) => c.code === categoryCode) ?? null : null;
  // The latest end date the chosen category allows for the chosen start date.
  const categoryLastDay =
    selectedCategory && startDateStr ? maxEndDate(startDateStr, selectedCategory.durationValue, selectedCategory.durationUnit) : null;

  const onCategoryChange = (code: string) => {
    setCategoryCode(code);
    // Dates picked under the old choice may not fit the new allowance, so start the selection again.
    setStartDateStr('');
    setEndDateStr('');
    setSelectionStep('start');
  };

  // The balance is whatever the server reports for this login (GET /employees/:id), re-read on open.
  React.useEffect(() => {
    refreshUserProfile?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening of the screen
  }, []);

  const summary = getLeaveSummary(user);
  const calendarDays = countInclusiveDays(startDateStr, endDateStr);
  // Ordinary leave only uses working days: Sundays and this employee's holidays are skipped. A special leave
  // counts every calendar day. A preview only: the server counts the days and does the real EL / LOP split.
  const daySplit = useMemo(
    () => (startDateStr && endDateStr ? splitLeaveDays(startDateStr, endDateStr, holidayMap(holidays ?? [])) : null),
    [startDateStr, endDateStr, holidays]
  );
  const requestedDays = selectedCategory ? calendarDays : daySplit ? daySplit.working.length : calendarDays;
  const nothingToCount = !selectedCategory && !!daySplit && daySplit.all.length > 0 && daySplit.working.length === 0;
  const estimate = estimateLeaveSplit(requestedDays, summary.available);

  const pickerBg = isDark ? '#1E293B' : '#FFFFFF';
  const pickerBorder = isDark ? '#334155' : '#CBD5E1';
  const pickerTextColor = isDark ? '#F8FAFC' : '#0F172A';


  const getMarkedDates = () => {
    let marked: any = {};
    if (startDateStr) {
      marked[startDateStr] = { startingDay: true, color: '#0052CC', textColor: 'white' };
    }
    if (endDateStr) {
      marked[endDateStr] = { endingDay: true, color: '#0052CC', textColor: 'white' };
    }
    if (startDateStr && endDateStr) {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      
      let current = new Date(start);
      current.setDate(current.getDate() + 1);
      
      while (current < end) {
        marked[formatDateISO(current)] = { color: '#0052CC20', textColor: '#0f172a' };
        current.setDate(current.getDate() + 1);
      }
    }
    return marked;
  };

  const onDayPress = (day: any) => {
    if (selectionStep === 'start') {
      setStartDateStr(day.dateString);
      setEndDateStr('');
      setSelectionStep('end');
    } else {
      if (categoryLastDay && day.dateString > categoryLastDay) return;
      const start = new Date(startDateStr);
      const selected = new Date(day.dateString);
      if (selected < start) {
        setStartDateStr(day.dateString);
        setEndDateStr('');
        setSelectionStep('end');
      } else {
        setEndDateStr(day.dateString);
        setSelectionStep('start');
      }
    }
  };

  const handleSubmit = async () => {
    if (!startDateStr || !endDateStr) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('leave:err_dates', { defaultValue: 'Please select a start and end date on the calendar.' }));
      return;
    }
    if (!reason.trim()) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('leave:err_reason', { defaultValue: 'Please provide a reason for your leave request.' }));
      return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startCompare = new Date(startDateStr);
    startCompare.setHours(0, 0, 0, 0);

    if (startCompare < today) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('leave:err_past_date', { defaultValue: 'Start Date cannot be in the past.' }));
      return;
    }
    if (selectedCategory && (!categoryLastDay || endDateStr > categoryLastDay)) {
      Alert.alert(
        t('common:error', { defaultValue: 'Error' }),
        t('leave:err_category_duration', {
          defaultValue: '{{name}} allows up to {{duration}}.',
          name: selectedCategory.name,
          duration: describeDuration(selectedCategory.durationValue, selectedCategory.durationUnit),
        } as any)
      );
      return;
    }

    try {
      setSubmitting(true);
      // The server counts the days, splits them into EL and LOP (anything beyond the available balance
      // is loss of pay), saves the request as "pending" and notifies the admins.
      // A special leave is sent by its category: no EL and no loss of pay, and the server checks the allowance again.
      const result = await applyForLeave(user, { startDate: startDateStr, endDate: endDateStr, reason, category: selectedCategory?.code });

      // The balance changed on the server's side of things; re-read it so every screen shows it.
      await refreshUserProfile?.();

      const split = [
        selectedCategory ? selectedCategory.name : '',
        result?.totalDays !== undefined ? `${formatLeaveDays(result.totalDays)} ${t('leave:days_suffix', { defaultValue: 'Days' })}` : '',
        !selectedCategory && result?.elDays !== undefined ? `${t('leave:el_short', { defaultValue: 'EL' })} ${formatLeaveDays(result.elDays)}` : '',
        !selectedCategory && result?.lopDays !== undefined ? `${t('leave:lop_short', { defaultValue: 'LOP' })} ${formatLeaveDays(result.lopDays)}` : '',
      ].filter(Boolean).join(' · ');
      Alert.alert(
        t('common:success', { defaultValue: 'Success' }),
        `${t('leave:submit_success', { defaultValue: 'Leave request submitted successfully.' })}${split ? `\n${split}` : ''}\n${t('leave:awaiting_approval', { defaultValue: 'Status: pending approval.' })}`,
        [{ text: t('common:ok', { defaultValue: 'OK' }), onPress: () => router.back() }]
      );
    } catch (err: any) {
      console.error("Failed to submit leave:", err.message);
      Alert.alert(
        t('common:error', { defaultValue: 'Submission Error' }),
        leaveErrorMessage(err) || t('leave:submit_failed', { defaultValue: 'Failed to submit leave request.' })
      );
    } finally {
      setSubmitting(false);
    }
  };

    return (
      <ScrollView 
        style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: Math.max(insets.top + 12, 24), paddingBottom: Math.max(insets.bottom + 20, 24), paddingHorizontal: 20, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <Card className={`w-full ${isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-surface border-border'}`}>
          <CardContent>
            {/* Top Back Button & Title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Ionicons name="arrow-back" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
              </TouchableOpacity>
              <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>
                {t('leave:apply_leave', { defaultValue: 'Apply for Leave' })}
              </Text>
            </View>
            
            {/* Leave category: ordinary leave, or one of the special leaves this server offers */}
            <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
              {t('leave:category', { defaultValue: 'Leave category' })}
            </Text>
            {categoriesState.status === 'loading' ? (
              <View className="items-center py-3 mb-5">
                <ActivityIndicator size="small" color={isDark ? '#38BDF8' : '#0052CC'} />
              </View>
            ) : categoriesState.status === 'error' ? (
              <View className={`border rounded-xl p-3 mb-5 ${isDark ? 'bg-amber-950/60 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
                <Text className={`text-xs font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  {t('leave:err_categories', { defaultValue: 'Could not load special leave categories' })}: {categoriesState.message}
                </Text>
                <TouchableOpacity onPress={loadCategories} activeOpacity={0.7} className="self-start mt-1.5">
                  <Text className={`text-xs font-black ${isDark ? 'text-blue-400' : 'text-primary'}`}>{t('common:retry', { defaultValue: 'Retry' })}</Text>
                </TouchableOpacity>
              </View>
            ) : categoriesState.status === 'unsupported' ? (
              <Text className={`text-xs mb-5 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                {t('leave:categories_unsupported', { defaultValue: 'Special leave categories are not available on this server yet. You can apply for ordinary leave below.' })}
              </Text>
            ) : (
              <View style={{ borderWidth: 1, borderColor: pickerBorder, borderRadius: 12, backgroundColor: pickerBg, overflow: 'hidden', marginBottom: 20, justifyContent: 'center' }}>
                <Picker
                  selectedValue={categoryCode}
                  onValueChange={(value) => onCategoryChange(String(value))}
                  dropdownIconColor={pickerTextColor}
                  style={{ height: 52, width: '100%', color: pickerTextColor, backgroundColor: pickerBg }}
                >
                  <Picker.Item
                    label={t('leave:category_regular', { defaultValue: 'Regular leave (Earned Leave, then Loss of Pay)' })}
                    value=""
                    color={pickerTextColor}
                    style={{ backgroundColor: pickerBg }}
                  />
                  {categoriesState.categories.map((c) => (
                    <Picker.Item
                      key={c.code}
                      label={`${c.name} (${describeDuration(c.durationValue, c.durationUnit)})`}
                      value={c.code}
                      color={pickerTextColor}
                      style={{ backgroundColor: pickerBg }}
                    />
                  ))}
                </Picker>
              </View>
            )}

            {selectedCategory ? (
              /* Special leave: its own allowance, so neither the EL balance nor loss of pay applies */
              <View className={`border p-4 rounded-2xl mb-5 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-primary/5 border-primary/20'}`}>
                <Text className={`font-black text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-sky-400' : 'text-primary'}`}>
                  {selectedCategory.name}
                </Text>
                <Text className={`text-3xl font-black ${isDark ? 'text-white' : 'text-text-main'}`}>
                  {t('leave:up_to', { defaultValue: 'Up to {{duration}}', duration: describeDuration(selectedCategory.durationValue, selectedCategory.durationUnit) } as any)}
                </Text>
                <Text className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                  {t('leave:special_note', { defaultValue: 'Special leave is separate from your Earned Leave: no EL is used and no Loss of Pay applies.' })}
                </Text>
              </View>
            ) : (
              /* EL Balance display */
              <View className={`border p-4 rounded-2xl mb-5 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-primary/5 border-primary/20'}`}>
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className={`font-black text-xs uppercase tracking-wider ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('leave:avail_el', { defaultValue: 'Available Earned Leaves (EL)' })}</Text>
                </View>
                <Text className={`text-3xl font-black ${isDark ? 'text-white' : 'text-text-main'}`}>{formatLeaveDays(summary.available)} {t('leave:days_suffix', { defaultValue: 'Days' })}</Text>
              </View>
            )}

            {/* Visual Calendar */}
            <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
              {t('leave:select_dates', { defaultValue: 'Select Dates' })} {selectionStep === 'start' ? `(${t('leave:choose_start', { defaultValue: 'Choose Start Date' })})` : `(${t('leave:choose_end', { defaultValue: 'Choose End Date' })})`}
            </Text>
            <View className={`border rounded-xl overflow-hidden mb-5 ${isDark ? 'border-slate-700' : 'border-border'}`}>
              <Calendar
                markingType={'period'}
                markedDates={getMarkedDates()}
                onDayPress={onDayPress}
                minDate={formatDateISO(new Date())}
                // Once the start is chosen, days past the category's allowance can't be picked as the end.
                maxDate={selectedCategory && selectionStep === 'end' ? categoryLastDay ?? undefined : undefined}
                theme={{
                  calendarBackground: isDark ? '#1E293B' : '#ffffff',
                  textSectionTitleColor: isDark ? '#94A3B8' : '#64748b',
                  selectedDayBackgroundColor: isDark ? '#2563EB' : '#0052CC',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: isDark ? '#38BDF8' : '#0052CC',
                  dayTextColor: isDark ? '#F8FAFC' : '#0f172a',
                  textDisabledColor: isDark ? '#475569' : '#cbd5e1',
                  arrowColor: isDark ? '#38BDF8' : '#0052CC',
                  monthTextColor: isDark ? '#F8FAFC' : '#0f172a',
                  textMonthFontWeight: 'bold',
                  textDayHeaderFontWeight: '600'
                }}
              />
            </View>
            
            <View className={`flex-row justify-between items-center mb-5 p-3.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-primary/5 border-primary/20'}`}>
              <View>
                <Text className={`text-[10px] font-bold uppercase ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('leave:start_date', { defaultValue: 'Start' })}</Text>
                <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{startDateStr || '--/--/----'}</Text>
              </View>

              <View className={`px-3 py-1.5 rounded-full border items-center ${isDark ? 'bg-blue-950/80 border-blue-800' : 'bg-primary/10 border-primary/20'}`}>
                <Text className={`text-[10px] font-bold uppercase ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('leave:duration', { defaultValue: 'Duration' })}</Text>
                <Text className={`text-xs font-black ${isDark ? 'text-sky-300' : 'text-primary'}`}>{requestedDays} {t('leave:days_suffix', { defaultValue: 'Days' })}</Text>
              </View>

              <View>
                <Text className={`text-[10px] font-bold uppercase text-right ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('leave:end_date', { defaultValue: 'End' })}</Text>
                <Text className={`text-sm font-bold text-right ${isDark ? 'text-white' : 'text-text-main'}`}>{endDateStr || '--/--/----'}</Text>
              </View>
            </View>

            {nothingToCount && (
              <View className={`border rounded-xl p-3 mb-5 ${isDark ? 'bg-amber-950/60 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
                <Text className={`text-xs font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  {t('leave:err_no_working_days', { defaultValue: 'These dates are all Sundays or holidays, so no leave is needed.' })}
                </Text>
              </View>
            )}
            {!selectedCategory && holidaysNote && startDateStr && endDateStr && (
              <Text className={`text-[11px] mb-5 -mt-2 ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>{holidaysNote}</Text>
            )}

            {selectedCategory && categoryLastDay && (
              <Text className={`text-xs mb-5 -mt-2 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                {t('leave:latest_end', { defaultValue: 'Latest end date for {{name}}: {{date}}', name: selectedCategory.name, date: categoryLastDay } as any)}
              </Text>
            )}

            {/* Estimated breakdown: the server counts the days and does the real EL / LOP split (ordinary leave only) */}
            {!selectedCategory && startDateStr && endDateStr && requestedDays > 0 && (
              <>
                <View className={`border rounded-xl p-4 mb-4 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-primary/5 border-primary/20'}`}>
                  <Text className={`text-xs font-bold uppercase mb-3 ${isDark ? 'text-sky-400' : 'text-primary'}`}>
                    {t('leave:breakdown', { defaultValue: 'Estimated breakdown' })}
                  </Text>

                  {/* Total days bar */}
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:working_days', { defaultValue: 'Working days counted' })}</Text>
                    <View className={`px-3 py-1 rounded-full ${isDark ? 'bg-blue-600' : 'bg-primary'}`}>
                      <Text className="text-white text-sm font-black">{requestedDays} {t('leave:days_suffix', { defaultValue: 'Days' })}</Text>
                    </View>
                  </View>

                  {daySplit && (daySplit.sundays.length > 0 || daySplit.holidays.length > 0) && (
                    <Text className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                      {t('leave:not_counted', { defaultValue: 'Not counted:' })}{' '}
                      {[
                        daySplit.sundays.length > 0 ? (daySplit.sundays.length === 1 ? t('leave:one_sunday', { defaultValue: '1 Sunday' }) : t('leave:n_sundays', { defaultValue: '{{count}} Sundays', count: daySplit.sundays.length })) : '',
                        ...daySplit.holidays.map((h) => `${h.title} (${h.date.slice(8)}/${h.date.slice(5, 7)})`),
                      ].filter(Boolean).join(', ')}
                    </Text>
                  )}

                  {estimate && (
                    <>
                      <View className={`h-px mb-3 ${isDark ? 'bg-slate-700' : 'bg-border'}`} />

                      {/* EL row */}
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                          <View className="w-3 h-3 rounded-full bg-emerald-500" />
                          <Text className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('leave:earned_leave', { defaultValue: 'Earned Leave (EL)' })}</Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:of_available', { defaultValue: 'of {{count}} available', count: formatLeaveDays(summary.available) } as any)}</Text>
                          <View className={`px-3 py-1 rounded-full border ${isDark ? 'bg-emerald-950/80 border-emerald-800' : 'bg-emerald-100 border-emerald-300'}`}>
                            <Text className={`text-sm font-black ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{formatLeaveDays(estimate.el)} {t('leave:days_suffix', { defaultValue: 'Days' })}</Text>
                          </View>
                        </View>
                      </View>

                      {/* LOP row */}
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                          <View className="w-3 h-3 rounded-full bg-amber-500" />
                          <Text className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('leave:loss_of_pay', { defaultValue: 'Loss of Pay (LOP)' })}</Text>
                        </View>
                        <View className={`px-3 py-1 rounded-full border ${estimate.lop > 0 ? (isDark ? 'bg-amber-950/80 border-amber-800' : 'bg-amber-100 border-amber-300') : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border')}`}>
                          <Text className={`text-sm font-black ${estimate.lop > 0 ? (isDark ? 'text-amber-400' : 'text-amber-700') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
                            {formatLeaveDays(estimate.lop)} {t('leave:days_suffix', { defaultValue: 'Days' })}
                          </Text>
                        </View>
                      </View>

                      {/* Hint when lop > 0 */}
                      {estimate.lop > 0 && (
                        <View className={`mt-3 p-2 rounded-lg border ${isDark ? 'bg-amber-950/40 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
                          <Text className={`text-xs font-medium ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                            ⚠️ {t('leave:lop_hint', {
                              defaultValue: 'Your balance ({{available}}) is less than the selected {{days}} days. About {{lop}} day(s) will be Loss of Pay.',
                              available: formatLeaveDays(summary.available),
                              days: requestedDays,
                              lop: formatLeaveDays(estimate.lop),
                            } as any)}
                          </Text>
                        </View>
                      )}

                      {/* Fully covered by EL hint */}
                      {estimate.lop === 0 && estimate.el > 0 && (
                        <View className={`mt-3 p-2 rounded-lg border ${isDark ? 'bg-emerald-950/40 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                          <Text className={`text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                            ✅ {t('leave:el_covered_hint', { defaultValue: 'Fully covered by your Earned Leave balance.' })}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  <Text className={`text-[11px] mt-3 ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>
                    {t('leave:estimate_note', { defaultValue: 'This is an estimate. The final days and the earned-leave / loss-of-pay split are calculated by the server when you submit.' })}
                  </Text>
                </View>
              </>
            )}

            {/* Reason */}
            <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>{t('leave:reason', { defaultValue: 'Reason for Leave' })} *</Text>
            <Input
              placeholder={t('leave:reason_placeholder', { defaultValue: 'Please explain the reason for your leave request...' })}
              multiline={true}
              numberOfLines={4}
              value={reason}
              onChangeText={setReason}
              textAlignVertical="top"
              className="min-h-[100px] py-3 mb-6"
            />

            {/* Submit */}
            <Button 
              onPress={handleSubmit}
              disabled={submitting || !startDateStr || !endDateStr || !reason || nothingToCount}
              className="mb-3"
            >
              <Text className="text-white font-bold text-base">
                {submitting ? t('common:loading', { defaultValue: 'Submitting...' }) : t('leave:submit_btn', { defaultValue: 'Submit Request' })}
              </Text>
            </Button>

            {/* Cancel */}
            <Button 
              variant="ghost" 
              onPress={() => router.back()} 
              disabled={submitting}
            >
              <Text className={`font-bold text-sm ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('common:cancel', { defaultValue: 'Cancel' })}</Text>
            </Button>
          </CardContent>
        </Card>
      </ScrollView>
    );
  }
