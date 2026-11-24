import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import AttachmentPreview from '@/components/AttachmentPreview';
import {
  RegularizationApiError,
  RegularizationRequest,
  RegularizationStatus,
  cancelRegularization,
  listRegularizations,
  toRegularizationError,
} from '@/services/regularizationService';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';
import { onRegularizationChanged } from '@/utils/regularizationEvents';
import { regFailureMessage } from '@/utils/regularizationMessages';

const BADGE: Record<RegularizationStatus, { bg: string; fg: string }> = {
  PENDING: { bg: '#FEF3C7', fg: '#B45309' },
  APPROVED: { bg: '#DCFCE7', fg: '#15803D' },
  REJECTED: { bg: '#FEE2E2', fg: '#B91C1C' },
  CANCELLED: { bg: '#E2E8F0', fg: '#475569' },
};

export default function RegularizationRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  const { open } = useLocalSearchParams<{ open?: string }>();
  const locale = getDateLocale();

  const [requests, setRequests] = useState<RegularizationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(open ? String(open) : null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async (mode: 'first' | 'pull' | 'quiet' = 'quiet') => {
    const seq = ++loadSeq.current;
    if (mode === 'first') setLoading(true);
    if (mode === 'pull') setRefreshing(true);
    try {
      const result = await listRegularizations();
      if (seq !== loadSeq.current) return;
      setRequests(result.requests);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      // Keep what is on screen when only a background reload fails.
      if (mode !== 'quiet') setError(regFailureMessage(t, toRegularizationError(err)));
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  // Opens, comes back to the foreground, or a decision push arrives: reload from the server.
  useEffect(() => {
    load('first');
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load('quiet'); });
    const unsubscribe = onRegularizationChanged(() => load('quiet'));
    return () => { sub.remove(); unsubscribe(); };
    // Reload on open only; `load` changes with the language, which must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heading = isDark ? 'text-white' : 'text-text-main';
  const muted = isDark ? 'text-slate-400' : 'text-text-muted';
  const body = isDark ? 'text-slate-300' : 'text-text-secondary';

  const statusLabel: Record<RegularizationStatus, string> = {
    PENDING: t('attendance:reg_status_pending', { defaultValue: 'Pending' }),
    APPROVED: t('attendance:reg_status_approved', { defaultValue: 'Approved' }),
    REJECTED: t('attendance:reg_status_rejected', { defaultValue: 'Rejected' }),
    CANCELLED: t('attendance:reg_status_withdrawn', { defaultValue: 'Withdrawn' }),
  };

  const withdraw = (request: RegularizationRequest) => {
    Alert.alert(
      t('attendance:reg_withdraw_title', { defaultValue: 'Withdraw this request?' }),
      t('attendance:reg_withdraw_msg', { defaultValue: 'Your request for {{date}} will be cancelled. You can send a new one later.', date: formatDay(request.date) }),
      [
        { text: t('attendance:act_keep', { defaultValue: 'Keep it' }), style: 'cancel' },
        {
          text: t('attendance:reg_withdraw', { defaultValue: 'Withdraw' }),
          style: 'destructive',
          onPress: async () => {
            setWithdrawing(request.id);
            try {
              const updated = await cancelRegularization(request.id);
              setRequests((list) => list.map((r) => (r.id === updated.id ? updated : r)));
            } catch (err) {
              const e: RegularizationApiError = toRegularizationError(err);
              // The admin may have decided it already: show the server's message and reload the real state.
              if (e.code === 'NOT_PENDING') load('quiet');
              Alert.alert(t('common:error', { defaultValue: 'Error' }), regFailureMessage(t, e));
            } finally {
              setWithdrawing(null);
            }
          },
        },
      ],
    );
  };

  const formatDay = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const formatSent = (ms: number | null) =>
    ms ? new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const renderItem = ({ item }: { item: RegularizationRequest }) => {
    const expanded = expandedId === item.id;
    const colors = BADGE[item.status];
    return (
      <Card className={`mb-3 ${isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-surface border-border'}`}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setExpandedId(expanded ? null : item.id)} className="p-4">
          <View className="flex-row justify-between items-start">
            <View className="flex-1 mr-3">
              <Text className={`text-base font-extrabold ${heading}`}>{formatDay(item.date)}</Text>
              <Text className={`text-xs mt-0.5 ${muted}`}>
                {t('attendance:reg_sent_at', { defaultValue: 'Sent {{time}}', time: formatSent(item.createdAt) })}
              </Text>
            </View>
            <View style={{ backgroundColor: colors.bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
              <Text style={{ color: colors.fg, fontSize: 11, fontWeight: '800' }}>{statusLabel[item.status]}</Text>
            </View>
          </View>

          {expanded && (
            <View className={`mt-3 pt-3 border-t ${isDark ? 'border-slate-700' : 'border-border'}`}>
              <Text className={`text-xs font-bold mb-1 ${muted}`}>{t('attendance:reg_comment', { defaultValue: 'Comment' })}</Text>
              <Text className={`text-sm ${body}`}>{item.comment}</Text>

              {(item.requestedCheckIn || item.requestedCheckOut) && (
                <Text className={`text-xs mt-3 ${muted}`}>
                  {t('attendance:reg_requested_times', { defaultValue: 'Worked' })}: {item.requestedCheckIn || '--'} – {item.requestedCheckOut || '--'}
                </Text>
              )}

              {item.documents.length > 0 && (
                <View className="mt-3">
                  <Text className={`text-xs font-bold mb-2 ${muted}`}>{t('attendance:reg_documents_short', { defaultValue: 'Documents' })}</Text>
                  {item.documents.map((d, i) => (
                    <View key={`${d.url}-${i}`} className="mb-3">
                      <AttachmentPreview source={d.url} isDark={isDark} variant="full" />
                      {!!d.name && <Text className={`text-xs mt-1 ${muted}`} numberOfLines={1}>{d.name}</Text>}
                    </View>
                  ))}
                </View>
              )}

              {item.status === 'REJECTED' && (
                <View className={`mt-3 p-3 rounded-xl border ${isDark ? 'bg-rose-950/60 border-rose-800' : 'bg-rose-50 border-rose-100'}`}>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                    {t('attendance:reg_rejected_reason', { defaultValue: 'Reason from your admin' })}
                  </Text>
                  <Text className={`text-sm ${isDark ? 'text-rose-200' : 'text-rose-700'}`}>
                    {item.decisionNote || t('attendance:reg_no_reason', { defaultValue: 'No reason was given.' })}
                  </Text>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/regularize', params: { date: item.date } } as any)} className="mt-3">
                    <Text className={`text-sm font-extrabold ${isDark ? 'text-sky-400' : 'text-primary'}`}>
                      {t('attendance:reg_send_again', { defaultValue: 'Send a new request for this day' })} ›
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {item.status === 'PENDING' && (
                <TouchableOpacity
                  onPress={() => withdraw(item)}
                  disabled={withdrawing !== null}
                  activeOpacity={0.8}
                  className="mt-4 py-2.5 rounded-xl border items-center"
                  style={{ borderColor: '#DC2626', opacity: withdrawing !== null ? 0.5 : 1 }}
                >
                  {withdrawing === item.id
                    ? <ActivityIndicator size="small" color="#DC2626" />
                    : <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 13 }}>{t('attendance:reg_withdraw', { defaultValue: 'Withdraw' })}</Text>}
                </TouchableOpacity>
              )}
            </View>
          )}
        </TouchableOpacity>
      </Card>
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: isDark ? '#0F172A' : '#FAFAFA', paddingTop: Math.max(insets.top + 8, 20) }}>
      <View className="flex-row items-center px-4 mb-3">
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" className="p-2">
          <Ionicons name="chevron-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
        </TouchableOpacity>
        <Text className={`flex-1 text-xl font-black ${heading}`}>{t('attendance:reg_my_requests', { defaultValue: 'My requests' })}</Text>
        <TouchableOpacity onPress={() => router.push('/regularize' as any)} className="px-3 py-1.5">
          <Text className={`text-sm font-bold ${isDark ? 'text-sky-400' : 'text-primary'}`}>+ {t('attendance:reg_new', { defaultValue: 'New' })}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator className="mt-10" size="large" color={isDark ? '#38BDF8' : '#0F172A'} />
      ) : error ? (
        <View className="items-center px-8 mt-10">
          <Text className="text-center text-red-500 mb-4">{error}</Text>
          <TouchableOpacity onPress={() => load('first')} className={`px-5 py-2 rounded-full border ${isDark ? 'border-sky-400' : 'border-primary'}`}>
            <Text className={`font-bold ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('common:retry', { defaultValue: 'Retry' })}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          extraData={[expandedId, withdrawing, statusLabel.PENDING]}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 20, 24) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}
          ListEmptyComponent={
            <Text className={`text-center mt-12 ${muted}`}>{t('attendance:reg_empty', { defaultValue: 'You have not sent any requests yet.' })}</Text>
          }
        />
      )}
    </View>
  );
}
