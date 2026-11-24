import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardContent } from '@/components/ui/Card';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LeaveTransaction } from '@/services/leaveService';
import {
  formatTransactionDate,
  formatAmountNumber,
  getActivityTitle,
  getActivityDescription,
  getActivityBadge,
  getAmountUnit
} from '@/utils/leaveActivity';

interface LeaveActivityCardProps {
  item: LeaveTransaction;
}

export default function LeaveActivityCard({ item }: LeaveActivityCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const isEarned = String(item.transactionType).toLowerCase() === 'earned';
  const rawAmount = typeof item.amount === 'number' ? item.amount : parseFloat(String(item.amount || 0));
  const amountStr = formatAmountNumber(rawAmount);
  const formattedDate = item.periodLabel || formatTransactionDate(item.transactionDate || item.createdAt);
  const title = item.title || getActivityTitle(item);
  const description = getActivityDescription(item);
  const badgeText = getActivityBadge(item);
  const unitText = getAmountUnit(item);

  let badgeStyle = isDark ? 'bg-emerald-950/60 border-emerald-800' : 'bg-emerald-50 border-emerald-200';
  let badgeTextStyle = isDark ? 'text-emerald-400' : 'text-emerald-700';

  const isLop = item.leaveType === 'LOP' ||
                item.sourceType === 'lop' ||
                item.sourceName === 'Loss of Pay' ||
                (item.reason && item.reason.toLowerCase().includes('loss of pay'));

  if (isLop) {
    badgeStyle = isDark ? 'bg-red-950/70 border-red-800' : 'bg-red-50 border-red-200';
    badgeTextStyle = isDark ? 'text-red-400 font-bold' : 'text-red-700 font-bold';
  } else if (item.sourceType === 'sunday_work') {
    badgeStyle = isDark ? 'bg-indigo-950/70 border-indigo-800' : 'bg-indigo-50 border-indigo-200';
    badgeTextStyle = isDark ? 'text-indigo-400' : 'text-indigo-700';
  } else if (item.sourceType === 'holiday_work' || item.sourceType === 'function_work') {
    badgeStyle = isDark ? 'bg-amber-950/70 border-amber-800' : 'bg-amber-50 border-amber-200';
    badgeTextStyle = isDark ? 'text-amber-400' : 'text-amber-700';
  } else if (item.sourceType === 'migration') {
    badgeStyle = isDark ? 'bg-purple-950/70 border-purple-800' : 'bg-purple-50 border-purple-200';
    badgeTextStyle = isDark ? 'text-purple-400 font-bold' : 'text-purple-700 font-bold';
  } else if (!isEarned) {
    badgeStyle = isDark ? 'bg-rose-950/60 border-rose-800' : 'bg-rose-50 border-rose-200';
    badgeTextStyle = isDark ? 'text-rose-400' : 'text-rose-700';
  }

  return (
    <Card className={`mb-3.5 border ${isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200/80 shadow-sm shadow-slate-100'}`}>
      <CardContent className="p-4">
        <View className="flex-row items-start">
          {/* 1. Transaction Icon */}
          <View
            className={`w-10 h-10 rounded-xl items-center justify-center mr-3 mt-0.5 ${
              isEarned
                ? isDark
                  ? 'bg-emerald-950/70 border border-emerald-800/60'
                  : 'bg-emerald-50 border border-emerald-100'
                : isDark
                ? 'bg-rose-950/70 border border-rose-800/60'
                : 'bg-rose-50 border border-rose-100'
            }`}
          >
            <Ionicons
              name={isEarned ? 'add' : 'remove'}
              size={22}
              color={isEarned ? '#059669' : '#DC2626'}
            />
          </View>

          {/* 2, 3, 4. Details (Title, Date, Description, Badge) */}
          <View className="flex-1 mr-2">
            <View className="flex-row items-center flex-wrap gap-1.5 mb-1">
              <Text className={`text-[15px] font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {title}
              </Text>
              {badgeText && (
                <View className={`px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                  <Text className={`text-[10px] font-bold ${badgeTextStyle}`}>
                    {badgeText}
                  </Text>
                </View>
              )}
            </View>

            {/* Transaction Date */}
            <View className="flex-row items-center mb-1.5">
              <Ionicons
                name="calendar-outline"
                size={12}
                color={isDark ? '#94A3B8' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <Text className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {formattedDate}
              </Text>
            </View>

            {/* Description / Reason */}
            <Text
              className={`text-xs font-medium leading-4 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
              numberOfLines={3}
            >
              {description}
            </Text>
          </View>

          {/* 5. Right-aligned Amount (+1.0 / -1.0) */}
          <View className="items-end pl-1 pt-0.5">
            <Text
              className={`text-base font-black ${
                isEarned ? 'text-emerald-600' : 'text-red-600'
              }`}
              style={{ color: isEarned ? '#059669' : '#DC2626' }}
            >
              {isEarned ? `+${amountStr}` : `-${amountStr}`}
            </Text>
            <Text
              className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                isDark ? 'text-slate-400' : 'text-slate-400'
              }`}
            >
              {unitText}
            </Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}
