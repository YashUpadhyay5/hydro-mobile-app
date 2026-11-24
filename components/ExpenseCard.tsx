import React from 'react';
import { View, Text } from 'react-native';
import AttachmentPreview from './AttachmentPreview';
import { Card } from './ui/Card';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDateLocale } from '@/src/i18n/dateLocale';

export interface Expense {
  id: string;
  userId?: string;
  userName?: string;
  category: string;
  amount: number;
  description: string;
  billNo?: string;
  billDate?: string;
  merchantName?: string;
  siteName?: string;
  invoiceUrl: string;
  invoiceUrls?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'suspicious';
  suspiciousReason?: string;
  createdAt: string;
}

interface ExpenseCardProps {
  expense: Expense;
  onEdit?: () => void;
}

export default function ExpenseCard({ expense, onEdit }: ExpenseCardProps) {
  const { t } = useTranslationSafe(['expense', 'common']);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  let statusStyle = isDark 
    ? "bg-amber-950/60 border-amber-800 text-amber-400"
    : "bg-amber-50 border-amber-200 text-amber-600";

  if (expense.status === 'approved') {
    statusStyle = isDark 
      ? "bg-emerald-950/60 border-emerald-800 text-emerald-400"
      : "bg-emerald-50 border-emerald-200 text-emerald-600";
  } else if (expense.status === 'rejected' || expense.status === 'suspicious') {
    statusStyle = isDark 
      ? "bg-rose-950/60 border-rose-800 text-rose-400"
      : "bg-rose-50 border-rose-200 text-rose-600";
  }

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className={`mb-4 overflow-hidden border ${isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-surface border-border'}`}>
      <View className="flex-row">
        <View className="relative">
          {expense.invoiceUrl ? (
            <AttachmentPreview source={expense.invoiceUrl} isDark={isDark} variant="thumb" />
          ) : (
            <View className={`w-[100px] min-h-[110px] justify-center items-center border-r ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-surface border-border/50'}`}>
              <Text className={`text-[10px] italic ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>{t('expense:no_invoice', { defaultValue: 'No Invoice' })}</Text>
            </View>
          )}
          {expense.invoiceUrls && expense.invoiceUrls.length > 1 && (
            <View className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 rounded">
              <Text className="text-[9px] font-black text-white">+{expense.invoiceUrls.length - 1}</Text>
            </View>
          )}
        </View>
        
        <View className="flex-1 p-3 justify-between">
          <View className="flex-row justify-between items-start mb-1">
            <Text className={`text-base font-bold flex-1 mr-2 ${isDark ? 'text-white' : 'text-text-main'}`} numberOfLines={1}>{expense.category}</Text>
            <Text className={`text-base font-black ${isDark ? 'text-sky-400' : 'text-primary'}`}>₹{expense.amount.toFixed(2)}</Text>
          </View>
          
          {expense.billNo || expense.merchantName || expense.siteName ? (
            <Text className={`text-xs font-semibold mb-1 ${isDark ? 'text-slate-400' : 'text-text-muted'}`} numberOfLines={1}>
              {expense.billNo ? `${t('expense:bill_hash', { defaultValue: 'Bill #' })}${expense.billNo}` : ''}
              {expense.billNo && (expense.merchantName || expense.siteName) ? ' • ' : ''}
              {expense.merchantName ? expense.merchantName : ''}
              {expense.merchantName && expense.siteName ? ' • ' : ''}
              {expense.siteName ? `${t('expense:site_label', { defaultValue: 'Site' })}: ${expense.siteName}` : ''}
            </Text>
          ) : null}

          {expense.description ? (
            <Text className={`text-xs mb-3 leading-4 ${isDark ? 'text-slate-300' : 'text-text-secondary'}`} numberOfLines={2}>
              {expense.description}
            </Text>
          ) : null}

          {expense.status === 'suspicious' && (
            <View className={`my-2 p-2 rounded border ${isDark ? 'bg-red-950/40 border-red-800' : 'bg-red-50 border-red-200'}`}>
              <Text className="text-[11px] font-bold text-red-600 dark:text-red-400">
                ⚠️ {t('expense:suspicious_flagged', { defaultValue: 'Mismatch / Suspicious' })}
              </Text>
              {expense.suspiciousReason ? (
                <Text className="text-[10px] text-red-500 dark:text-red-300 mt-0.5">
                  {expense.suspiciousReason}
                </Text>
              ) : null}
            </View>
          )}

          <View className="flex-row justify-between items-center mt-auto">
            <Text className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{formatDate(expense.createdAt)}</Text>
            <View className={`px-2 py-0.5 rounded-md border ${statusStyle.split(' ')[0]} ${statusStyle.split(' ')[1]}`}>
              <Text className={`text-[10px] font-bold uppercase ${statusStyle.split(' ')[2]}`}>
                {t(`common:${expense.status}`, { defaultValue: expense.status })}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}