import Header from '@/components/Header';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, Platform, Image } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';
import ExpenseCard from '@/components/ExpenseCard';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ExpensesScreen() {
  const { user } = useAuth();
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

  const handleUpdateExpenseStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    try {
      const cleanUrl = API_BASE_URL.endsWith('/expenses') 
        ? API_BASE_URL 
        : `${API_BASE_URL}/expenses`;
      
      await api.patch(`${cleanUrl}/${id}/status`, { status: newStatus });
      Alert.alert(t('common:success', { defaultValue: "Success" }), t('expense:status_updated', { defaultValue: `Expense has been ${newStatus}.` }));
      
      setExpenses(prev => 
        prev.map(exp => exp.id === id ? { ...exp, status: newStatus } : exp)
      );
    } catch (err: any) {
      console.error("Failed to update expense status:", err.message);
      Alert.alert(t('common:error', { defaultValue: "Error" }), t('expense:err_update_status', { defaultValue: "Could not update expense status." }));
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  const isUserExpense = (exp: any) => {
    if (isAdmin) return true;
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
  const pendingList = userExpenses.filter(exp => exp.status === 'pending');
  const historyList = userExpenses.filter(exp => exp.status !== 'pending');

  const displayData = activeTab === 'pending' ? pendingList : historyList;

  const renderPendingItem = ({ item }: { item: any }) => {
    const isExpanded = expandedPendingId === item.id;
    return (
      <Card className={`mb-4 overflow-hidden border-l-4 border-y border-r ${isDark ? 'bg-slate-800/90 border-y-slate-700 border-r-slate-700' : 'bg-white border-y-border border-r-border'} ${isExpanded ? (isDark ? 'border-l-blue-500 bg-blue-950/20' : 'border-l-primary bg-primary/5') : 'border-l-amber-500'}`}>
        <TouchableOpacity 
          className="p-4"
          onPress={() => setExpandedPendingId(isExpanded ? null : item.id)}
          activeOpacity={0.7}
        >
          <View className="flex-row justify-between items-center mb-2">
            <Text className={`text-base font-bold flex-1 mr-2 ${isDark ? 'text-white' : 'text-text-main'}`} numberOfLines={1}>
              {item.category} {item.userName ? `(${t('common:by', { defaultValue: 'by' })} ${item.userName})` : ''}
            </Text>
            <Text className={`text-base font-black ${isDark ? 'text-sky-400' : 'text-primary'}`}>₹{item.amount.toFixed(2)}</Text>
          </View>

          <View className="flex-row justify-between items-center mt-1">
            <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('expense:submitted', { defaultValue: 'Submitted:' })} {new Date(item.createdAt).toLocaleDateString()}</Text>
            <Text className={`text-[11px] font-bold ${isDark ? 'text-sky-400' : 'text-primary'}`}>
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
                <Text className={`text-xs font-bold mb-2 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('expense:invoice_attachment', { defaultValue: 'Invoice / Attachment:' })}</Text>
                {item.invoiceUrl ? (
                  <Image 
                    source={{ uri: item.invoiceUrl.replace(/\\/g, '/').startsWith('http') ? item.invoiceUrl.replace(/\\/g, '/') : `${API_BASE_URL.replace('/api', '')}/${item.invoiceUrl.replace(/\\/g, '/').startsWith('/') ? item.invoiceUrl.replace(/\\/g, '/').substring(1) : item.invoiceUrl.replace(/\\/g, '/')}` }} 
                    className={`w-full h-[200px] rounded-lg ${isDark ? 'bg-slate-900' : 'bg-surface'}`}
                    resizeMode="contain" 
                  />
                ) : (
                  <View className={`w-full h-[80px] rounded-lg justify-center items-center border border-dashed ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border'}`}>
                    <Text className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>{t('expense:no_invoice', { defaultValue: 'No Invoice Attached' })}</Text>
                  </View>
                )}
              </View>
              
              {isAdmin && (
                <View className={`flex-row justify-end gap-3 mt-4 pt-3 border-t ${isDark ? 'border-slate-700' : 'border-border/50'}`}>
                  <Button 
                    variant="outline" 
                    className={`min-w-[90px] ${isDark ? 'border-emerald-700 bg-emerald-950/60' : 'border-emerald-600 bg-emerald-50'}`}
                    onPress={() => handleUpdateExpenseStatus(item.id, 'approved')}
                  >
                    <Text className={`font-bold text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{t('common:approve', { defaultValue: 'Approve' })}</Text>
                  </Button>
                  <Button 
                    variant="outline" 
                    className={`min-w-[90px] ${isDark ? 'border-red-700 bg-red-950/60' : 'border-red-600 bg-red-50'}`}
                    onPress={() => handleUpdateExpenseStatus(item.id, 'rejected')}
                  >
                    <Text className={`font-bold text-sm ${isDark ? 'text-red-400' : 'text-red-700'}`}>{t('common:reject', { defaultValue: 'Reject' })}</Text>
                  </Button>
                </View>
              )}
            </View>
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
    <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-background'}`} style={{ paddingTop: Platform.OS === 'ios' ? 50 : 20 }}>
      <Header />
      <View className={`flex-row justify-between items-center px-5 py-4 border-b ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>
          {activeTab === 'pending' 
            ? (isAdmin ? t('expense:pending_approvals', { defaultValue: 'Pending Approvals' }) : t('expense:my_pending', { defaultValue: 'My Pending' }))
            : (isAdmin ? t('expense:expense_history', { defaultValue: 'Expense History' }) : t('expense:my_history', { defaultValue: 'My History' }))
          }
        </Text>
        <TouchableOpacity 
          className={`px-3 py-1.5 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-surface border-border'}`} 
          onPress={fetchExpenses}
        >
          <Text className={`text-xs font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>🔄 {t('common:refresh', { defaultValue: 'Refresh' })}</Text>
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

      {/* Floating Action Dock (Positioned cleanly above standard bottom navigation bar) */}
      <View 
        className={`absolute left-4 right-4 h-[50px] rounded-2xl border flex-row items-center justify-between px-3 shadow-lg z-50 ${isDark ? 'bg-[#1E293B] border-[#334155] shadow-black/40' : 'bg-white border-border shadow-black/10'}`} 
        style={{ bottom: 56 + insets.bottom + 12 }}
      >
        <TouchableOpacity 
          className={`flex-1 h-11 justify-center items-center rounded-xl ${activeTab === 'pending' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('pending')}
        >
          <Text className={`text-xs font-bold ${activeTab === 'pending' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
            {isAdmin ? t('expense:pending_approvals', { defaultValue: 'Pending' }) : t('expense:my_pending', { defaultValue: 'Pending' })}
          </Text>
        </TouchableOpacity>

        <Link href="/expense-create" asChild>
          <TouchableOpacity className={`px-4 h-[42px] rounded-full justify-center items-center mx-2 shadow-md ${isDark ? 'bg-blue-600 shadow-blue-500/30' : 'bg-primary shadow-primary/30'}`}>
            <Text className="text-white font-bold text-[13px]">+ {t('expense:add_expense', { defaultValue: 'Add Expense' })}</Text>
          </TouchableOpacity>
        </Link>

        <TouchableOpacity 
          className={`flex-1 h-11 justify-center items-center rounded-xl ${activeTab === 'history' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('history')}
        >
          <Text className={`text-xs font-bold ${activeTab === 'history' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
            {isAdmin ? t('expense:all_history', { defaultValue: 'History' }) : t('expense:my_history', { defaultValue: 'History' })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}