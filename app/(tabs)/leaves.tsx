import Header from '@/components/Header';
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';
import { useAuth } from '@/context/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function LeavesScreen() {
  const { user, setUser } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['leave', 'common', 'nav']);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const cleanUrl = `${API_BASE_URL}/leaves`;
      const response = await api.get(cleanUrl);
      
      setLeaves(Array.isArray(response.data) ? response.data : []);

      if (user?.role !== 'ADMIN' && user?.id) {
        try {
          const profileRes = await api.get(`${API_BASE_URL}/employees/${user.id}`);
          if (profileRes.data) {
            setUser({ ...user, ...profileRes.data });
          }
        } catch (e) {
          console.warn("Failed to sync employee profile on leaves fetch:", e);
        }
      }
    } catch (err: any) {
      console.error("Fetch leaves error:", err.message);
      setError(t('leave:err_load_records', { defaultValue: "Failed to load leave records." }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, [activeTab, user?.id, user?.empCode]);

  const handleUpdateLeaveStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    try {
      const cleanUrl = `${API_BASE_URL}/leaves/${id}/status`;
      await api.patch(cleanUrl, { status: newStatus });
      Alert.alert(t('common:success', { defaultValue: "Success" }), t('leave:status_updated', { defaultValue: `Leave request has been ${newStatus}.` }));
      
      setLeaves(prev => 
        prev.map(item => item.id === id ? { ...item, status: newStatus } : item)
      );
    } catch (err: any) {
      console.error("Failed to update leave status:", err.message);
      Alert.alert(t('common:error', { defaultValue: "Error" }), t('leave:err_update_status', { defaultValue: "Could not update leave status." }));
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  const isUserLeave = (item: any) => {
    if (isAdmin) return true;
    const empCode = user?.empCode || user?.employeeCode;
    const uId = user?.id;
    const uName = user?.name?.toLowerCase();

    return (
      (empCode && item.userId === empCode) ||
      (uId && item.userId === uId) ||
      (empCode && item.empCode === empCode) ||
      (uId && item.empCode === uId) ||
      (uName && item.userName && item.userName.toLowerCase() === uName)
    );
  };

  const userLeaves = leaves.filter(isUserLeave);
  const pendingList = userLeaves.filter(item => item.status === 'pending');
  const historyList = userLeaves.filter(item => item.status !== 'pending');

  const displayData = activeTab === 'pending' ? pendingList : historyList;

  const calculateDays = (start: string, end: string) => {
    const sDate = new Date(start);
    const eDate = new Date(end);
    const diffTime = Math.abs(eDate.getTime() - sDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const renderItem = ({ item }: { item: any }) => {
    const days = calculateDays(item.startDate, item.endDate);
    
    let statusStyle = isDark 
      ? "bg-amber-950/60 border-amber-800 text-amber-400"
      : "bg-amber-50 border-amber-200 text-amber-600";
    if (item.status === 'approved') {
      statusStyle = isDark 
        ? "bg-emerald-950/60 border-emerald-800 text-emerald-400"
        : "bg-emerald-50 border-emerald-200 text-emerald-600";
    }
    if (item.status === 'rejected') {
      statusStyle = isDark 
        ? "bg-rose-950/60 border-rose-800 text-rose-400"
        : "bg-red-50 border-red-200 text-red-600";
    }
    
    return (
      <Card className={`mb-4 border ${isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-surface border-border'}`}>
        <CardContent>
          <View className="flex-row justify-between items-start mb-3">
            <View>
              <Text className={`text-base font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>{item.type}</Text>
              {isAdmin && <Text className={`text-xs font-medium mt-1 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:applied_by', { defaultValue: 'Applied by:' })} {item.userName}</Text>}
            </View>
            <View className={`px-3 py-1 rounded-full border ${statusStyle.split(' ')[0]} ${statusStyle.split(' ')[1]}`}>
              <Text className={`text-[10px] font-bold uppercase ${statusStyle.split(' ')[2]}`}>
                {item.status}
              </Text>
            </View>
          </View>

          {isAdmin && (
            <View className={`flex-row items-center p-2 rounded-lg border mb-3 ${isDark ? 'bg-blue-950/40 border-blue-800' : 'bg-primary/5 border-primary/20'}`}>
              <Text className={`text-xs font-bold w-[70px] ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('leave:balance_label', { defaultValue: 'Balance:' })}</Text>
              <Text className={`text-xs font-bold ${isDark ? 'text-sky-300' : 'text-primary'}`}>
                {t('leave:consumed_short', { defaultValue: 'Consumed' })} {item.leavesConsumed ?? 0} {t('leave:days_suffix', { defaultValue: 'days' })} / {t('leave:remaining_short', { defaultValue: 'Remaining' })} {item.leavesRemaining ?? 15} {t('leave:days_suffix', { defaultValue: 'days' })}
              </Text>
            </View>
          )}

          <View className="flex-row items-center mb-2">
            <Text className={`text-sm font-bold w-[60px] ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:dates_label', { defaultValue: 'Dates:' })}</Text>
            <Text className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>
              {item.startDate} {t('common:to', { defaultValue: 'to' })} {item.endDate} ({days} {days === 1 ? t('leave:day_single', { defaultValue: 'day' }) : t('leave:days_suffix', { defaultValue: 'days' })})
            </Text>
          </View>

          <View className="mb-3">
            <Text className={`text-sm font-bold mb-1.5 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:reason_label', { defaultValue: 'Reason:' })}</Text>
            <Text className={`text-sm p-3 rounded-lg border leading-5 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-surface border-border text-text-secondary'}`}>
              {item.reason}
            </Text>
          </View>

          <Text className={`text-[10px] font-medium self-end ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>
            {t('leave:applied_label', { defaultValue: 'Applied:' })} {new Date(item.appliedAt).toLocaleString()}
          </Text>

          {isAdmin && item.status === 'pending' && (
            <View className={`flex-row justify-end gap-3 mt-4 pt-3 border-t ${isDark ? 'border-slate-700' : 'border-border/50'}`}>
              <Button 
                variant="outline" 
                className={`min-w-[90px] ${isDark ? 'border-emerald-700 bg-emerald-950/60' : 'border-emerald-600 bg-emerald-50'}`}
                onPress={() => Alert.alert(t('common:confirm', { defaultValue: "Confirm" }), t('leave:confirm_approve', { defaultValue: "Approve this leave request?" }), [
                  { text: t('common:cancel', { defaultValue: "Cancel" }) },
                  { text: t('common:approve', { defaultValue: "Approve" }), onPress: () => handleUpdateLeaveStatus(item.id, 'approved') }
                ])}
              >
                <Text className={`font-bold text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{t('common:approve', { defaultValue: 'Approve' })}</Text>
              </Button>

              <Button 
                variant="outline" 
                className={`min-w-[90px] ${isDark ? 'border-red-700 bg-red-950/60' : 'border-red-600 bg-red-50'}`}
                onPress={() => Alert.alert(t('common:confirm', { defaultValue: "Confirm" }), t('leave:confirm_reject', { defaultValue: "Reject this leave request?" }), [
                  { text: t('common:cancel', { defaultValue: "Cancel" }) },
                  { text: t('common:reject', { defaultValue: "Reject" }), style: 'destructive', onPress: () => handleUpdateLeaveStatus(item.id, 'rejected') }
                ])}
              >
                <Text className={`font-bold text-sm ${isDark ? 'text-red-400' : 'text-red-700'}`}>{t('common:reject', { defaultValue: 'Reject' })}</Text>
              </Button>
            </View>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-background'}`} style={{ paddingTop: Platform.OS === 'ios' ? 50 : 20 }}>
      <Header />
      <View className={`flex-row justify-between items-center px-5 py-4 border-b ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>{t('leave:title', { defaultValue: 'Leaves Management' })}</Text>
      </View>

      {/* Employee Balance Card */}
      {!isAdmin && (
        <View className={`mx-5 mt-4 p-4 rounded-[14px] border items-center shadow-sm ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border shadow-black/5'}`}>
          <Text className={`text-sm font-bold mb-3 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:my_balance_title', { defaultValue: 'My Leaves Balance' })}</Text>
          <View className="flex-row items-center justify-around w-full">
            <View className="flex-1 items-center">
              <Text className={`text-2xl font-black ${isDark ? 'text-white' : 'text-text-main'}`}>{user?.consumedLeaves ?? 0}</Text>
              <Text className={`text-[11px] font-semibold mt-0.5 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:consumed_short', { defaultValue: 'Consumed' })}</Text>
            </View>
            <View className={`w-px h-8 ${isDark ? 'bg-slate-700' : 'bg-border'}`} />
            <View className="flex-1 items-center">
              <Text className={`text-2xl font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                {Math.max(0, (user?.allowedLeaves ?? 15) - (user?.consumedLeaves ?? 0))}
              </Text>
              <Text className={`text-[11px] font-semibold mt-0.5 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('leave:remaining_short', { defaultValue: 'Remaining' })}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View className={`flex-row p-1.5 mx-5 my-4 rounded-xl border ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <TouchableOpacity 
          className={`flex-1 py-2.5 items-center rounded-lg ${activeTab === 'pending' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('pending')}
        >
          <Text className={`text-sm font-bold ${activeTab === 'pending' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
            {t('leave:pending_tab', { defaultValue: 'Pending' })} ({pendingList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className={`flex-1 py-2.5 items-center rounded-lg ${activeTab === 'history' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('history')}
        >
          <Text className={`text-sm font-bold ${activeTab === 'history' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
            {t('leave:history_tab', { defaultValue: 'History' })} ({historyList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={isDark ? '#38BDF8' : '#0052CC'} className="flex-1 justify-center items-center" />
      ) : error ? (
        <View className="flex-1 justify-center items-center px-10">
          <Text className="text-base text-red-500 text-center mb-4">{error}</Text>
          <Button onPress={fetchLeaves} className="px-6">
            <Text className="text-white font-bold">{t('common:retry', { defaultValue: 'Retry' })}</Text>
          </Button>
        </View>
      ) : (
        <FlatList
          data={displayData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 56 + insets.bottom + 80 }}
          onRefresh={fetchLeaves}
          refreshing={loading}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center py-12">
              <Text className={`text-sm italic ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                {t('leave:no_records', { defaultValue: `No ${activeTab} leave records found.` })}
              </Text>
            </View>
          }
        />
      )}

      {!isAdmin && (
        <TouchableOpacity
          className={`absolute w-[56px] h-[56px] rounded-full justify-center items-center shadow-lg border border-white/20 z-50 ${isDark ? 'bg-blue-600 shadow-black/40' : 'bg-primary shadow-black/20'}`}
          style={{ bottom: 56 + insets.bottom + 16, right: 16 }}
          onPress={() => router.push('/leave-create' as any)}
          activeOpacity={0.8}
        >
          <IconSymbol name="plus" color="#ffffff" size={28} />
        </TouchableOpacity>
      )}
    </View>
  );
}
