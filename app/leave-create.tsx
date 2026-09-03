import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { Calendar } from 'react-native-calendars';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

const formatDateISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function LeaveCreateScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['leave', 'common']);

  const [leaveType, setLeaveType] = useState('Sick Leave');
  const [reason, setReason] = useState('');
  
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [selectionStep, setSelectionStep] = useState<'start' | 'end'>('start');
  
  const [submitting, setSubmitting] = useState(false);
  
  const [profile, setProfile] = useState<any>(null);
  const [elDays, setElDays] = useState(0);
  const [lopDays, setLopDays] = useState(0);

  const accruedEL = profile ? Math.max(0, profile.allowedLeaves - profile.consumedLeaves) : 0;

  React.useEffect(() => {
    if (user?.id) {
      api.get(`/employees/${user.id}`).then(res => {
        if (res.data) {
          setProfile(res.data);
        }
      }).catch(err => console.warn("Failed to fetch employee details in leave-create:", err.message));
    }
  }, [user?.id]);

  React.useEffect(() => {
    if (startDateStr && endDateStr) {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const calculatedEl = Math.min(accruedEL, totalDays);
      const calculatedLop = Math.max(0, totalDays - calculatedEl);

      setElDays(calculatedEl);
      setLopDays(calculatedLop);
    } else {
      setElDays(0);
      setLopDays(0);
    }
  }, [startDateStr, endDateStr, accruedEL]);


  const getRequestedDays = () => {
    if (!startDateStr || !endDateStr) return 0;
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

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

    const totalDaysRequested = getRequestedDays();
    if (elDays + lopDays !== totalDaysRequested) {
      Alert.alert(
        t('common:error', { defaultValue: 'Invalid Allocation' }),
        t('leave:err_days_sum', { defaultValue: `The sum of Earned Leaves (${elDays}) and LOP (${lopDays}) must equal the number of days selected on the calendar (${totalDaysRequested} Days).` })
      );
      return;
    }

    if (elDays > accruedEL) {
      Alert.alert(
        t('leave:el_limit_title', { defaultValue: 'EL Limit Exceeded' }),
        t('leave:el_limit_msg', { defaultValue: `You cannot apply for more Earned Leaves than your available balance (${accruedEL} Days).` })
      );
      return;
    }

    try {
      setSubmitting(true);
      const empCode = user?.empCode || user?.employeeCode || user?.id;
      const payload = {
        userId: empCode,
        empCode: empCode,
        employeeId: user?.id,
        userName: user?.name || 'Employee',
        startDate: startDateStr,
        endDate: endDateStr,
        type: leaveType,
        reason: reason.trim(),
        elDays: elDays,
        lopDays: lopDays,
        totalDays: elDays + lopDays
      };

      await api.post('/leaves', payload);
      Alert.alert(t('common:success', { defaultValue: 'Success' }), t('leave:submit_success', { defaultValue: 'Leave request submitted successfully.' }), [
        { text: t('common:ok', { defaultValue: 'OK' }), onPress: () => router.back() }
      ]);
    } catch (err: any) {
      console.error("Failed to submit leave:", err.message);
      Alert.alert(t('common:error', { defaultValue: 'Submission Error' }), t('leave:submit_failed', { defaultValue: 'Failed to submit leave request.' }));
    } finally {
      setSubmitting(false);
    }
  };

    const pickerBg = isDark ? '#1E293B' : '#FFFFFF';
    const pickerBorder = isDark ? '#334155' : '#CBD5E1';
    const pickerTextColor = isDark ? '#F8FAFC' : '#0F172A';

    return (
      <ScrollView 
        style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 24, paddingHorizontal: 20, justifyContent: 'center' }}
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
            
            {/* EL Balance display */}
            <View className={`border p-4 rounded-2xl mb-5 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-primary/5 border-primary/20'}`}>
              <View className="flex-row items-center gap-2 mb-1">
                <Text className={`font-black text-xs uppercase tracking-wider ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('leave:avail_el', { defaultValue: 'Available Earned Leaves (EL)' })}</Text>
                <View className={`px-2 py-0.5 rounded-full ${isDark ? 'bg-blue-950 border border-blue-800' : 'bg-primary/15'}`}>
                  <Text className={`font-bold text-[10px] ${isDark ? 'text-sky-300' : 'text-primary'}`}>+1/mo</Text>
                </View>
              </View>
              <Text className={`text-3xl font-black ${isDark ? 'text-white' : 'text-text-main'}`}>{accruedEL} {t('leave:days_suffix', { defaultValue: 'Days' })}</Text>
            </View>
            
            {/* Leave Type Dropdown */}
            <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>{t('leave:leave_type', { defaultValue: 'Leave Type' })} *</Text>
            <View 
              style={{
                borderWidth: 1,
                borderColor: pickerBorder,
                borderRadius: 12,
                backgroundColor: pickerBg,
                overflow: 'hidden',
                marginBottom: 20,
                justifyContent: 'center',
              }}
            >
              <Picker
                selectedValue={leaveType}
                onValueChange={(itemValue) => setLeaveType(itemValue)}
                dropdownIconColor={pickerTextColor}
                style={{
                  height: 52,
                  width: '100%',
                  color: pickerTextColor,
                  backgroundColor: pickerBg,
                }}
              >
                <Picker.Item label={`🤒 ${t('leave:sick_leave', { defaultValue: 'Sick Leave' })}`} value="Sick Leave" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                <Picker.Item label={`🏡 ${t('leave:casual_leave', { defaultValue: 'Casual Leave' })}`} value="Casual Leave" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                <Picker.Item label={`🏖️ ${t('leave:paid_leave', { defaultValue: 'Paid Annual Leave' })}`} value="Paid Leave" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                <Picker.Item label={`👶 ${t('leave:parental_leave', { defaultValue: 'Maternity/Paternity Leave' })}`} value="Parental Leave" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                <Picker.Item label={`⏳ ${t('leave:unpaid_leave', { defaultValue: 'Unpaid Leave' })}`} value="Unpaid Leave" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                <Picker.Item label={`📝 ${t('common:other', { defaultValue: 'Other' })}`} value="Other" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
              </Picker>
            </View>

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
                <Text className={`text-xs font-black ${isDark ? 'text-sky-300' : 'text-primary'}`}>{getRequestedDays()} {t('leave:days_suffix', { defaultValue: 'Days' })}</Text>
              </View>

              <View>
                <Text className={`text-[10px] font-bold uppercase text-right ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('leave:end_date', { defaultValue: 'End' })}</Text>
                <Text className={`text-sm font-bold text-right ${isDark ? 'text-white' : 'text-text-main'}`}>{endDateStr || '--/--/----'}</Text>
              </View>
            </View>

            {/* Auto-filled Leave Breakdown */}
            {startDateStr && endDateStr && (
              <>
                <View className={`border rounded-xl p-4 mb-4 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-primary/5 border-primary/20'}`}>
                  <Text className={`text-xs font-bold uppercase mb-3 ${isDark ? 'text-sky-400' : 'text-primary'}`}>
                    {t('leave:breakdown', { defaultValue: 'Leave Breakdown (auto-calculated)' })}
                  </Text>

                  {/* Total days bar */}
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:total_days', { defaultValue: 'Total Calendar Days' })}</Text>
                    <View className={`px-3 py-1 rounded-full ${isDark ? 'bg-blue-600' : 'bg-primary'}`}>
                      <Text className="text-white text-sm font-black">{getRequestedDays()} {t('leave:days_suffix', { defaultValue: 'Days' })}</Text>
                    </View>
                  </View>

                  <View className={`h-px mb-3 ${isDark ? 'bg-slate-700' : 'bg-border'}`} />

                  {/* EL row */}
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2">
                      <View className="w-3 h-3 rounded-full bg-emerald-500" />
                      <Text className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('leave:earned_leave', { defaultValue: 'Earned Leave (EL)' })}</Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:of_available', { defaultValue: `of ${accruedEL} available` })}</Text>
                      <View className={`px-3 py-1 rounded-full border ${isDark ? 'bg-emerald-950/80 border-emerald-800' : 'bg-emerald-100 border-emerald-300'}`}>
                        <Text className={`text-sm font-black ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{elDays} {t('leave:days_suffix', { defaultValue: 'Days' })}</Text>
                      </View>
                    </View>
                  </View>

                  {/* LOP row */}
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View className="w-3 h-3 rounded-full bg-amber-500" />
                      <Text className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('leave:loss_of_pay', { defaultValue: 'Loss of Pay (LOP)' })}</Text>
                    </View>
                    <View className={`px-3 py-1 rounded-full border ${lopDays > 0 ? (isDark ? 'bg-amber-950/80 border-amber-800' : 'bg-amber-100 border-amber-300') : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border')}`}>
                      <Text className={`text-sm font-black ${lopDays > 0 ? (isDark ? 'text-amber-400' : 'text-amber-700') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
                        {lopDays} {t('leave:days_suffix', { defaultValue: 'Days' })}
                      </Text>
                    </View>
                  </View>

                  {/* Hint when lop > 0 */}
                  {lopDays > 0 && (
                    <View className={`mt-3 p-2 rounded-lg border ${isDark ? 'bg-amber-950/40 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
                      <Text className={`text-xs font-medium ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        ⚠️ {t('leave:lop_hint', { defaultValue: `Your EL balance (${accruedEL}) is less than the selected ${getRequestedDays()} days. ${lopDays} day(s) will be Loss of Pay.` })}
                      </Text>
                    </View>
                  )}

                  {/* Fully covered by EL hint */}
                  {lopDays === 0 && elDays > 0 && (
                    <View className={`mt-3 p-2 rounded-lg border ${isDark ? 'bg-emerald-950/40 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                      <Text className={`text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        ✅ {t('leave:el_covered_hint', { defaultValue: 'Fully covered by your Earned Leave balance.' })}
                      </Text>
                    </View>
                  )}
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
              disabled={submitting || !startDateStr || !endDateStr || !reason}
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
