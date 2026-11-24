import React, { useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AttachedFile, RegularizationApiError, createRegularization } from '@/services/regularizationService';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';
import { istDateString } from '@/utils/activityTime';
import {
  COMMENT_MAX,
  MAX_DOCUMENTS,
  RegRuleError,
  allowedDateRange,
  validateComment,
  validateDocument,
  validateDocumentCount,
  validateRegularizeDate,
  validateWorkedTimes,
} from '@/utils/regularizationRules';
import { RegField, regFailureMessage, regFieldForError, regRuleMessage } from '@/utils/regularizationMessages';
import { emitRegularizationChanged } from '@/utils/regularizationEvents';

const pad = (n: number) => String(n).padStart(2, '0');
const toHHmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const localDateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A Date at noon on a 'YYYY-MM-DD' calendar day (noon avoids time-zone edge cases). */
const dayAtNoon = (iso: string) => new Date(`${iso}T12:00:00`);

type PickerTarget = 'date' | 'from' | 'until' | null;

export default function RegularizeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  const params = useLocalSearchParams<{ date?: string }>();
  const locale = getDateLocale();

  const todayIst = istDateString(Date.now());
  const range = allowedDateRange(todayIst);

  // A date passed in from the history is used only when it is a day that can be regularized.
  const [date, setDate] = useState<string | null>(
    params.date && !validateRegularizeDate(params.date, todayIst) ? params.date : null,
  );
  const [comment, setComment] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [docs, setDocs] = useState<AttachedFile[]>([]);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [errors, setErrors] = useState<Partial<Record<RegField, string>>>({});
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const setError = (field: RegField, message: string | null) =>
    setErrors((prev) => ({ ...prev, [field]: message ?? undefined }));

  const dateProblem = validateRegularizeDate(date, todayIst);
  const commentProblem = validateComment(comment);
  const timeProblems = validateWorkedTimes(from, until);
  const canSend = !dateProblem && !commentProblem && !timeProblems.from && !timeProblems.until && !sending;

  const heading = isDark ? 'text-white' : 'text-text-main';
  const muted = isDark ? 'text-slate-400' : 'text-text-muted';
  const label = `text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`;
  const fieldBox = `flex-row items-center justify-between px-4 py-3 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'}`;

  const showTime = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  };

  // ── Attachments ─────────────────────────────────────────────────────────────────────

  /** Adds picked files one by one, keeping the valid ones and saying why the others were refused. */
  const addFiles = (picked: AttachedFile[]) => {
    setError('documents', null);
    let current = docs;
    let refusal: RegRuleError | null = null;
    for (const file of picked) {
      const problem = validateDocument(file) ?? validateDocumentCount(current.length, 1);
      if (problem) {
        refusal = problem;
        continue;
      }
      current = [...current, file];
    }
    setDocs(current);
    if (refusal) setError('documents', regRuleMessage(t, refusal));
  };

  const fromImageAssets = (assets: ImagePicker.ImagePickerAsset[]): AttachedFile[] =>
    assets.map((a) => ({
      uri: a.uri,
      name: a.fileName || `photo_${Date.now()}.jpg`,
      mimeType: a.mimeType || 'image/jpeg',
      size: a.fileSize,
    }));

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          t('attendance:reg_camera_needed', { defaultValue: 'Camera permission needed' }),
          t('attendance:reg_camera_needed_msg', { defaultValue: 'Allow camera access in your phone settings to photograph a document.' }),
          [
            { text: t('common:open_settings', { defaultValue: 'Open Settings' }), onPress: () => Linking.openSettings() },
            { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          ],
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled) addFiles(fromImageAssets(result.assets));
    } catch {
      setError('documents', t('attendance:reg_pick_failed', { defaultValue: 'Could not add the file. Try again.' }));
    }
  };

  const chooseFromGallery = async () => {
    try {
      const remaining = MAX_DOCUMENTS - docs.length;
      if (remaining <= 0) {
        setError('documents', regRuleMessage(t, 'DOC_TOO_MANY'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.7,
      });
      if (!result.canceled) addFiles(fromImageAssets(result.assets));
    } catch {
      setError('documents', t('attendance:reg_pick_failed', { defaultValue: 'Could not add the file. Try again.' }));
    }
  };

  const chooseFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        addFiles(result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/pdf', size: a.size })));
      }
    } catch {
      setError('documents', t('attendance:reg_pick_failed', { defaultValue: 'Could not add the file. Try again.' }));
    }
  };

  // ── Sending ─────────────────────────────────────────────────────────────────────────

  const handleServerError = (error: RegularizationApiError) => {
    if (error.code === 'ATTENDANCE_EXISTS') {
      Alert.alert(
        t('attendance:reg_has_attendance_title', { defaultValue: 'No request needed' }),
        error.message,
        [{ text: t('common:ok', { defaultValue: 'OK' }), onPress: () => router.back() }],
      );
      return;
    }
    if (error.code === 'ALREADY_REQUESTED') {
      Alert.alert(
        t('attendance:reg_already_title', { defaultValue: 'Already requested' }),
        error.message,
        [{
          text: t('attendance:reg_view_request', { defaultValue: 'View request' }),
          onPress: () => router.replace({ pathname: '/regularization-requests', params: error.request ? { open: error.request.id } : {} } as any),
        }],
      );
      return;
    }
    setError(regFieldForError(error), regFailureMessage(t, error));
  };

  const send = async () => {
    if (sendingRef.current) return; // blocks a double tap
    setErrors({});
    // Show every problem at once, next to its field.
    if (dateProblem) setError('date', regRuleMessage(t, dateProblem));
    if (commentProblem) setError('comment', regRuleMessage(t, commentProblem));
    if (timeProblems.from) setError('from', regRuleMessage(t, timeProblems.from));
    if (timeProblems.until) setError('until', regRuleMessage(t, timeProblems.until));
    if (dateProblem || commentProblem || timeProblems.from || timeProblems.until) return;

    sendingRef.current = true;
    setSending(true);
    try {
      await createRegularization({ date: date as string, comment, checkIn: from, checkOut: until, documents: docs });
      emitRegularizationChanged();
      router.replace('/regularization-requests' as any);
    } catch (err) {
      handleServerError(err as RegularizationApiError);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const attachButton = (icon: keyof typeof Ionicons.glyphMap, text: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={sending}
      activeOpacity={0.8}
      className={`flex-1 mx-1 py-3 rounded-xl border items-center ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'}`}
    >
      <Ionicons name={icon} size={20} color={isDark ? '#38BDF8' : '#2563EB'} />
      <Text className={`text-xs font-bold mt-1 ${heading}`}>{text}</Text>
    </TouchableOpacity>
  );

  const timeField = (target: 'from' | 'until', value: string, setValue: (v: string) => void, title: string) => (
    <View className="flex-1 mx-1">
      <Text className={label}>{title}</Text>
      <TouchableOpacity className={fieldBox} onPress={() => setPicker(target)} activeOpacity={0.8}>
        <Text className={`text-base ${value ? heading : muted}`}>{value ? showTime(value) : t('attendance:reg_optional', { defaultValue: 'Optional' })}</Text>
        {value ? (
          <TouchableOpacity onPress={() => { setValue(''); setError(target, null); }} accessibilityLabel={t('attendance:reg_clear_time', { defaultValue: 'Clear time' })} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={isDark ? '#64748B' : '#94A3B8'} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="time-outline" size={20} color={isDark ? '#64748B' : '#94A3B8'} />
        )}
      </TouchableOpacity>
      {!!errors[target] && <Text className="text-sm text-red-500 ml-1 mt-1">{errors[target]}</Text>}
    </View>
  );

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}
        contentContainerStyle={{ paddingTop: Math.max(insets.top + 12, 24), paddingBottom: Math.max(insets.bottom + 20, 24), paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity onPress={() => router.back()} className="flex-row items-center" accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
            <Text className={`text-base font-semibold ${heading}`}>{t('common:back', { defaultValue: 'Back' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/regularization-requests' as any)} accessibilityRole="button">
            <Text className={`text-sm font-bold ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('attendance:reg_my_requests', { defaultValue: 'My requests' })} ›</Text>
          </TouchableOpacity>
        </View>

        <Card className={isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-surface border-border'}>
          <CardContent>
            <Text className={`text-2xl font-black text-center mb-1 ${heading}`}>{t('attendance:reg_title', { defaultValue: 'Regularize attendance' })}</Text>
            <Text className={`text-xs text-center mb-6 ${muted}`}>
              {t('attendance:reg_subtitle', { defaultValue: 'Worked on a day you forgot to clock in? Ask to be marked present. Your admin will review it.' })}
            </Text>

            <View className="mb-5">
              <Text className={label}>{t('attendance:reg_day', { defaultValue: 'Day' })} *</Text>
              <TouchableOpacity className={fieldBox} onPress={() => setPicker('date')} activeOpacity={0.8}>
                <Text className={`text-base ${date ? heading : muted}`}>
                  {date
                    ? dayAtNoon(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
                    : t('attendance:reg_pick_day', { defaultValue: 'Choose a day' })}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={isDark ? '#64748B' : '#94A3B8'} />
              </TouchableOpacity>
              {!!errors.date && <Text className="text-sm text-red-500 ml-1 mt-1">{errors.date}</Text>}
            </View>

            <View className="mb-5">
              <Text className={label}>{t('attendance:reg_comment', { defaultValue: 'Comment' })} *</Text>
              <Input
                value={comment}
                onChangeText={(v) => { setComment(v); setError('comment', null); }}
                placeholder={t('attendance:reg_comment_placeholder', { defaultValue: 'What did you work on, and why could you not clock in?' })}
                maxLength={COMMENT_MAX}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                error={errors.comment}
                className="min-h-[110px] py-3"
              />
              <Text className={`text-xs text-right mt-1 ${comment.length >= COMMENT_MAX ? 'text-red-500' : muted}`}>{comment.length}/{COMMENT_MAX}</Text>
            </View>

            <View className="flex-row mb-5 -mx-1">
              {timeField('from', from, setFrom, t('attendance:reg_worked_from', { defaultValue: 'I worked from' }))}
              {timeField('until', until, setUntil, t('attendance:reg_worked_until', { defaultValue: 'Until' }))}
            </View>

            <View className="mb-6">
              <Text className={label}>
                {t('attendance:reg_documents', { defaultValue: 'Supporting documents' })} ({docs.length}/{MAX_DOCUMENTS})
              </Text>
              <View className="flex-row -mx-1 mb-3">
                {attachButton('camera-outline', t('attendance:reg_camera', { defaultValue: 'Camera' }), takePhoto)}
                {attachButton('images-outline', t('attendance:reg_gallery', { defaultValue: 'Gallery' }), chooseFromGallery)}
                {attachButton('document-outline', t('attendance:reg_files', { defaultValue: 'Files' }), chooseFiles)}
              </View>
              {docs.map((d, i) => (
                <View key={`${d.uri}-${i}`} className={`flex-row items-center p-2 mb-2 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'}`}>
                  {d.mimeType.startsWith('image/') ? (
                    <Image source={{ uri: d.uri }} style={{ width: 48, height: 48, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: isDark ? '#1E293B' : '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-text" size={24} color={isDark ? '#F87171' : '#DC2626'} />
                    </View>
                  )}
                  <View className="flex-1 mx-3">
                    <Text className={`text-sm font-semibold ${heading}`} numberOfLines={1}>{d.name}</Text>
                    {typeof d.size === 'number' && d.size > 0 && (
                      <Text className={`text-xs ${muted}`}>{(d.size / 1024 / 1024).toFixed(2)} MB</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => { setDocs(docs.filter((_, idx) => idx !== i)); setError('documents', null); }}
                    disabled={sending}
                    accessibilityLabel={t('attendance:reg_remove_file', { defaultValue: 'Remove file' })}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={24} color={isDark ? '#F87171' : '#DC2626'} />
                  </TouchableOpacity>
                </View>
              ))}
              {!!errors.documents && <Text className="text-sm text-red-500 ml-1 mt-1">{errors.documents}</Text>}
            </View>

            {!!errors.general && <Text className="text-sm text-red-500 mb-3 text-center">{errors.general}</Text>}

            <Button onPress={send} isLoading={sending} disabled={!canSend} className="mb-1" style={{ opacity: canSend ? 1 : 0.5 }}>
              <Text className="text-white font-bold text-base">{t('attendance:reg_send', { defaultValue: 'Send request' })}</Text>
            </Button>
          </CardContent>
        </Card>

        {picker === 'date' && (
          <DateTimePicker
            value={date ? dayAtNoon(date) : dayAtNoon(range.max)}
            mode="date"
            minimumDate={dayAtNoon(range.min)}
            maximumDate={dayAtNoon(range.max)}
            onChange={(event, picked) => {
              setPicker(null);
              if (event.type === 'set' && picked) { setDate(localDateString(picked)); setError('date', null); }
            }}
          />
        )}
        {(picker === 'from' || picker === 'until') && (
          <DateTimePicker
            value={(() => {
              const current = picker === 'from' ? from : until;
              const [h, m] = (current || (picker === 'from' ? '09:00' : '18:00')).split(':').map(Number);
              return new Date(2000, 0, 1, h, m);
            })()}
            mode="time"
            is24Hour={false}
            onChange={(event, picked) => {
              const target = picker;
              setPicker(null);
              if (event.type === 'set' && picked && target) {
                (target === 'from' ? setFrom : setUntil)(toHHmm(picked));
                setError(target, null);
              }
            }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
