import Header from '@/components/Header';
import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  fetchMyLeaves,
  fetchLeaveActivity,
  describeLoadError,
  LeaveActivity,
  LeaveTransaction
} from '@/services/leaveService';
import { getLeaveSummary, formatLeaveDays, countInclusiveDays, toNumberOrNull } from '@/utils/leaveBalance';
import { useAuth } from '@/context/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import LeaveActivityCard from '@/components/LeaveActivityCard';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';

export default function LeavesScreen() {
  const { user, refreshUserProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t, currentLanguage } = useTranslationSafe(['leave', 'common', 'nav']);

  const [leaves, setLeaves] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<LeaveTransaction[]>([]);
  const [registerSummary, setRegisterSummary] = useState<LeaveActivity['summary']>(null);
  const [loading, setLoading] = useState(true);
  // `error` replaces the lists (nothing could be loaded); `partialError` is a banner over lists that did load.
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);

  // Tab 1: Activity (default selected), Tab 2: Pending, Tab 3: History
  const [activeTab, setActiveTab] = useState<'activity' | 'pending' | 'history'>('activity');

  const userRef = React.useRef(user);
  userRef.current = user;

  // The requests come from GET /leaves?userId=<this employee>, transactions from GET /leaves/transactions?userId=<this employee>,
  // and the balance from GET /employees/:id (via refreshUserProfile).
  const loadLeaves = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setPartialError(null);
      const currentUser = userRef.current;
      const [listResult, transResult] = await Promise.allSettled([
        fetchMyLeaves(currentUser),
        fetchLeaveActivity(currentUser),
        refreshUserProfile?.().catch(() => null)
      ]);

      // Whatever loaded is shown. A failed source is reported with its real reason, never shown as "no records".
      setLeaves(listResult.status === 'fulfilled' ? listResult.value || [] : []);
      setTransactions(transResult.status === 'fulfilled' ? transResult.value.transactions : []);
      setRegisterSummary(transResult.status === 'fulfilled' ? transResult.value.summary : null);

      const failures: string[] = [];
      if (listResult.status === 'rejected') {
        console.warn('[Leaves] requests failed:', listResult.reason?.message);
        failures.push(`${t('leave:err_requests', { defaultValue: 'Leave requests' })}: ${describeLoadError(listResult.reason)}`);
      }
      if (transResult.status === 'rejected') {
        console.warn('[Leaves] activity failed:', transResult.reason?.message);
        failures.push(`${t('leave:err_activity', { defaultValue: 'Leave activity' })}: ${describeLoadError(transResult.reason)}`);
      }
      if (failures.length === 2) {
        setError(`${t('leave:err_load_records', { defaultValue: "Failed to load leave records." })}\n${failures.join('\n')}`);
      } else if (failures.length === 1) {
        setPartialError(failures[0]);
      }
    } catch (err: any) {
      console.error("Fetch leaves error:", err?.message);
      setError(t('leave:err_load_records', { defaultValue: "Failed to load leave records." }));
    } finally {
      setLoading(false);
    }
  }, [refreshUserProfile, t]);

  const loadLeavesRef = React.useRef(loadLeaves);
  loadLeavesRef.current = loadLeaves;

  // The activity rows carry text built from the server data, so rebuild them when the app language changes.
  const shownLanguageRef = React.useRef(currentLanguage);
  React.useEffect(() => {
    if (shownLanguageRef.current === currentLanguage) return;
    shownLanguageRef.current = currentLanguage;
    loadLeavesRef.current();
  }, [currentLanguage]);

  // Activity tab must be selected automatically whenever the user opens the Leave Management screen.
  useFocusEffect(
    useCallback(() => {
      setActiveTab('activity');
      loadLeavesRef.current();
    }, [])
  );

  const normalizedStatus = (item: any) => String(item?.status || '').toLowerCase();
  const pendingList = useMemo(() => leaves.filter(item => normalizedStatus(item) === 'pending'), [leaves]);
  
  // History tab: show individual daily consumed transactions + rejected leave requests
  // Approved leaves are shown as individual daily records (from syncLeavesToDailyTransactions).
  // Rejected leaves are shown as their leave-request cards (so the user can see what was rejected).
  const historyList = useMemo(() => {
    // Individual consumed transactions — these cover all approved leave days (EL + LOP) individually
    const consumedTrans = transactions.filter(t => t.transactionType === 'consumed');

    // Rejected leave requests shown as request cards (not individual days)
    const rejectedRequests = leaves.filter(item => normalizedStatus(item) === 'rejected');

    // An approved special leave (marriage, paternity, ...) never touches EL, so it has no daily ledger rows to
    // stand in for it: it is shown as its request card instead.
    const approvedSpecial = leaves.filter(item => item.category && normalizedStatus(item) === 'approved');

    // Combine: consumed daily records + rejected request cards + approved special leave
    return [...consumedTrans, ...rejectedRequests, ...approvedSpecial].sort((a, b) => {
      const dateA = new Date(a.transactionDate || a.endDate || a.startDate || a.appliedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.transactionDate || b.endDate || b.startDate || b.appliedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [leaves, transactions]);

  // Sort activity transactions chronologically: newest first, using timestamps for secondary ordering
  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const dateA = new Date(a.transactionDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.transactionDate || b.createdAt || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [transactions]);

  // The balance card shows the register's own figures when the server has one, so it always matches the list;
  // otherwise (and for any figure the register lacks) it falls back to the employee profile.
  const profileSummary = getLeaveSummary(user);
  const summary = {
    totalEarned: registerSummary?.totalEarned ?? profileSummary.totalEarned,
    consumed: registerSummary?.consumed ?? profileSummary.consumed,
    available: registerSummary?.available ?? profileSummary.available,
  };

  // Render for Pending and History tabs (Leave Request Cards & Consumed Transactions)
  const renderRequestItem = ({ item }: { item: any }) => {
    if (item.transactionType === 'consumed') {
      return <LeaveActivityCard item={item} />;
    }

    const status = normalizedStatus(item);
    const days = toNumberOrNull(item.totalDays) ?? countInclusiveDays(item.startDate, item.endDate);
    const elDays = toNumberOrNull(item.elDays);
    const lopDays = toNumberOrNull(item.lopDays);
    const appliedAt = item.appliedAt ? new Date(Number(item.appliedAt) || item.appliedAt) : null;

    let statusStyle = isDark
      ? "bg-amber-950/60 border-amber-800 text-amber-400"
      : "bg-amber-50 border-amber-200 text-amber-600";
    if (status === 'approved') {
      statusStyle = isDark
        ? "bg-emerald-950/60 border-emerald-800 text-emerald-400"
        : "bg-emerald-50 border-emerald-200 text-emerald-600";
    }
    if (status === 'rejected') {
      statusStyle = isDark
        ? "bg-rose-950/60 border-rose-800 text-rose-400"
        : "bg-red-50 border-red-200 text-red-600";
    }

    return (
      <Card className={`mb-4 border ${isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-surface border-border'}`}>
        <CardContent>
          <View className="flex-row justify-between items-start mb-3">
            <View>
              <Text className={`text-base font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>
                {item.type || t('leave:request_title', { defaultValue: 'Leave Request' })}
              </Text>
              {item.category ? (
                <Text className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                  {t('leave:special_leave_tag', { defaultValue: 'Special leave · EL and LOP do not apply' })}
                </Text>
              ) : null}
            </View>
            <View className={`px-3 py-1 rounded-full border ${statusStyle.split(' ')[0]} ${statusStyle.split(' ')[1]}`}>
              <Text className={`text-[10px] font-bold uppercase ${statusStyle.split(' ')[2]}`}>
                {t(`leave:status_${status}`, { defaultValue: status || 'pending' })}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center mb-2">
            <Text className={`text-sm font-bold w-[60px] ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:dates_label', { defaultValue: 'Dates:' })}</Text>
            <Text className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>
              {item.startDate} {t('common:to', { defaultValue: 'to' })} {item.endDate} ({days} {days === 1 ? t('leave:day_single', { defaultValue: 'day' }) : t('leave:days_suffix', { defaultValue: 'days' })})
            </Text>
          </View>

          {!item.category && (elDays !== null || lopDays !== null) && (
            <View className="flex-row items-center mb-3 gap-2">
              <View className={`px-2.5 py-1 rounded-full border ${isDark ? 'bg-emerald-950/60 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                <Text className={`text-[11px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  {t('leave:el_short', { defaultValue: 'EL' })} {formatLeaveDays(elDays ?? 0)}
                </Text>
              </View>
              <View className={`px-2.5 py-1 rounded-full border ${(lopDays ?? 0) > 0 ? (isDark ? 'bg-amber-950/60 border-amber-800' : 'bg-amber-50 border-amber-200') : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border')}`}>
                <Text className={`text-[11px] font-bold ${(lopDays ?? 0) > 0 ? (isDark ? 'text-amber-400' : 'text-amber-700') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
                  {t('leave:lop_short', { defaultValue: 'LOP' })} {formatLeaveDays(lopDays ?? 0)}
                </Text>
              </View>
            </View>
          )}

          <View className="mb-3">
            <Text className={`text-sm font-bold mb-1.5 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:reason_label', { defaultValue: 'Reason:' })}</Text>
            <Text className={`text-sm p-3 rounded-lg border leading-5 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-surface border-border text-text-secondary'}`}>
              {item.reason}
            </Text>
          </View>

          {appliedAt && !isNaN(appliedAt.getTime()) && (
            <Text className={`text-[10px] font-medium self-end ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>
              {t('leave:applied_label', { defaultValue: 'Applied:' })} {appliedAt.toLocaleString(getDateLocale())}
            </Text>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderActivityItem = ({ item }: { item: LeaveTransaction }) => {
    return <LeaveActivityCard item={item} />;
  };

  const displayData = activeTab === 'activity' 
    ? sortedTransactions 
    : activeTab === 'pending' 
      ? pendingList 
      : historyList;

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-background'}`}>
      <Header />
      <View className={`flex-row justify-between items-center px-5 py-4 border-b ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>{t('leave:title', { defaultValue: 'Leaves Management' })}</Text>
        <TouchableOpacity
          className={`w-[42px] h-[42px] rounded-full justify-center items-center shadow-md ${isDark ? 'bg-blue-600 shadow-black/40' : 'bg-primary shadow-black/20'}`}
          onPress={() => router.push('/leave-create' as any)}
          activeOpacity={0.8}
        >
          <IconSymbol name="plus" color="#ffffff" size={22} />
        </TouchableOpacity>
      </View>

      {/* Employee Balance Card */}
      <View className={`mx-5 mt-4 p-4 rounded-[14px] border items-center shadow-sm ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border shadow-black/5'}`}>
        <Text className={`text-sm font-bold mb-3 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:my_balance_title', { defaultValue: 'My Leaves Balance' })}</Text>
        <View className="flex-row items-center justify-around w-full">
          <View className="flex-1 items-center">
            <Text className={`text-2xl font-black ${isDark ? 'text-white' : 'text-text-main'}`}>{formatLeaveDays(summary.totalEarned)}</Text>
            <Text className={`text-[11px] font-semibold mt-0.5 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:earned_short', { defaultValue: 'Earned' })}</Text>
          </View>
          <View className={`w-px h-8 ${isDark ? 'bg-slate-700' : 'bg-border'}`} />
          <View className="flex-1 items-center">
            <Text className={`text-2xl font-black ${isDark ? 'text-white' : 'text-text-main'}`}>{formatLeaveDays(summary.consumed)}</Text>
            <Text className={`text-[11px] font-semibold mt-0.5 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:consumed_short', { defaultValue: 'Consumed' })}</Text>
          </View>
          <View className={`w-px h-8 ${isDark ? 'bg-slate-700' : 'bg-border'}`} />
          <View className="flex-1 items-center">
            <Text className={`text-2xl font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              {formatLeaveDays(summary.available)}
            </Text>
            <Text className={`text-[11px] font-semibold mt-0.5 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:remaining_short', { defaultValue: 'Remaining' })}</Text>
          </View>
        </View>
      </View>

      {/* Segmented Control: 1. Activity (Default), 2. Pending, 3. History */}
      <View className={`flex-row p-1.5 mx-5 my-4 rounded-xl border ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <TouchableOpacity 
          className={`flex-1 py-2 items-center justify-center rounded-lg ${activeTab === 'activity' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('activity')}
          activeOpacity={0.7}
        >
          <Text 
            numberOfLines={1}
            className={`text-xs font-bold ${activeTab === 'activity' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}
          >
            {t('leave:activity_tab', { defaultValue: 'Activity' })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className={`flex-1 py-2 items-center justify-center rounded-lg ${activeTab === 'pending' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('pending')}
          activeOpacity={0.7}
        >
          <Text 
            numberOfLines={1}
            className={`text-xs font-bold ${activeTab === 'pending' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}
          >
            {t('leave:pending_tab', { defaultValue: 'Pending' })} ({pendingList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className={`flex-1 py-2 items-center justify-center rounded-lg ${activeTab === 'history' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.7}
        >
          <Text 
            numberOfLines={1}
            className={`text-xs font-bold ${activeTab === 'history' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}
          >
            {t('leave:history_tab', { defaultValue: 'History' })} ({historyList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={isDark ? '#38BDF8' : '#0052CC'} className="flex-1 justify-center items-center" />
      ) : error ? (
        <View className="flex-1 justify-center items-center px-10">
          <Text className="text-base text-red-500 text-center mb-4">{error}</Text>
          <Button onPress={loadLeaves} className="px-6">
            <Text className="text-white font-bold">{t('common:retry', { defaultValue: 'Retry' })}</Text>
          </Button>
        </View>
      ) : (
        <>
        {partialError ? (
          <View className={`mx-5 mb-1 p-3 rounded-xl border ${isDark ? 'bg-amber-950/60 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
            <Text className={`text-xs font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{partialError}</Text>
            <TouchableOpacity onPress={loadLeaves} activeOpacity={0.7} className="self-start mt-1.5">
              <Text className={`text-xs font-black ${isDark ? 'text-blue-400' : 'text-primary'}`}>{t('common:retry', { defaultValue: 'Retry' })}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <FlatList
          data={displayData}
          keyExtractor={(item) => item.id || String(item.idempotencyKey || '') || `${item.transactionDate || item.startDate}_${item.amount || item.totalDays}`}
          renderItem={activeTab === 'activity' ? (renderActivityItem as any) : renderRequestItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56 + insets.bottom + 80 }}
          onRefresh={loadLeaves}
          refreshing={loading}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center py-16 px-6">
              <View className={`w-16 h-16 rounded-full items-center justify-center mb-4 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <Ionicons 
                  name={activeTab === 'activity' ? 'time-outline' : 'document-text-outline'} 
                  size={32} 
                  color={isDark ? '#64748B' : '#94A3B8'} 
                />
              </View>
              <Text className={`text-base font-extrabold mb-1.5 text-center ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {activeTab === 'activity'
                  ? t('leave:no_activity_title', { defaultValue: 'No leave activity yet' })
                  : activeTab === 'pending'
                    ? t('leave:no_pending_title', { defaultValue: 'No pending requests' })
                    : t('leave:no_history_title', { defaultValue: 'No leave history' })
                }
              </Text>
              <Text className={`text-xs text-center leading-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {activeTab === 'activity'
                  ? t('leave:no_activity_desc', { defaultValue: 'Your earned and consumed leaves will appear here in chronological order.' })
                  : activeTab === 'pending'
                    ? t('leave:no_pending_desc', { defaultValue: 'You have no pending leave requests.' })
                    : t('leave:no_history_desc', { defaultValue: 'You have no approved or rejected leave requests yet.' })
                }
              </Text>
            </View>
          }
        />
        </>
      )}

    </View>
  );
}
