import Header from '@/components/Header';
import AttachmentPreview from '@/components/AttachmentPreview';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';
import ExpenseCard from '@/components/ExpenseCard';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';

export default function ExpensesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['expense', 'common', 'nav']);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPendingId, setExpandedPendingId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const cleanUrl = API_BASE_URL.endsWith('/expenses') 
        ? API_BASE_URL 
        : `${API_BASE_URL}/expenses`;
        
      const response = await api.get(cleanUrl, {
        withCredentials: true
      });
      
      const data = Array.isArray(response.data) ? response.data : response.data.expenses || [];
      setExpenses(data);
    } catch (err: any) {
      console.error("Fetch error details:", err.message);
      setError(t('expense:err_load_logs', { defaultValue: "Failed to load expense logs." }));
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchExpenses();
    }, [])
  );

  const isUserExpense = (exp: any) => {
    const empCode = user?.empCode || user?.employeeCode;
    const uId = user?.id;
    const uName = user?.name?.toLowerCase();

    return (
      (empCode && exp.userId === empCode) ||
      (uId && exp.userId === uId) ||
      (empCode && exp.empCode === empCode) ||
      (uId && exp.empCode === uId) ||
      (uName && exp.userName && exp.userName.toLowerCase() === uName)
    );
  };

  const userExpenses = expenses.filter(isUserExpense);
  const pendingList = userExpenses.filter(exp => exp.status === 'pending' || exp.status === 'suspicious');
  const historyList = userExpenses.filter(exp => exp.status !== 'pending' && exp.status !== 'suspicious');

  const displayData = activeTab === 'pending' ? pendingList : historyList;

  const renderPendingItem = ({ item }: { item: any }) => {
    const isExpanded = expandedPendingId === item.id;
    const isSuspicious = item.status === 'suspicious';

    const borderClass = isSuspicious 
      ? 'border-l-red-500' 
      : isExpanded 
        ? (isDark ? 'border-l-blue-500' : 'border-l-primary') 
        : 'border-l-amber-500';

    const bgClass = isSuspicious 
      ? (isDark ? 'bg-red-950/20' : 'bg-red-50/40') 
      : isExpanded 
        ? (isDark ? 'bg-blue-950/20' : 'bg-primary/5') 
        : (isDark ? 'bg-slate-800/90' : 'bg-white');

    return (
      <Card className={`mb-4 overflow-hidden border-l-4 border-y border-r ${isDark ? 'border-y-slate-700 border-r-slate-700' : 'border-y-border border-r-border'} ${borderClass} ${bgClass}`}>
        <TouchableOpacity 
          className="p-4"
          onPress={() => setExpandedPendingId(isExpanded ? null : item.id)}
          activeOpacity={0.7}
        >
          <View className="flex-row justify-between items-center mb-1">
            <View className="flex-1 mr-2 flex-row items-center flex-wrap gap-1.5">
              <Text className={`text-base font-bold ${isDark ? 'text-white' : 'text-text-main'}`} numberOfLines={1}>
                {item.category} {item.userName ? `(${t('common:by', { defaultValue: 'by' })} ${item.userName})` : ''}
              </Text>
              {isSuspicious && (
                <View className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/60 border border-red-300 dark:border-red-700">
                  <Text className="text-[10px] font-black uppercase text-red-700 dark:text-red-300">
                    ⚠️ {t('expense:mismatch_flag', { defaultValue: 'Mismatch Flagged' })}
                  </Text>
                </View>
              )}
            </View>
            <Text className={`text-base font-black ${isSuspicious ? 'text-red-600 dark:text-red-400' : isDark ? 'text-sky-400' : 'text-primary'}`}>₹{item.amount.toFixed(2)}</Text>
          </View>

          {isSuspicious && (
            <View className={`my-2 p-2.5 rounded-lg border ${isDark ? 'bg-red-950/60 border-red-800' : 'bg-red-100/60 border-red-200'}`}>
              <Text className="text-xs font-bold text-red-700 dark:text-red-300">
                {t('expense:admin_note', { defaultValue: 'Admin Mismatch Note:' })}
              </Text>
              <Text className="text-xs text-red-600 dark:text-red-200 mt-0.5 leading-4">
                {item.suspiciousReason || t('expense:mismatch_detected', { defaultValue: 'Mismatch detected by Admin. Please review, edit, and resend.' })}
              </Text>
            </View>
          )}

          <View className="flex-row justify-between items-center mt-1">
            <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('expense:submitted', { defaultValue: 'Submitted:' })} {new Date(item.createdAt).toLocaleDateString(getDateLocale())}</Text>
            <Text className={`text-[11px] font-bold ${isSuspicious ? 'text-red-600 dark:text-red-400' : isDark ? 'text-sky-400' : 'text-primary'}`}>
              {isExpanded ? `▲ ${t('common:hide_details', { defaultValue: 'Hide Details' })}` : `▼ ${t('common:view_details', { defaultValue: 'View Details' })}`}
            </Text>
          </View>
          
          {isExpanded && (
            <View className={`mt-3 pt-3 border-t ${isDark ? 'border-slate-700' : 'border-border/50'}`}>
              <View className={`mb-3 flex-row flex-wrap gap-4 p-2.5 rounded-lg border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border/40'}`}>
                {item.billNo ? (
                  <View>
                    <Text className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('expense:bill_no', { defaultValue: 'Bill No:' })}</Text>
                    <Text className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.billNo}</Text>
                  </View>
                ) : null}
                {item.billDate ? (
                  <View>
                    <Text className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('expense:bill_date', { defaultValue: 'Bill Date:' })}</Text>
                    <Text className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.billDate}</Text>
                  </View>
                ) : null}
                {item.merchantName ? (
                  <View>
                    <Text className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('expense:merchant_name', { defaultValue: 'Merchant:' })}</Text>
                    <Text className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.merchantName}</Text>
                  </View>
                ) : null}
                {item.siteName ? (
                  <View>
                    <Text className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('expense:site_name', { defaultValue: 'Site Name:' })}</Text>
                    <Text className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.siteName}</Text>
                  </View>
                ) : null}
              </View>

              {item.description ? (
                <View className="mb-3">
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('expense:description', { defaultValue: 'Description:' })}</Text>
                  <Text className={`text-sm leading-5 ${isDark ? 'text-slate-300' : 'text-text-secondary'}`}>
                    {item.description}
                  </Text>
                </View>
              ) : null}

              <View className="mb-3">
                <Text className={`text-xs font-bold mb-2 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                  {t('expense:invoice_attachment', { defaultValue: 'Invoice / Attachment:' })}
                  {Array.isArray(item.invoiceUrls) && item.invoiceUrls.length > 1 ? ` (${item.invoiceUrls.length})` : ''}
                </Text>
                {(() => {
                  const urls: string[] = Array.isArray(item.invoiceUrls) && item.invoiceUrls.length > 0 
                    ? item.invoiceUrls 
                    : (item.invoiceUrl ? [item.invoiceUrl] : []);
                  if (urls.length === 0) {
                    return (
                      <View className={`w-full h-[80px] rounded-lg justify-center items-center border border-dashed ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'}`}>
                        <Text className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>{t('expense:no_invoice', { defaultValue: 'No Invoice Attached' })}</Text>
                      </View>
                    );
                  }
                  return (
                    <View className="gap-3">
                      {urls.map((u, idx) => (
                        <View key={`${u}-${idx}`}>
                          {urls.length > 1 && (
                            <Text className={`text-[10px] font-bold mb-1 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                              {t('expense:attachment_item', { defaultValue: 'Attachment' })} #{idx + 1}
                            </Text>
                          )}
                          <AttachmentPreview source={u} isDark={isDark} variant="full" />
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            </View>
          )}

          {isSuspicious && (
            <TouchableOpacity
              className="mt-3 py-2.5 px-4 rounded-xl flex-row items-center justify-center bg-red-600 active:bg-red-700 shadow-sm"
              onPress={() => router.push({
                pathname: '/expense-create',
                params: {
                  expenseId: item.id,
                  category: item.category,
                  amount: String(item.amount),
                  billNo: item.billNo || '',
                  billDate: item.billDate || '',
                  merchantName: item.merchantName || '',
                  siteName: item.siteName || '',
                  description: item.description || '',
                  invoiceUrl: item.invoiceUrl || '',
                  invoiceUrls: JSON.stringify(Array.isArray(item.invoiceUrls) && item.invoiceUrls.length > 0 ? item.invoiceUrls : (item.invoiceUrl ? [item.invoiceUrl] : [])),
                  suspiciousReason: item.suspiciousReason || ''
                }
              } as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="pencil" color="#ffffff" size={16} />
              <Text className="text-white font-bold text-xs ml-2">
                {t('expense:edit_and_resend', { defaultValue: 'Edit & Resend Expense' })}
              </Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Card>
    );
  };

  if (loading) {
    return (
      <View className={`flex-1 justify-center items-center ${isDark ? 'bg-[#0F172A]' : 'bg-background'}`}>
        <ActivityIndicator size="large" color={isDark ? '#38BDF8' : '#0052CC'} />
      </View>
    );
  }

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-background'}`}>
      <Header />
      {/* Page Header */}
      <View className={`flex-row justify-between items-center px-5 py-4 border-b ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>
          {t('expense:title', { defaultValue: 'Expenses' })}
        </Text>
        <TouchableOpacity
          className={`w-[42px] h-[42px] rounded-full justify-center items-center shadow-md ${isDark ? 'bg-blue-600 shadow-black/40' : 'bg-primary shadow-black/20'}`}
          onPress={() => router.push('/expense-create' as any)}
          activeOpacity={0.8}
        >
          <IconSymbol name="plus" color="#ffffff" size={22} />
        </TouchableOpacity>
      </View>

      {/* Pill Tab Switcher */}
      <View className={`flex-row p-1.5 mx-5 my-4 rounded-xl border ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <TouchableOpacity
          className={`flex-1 py-2.5 items-center rounded-lg ${activeTab === 'pending' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('pending')}
        >
          <Text className={`text-sm font-bold ${activeTab === 'pending' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
            {t('expense:my_pending', { defaultValue: 'Pending' })} ({pendingList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-2.5 items-center rounded-lg ${activeTab === 'history' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('history')}
        >
          <Text className={`text-sm font-bold ${activeTab === 'history' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
            {t('expense:my_history', { defaultValue: 'History' })} ({historyList.length})
          </Text>
        </TouchableOpacity>
      </View>


      {error ? (
        <View className="flex-1 justify-center items-center px-10">
          <Text className="text-base text-red-500 text-center mb-4">{error}</Text>
          <Button onPress={fetchExpenses} className="px-6">
            <Text className="text-white font-bold text-sm">{t('common:retry', { defaultValue: 'Retry Connection' })}</Text>
          </Button>
        </View>
      ) : (
        <View className="flex-1">
          <FlatList
            data={displayData}
            keyExtractor={(item: any) => item.id?.toString()}
            renderItem={activeTab === 'pending' ? renderPendingItem : ({ item }) => <ExpenseCard expense={item} />}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 56 + insets.bottom + 76 }}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-12">
                <Text className={`text-sm italic ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                  {activeTab === 'pending' 
                    ? t('expense:no_pending', { defaultValue: 'No pending expenses found.' }) 
                    : t('expense:no_history', { defaultValue: 'No expense history found.' })
                  }
                </Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}