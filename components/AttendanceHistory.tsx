import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from "./ui/Card";
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

export default function AttendanceHistory({ history }: { history: any[] }) {
  const { t } = useTranslationSafe(['attendance', 'common']);
  const [expandedDates, setExpandedDates] = useState<{ [key: string]: boolean }>({});

  const groupedHistory = history.reduce((acc: { [key: string]: any[] }, item) => {
    const dateKey = item.date || 'Unknown Date';
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(item);
    return acc;
  }, {});

  const toggleDate = (dateKey: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

  const dates = Object.keys(groupedHistory).sort((a, b) => b.localeCompare(a));

  const formatReadableDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' });
      }
    }
    return dateStr;
  };

  return (
    <Card className="w-11/12">
      <CardHeader>
        <Text className="text-base font-bold text-text-main">{t('attendance:datewise_history_title', { defaultValue: 'Datewise Attendance History' })}</Text>
      </CardHeader>
      
      <CardContent className="p-0">
        {dates.length === 0 ? (
          <Text className="text-sm text-text-muted italic text-center py-6">{t('attendance:no_records', { defaultValue: 'No attendance records found.' })}</Text>
        ) : (
          <ScrollView 
            className="max-h-[350px] w-full p-4" 
            nestedScrollEnabled={true} 
          >
            {dates.map((dateKey) => {
              const records = groupedHistory[dateKey];
              const isExpanded = !!expandedDates[dateKey];
              
              return (
                <View key={dateKey} className="mb-3 rounded-xl border border-border bg-surface overflow-hidden">
                  <TouchableOpacity 
                    className="flex-row justify-between items-center p-3 bg-border/30" 
                    onPress={() => toggleDate(dateKey)}
                    activeOpacity={0.7}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-bold text-text-main">{formatReadableDate(dateKey)}</Text>
                      <View className="bg-white px-2 py-0.5 rounded-md border border-border/50">
                        <Text className="text-[10px] font-bold text-text-muted">
                          {records.length} {records.length === 1 ? t('attendance:session_single', { defaultValue: 'session' }) : t('attendance:sessions_plural', { defaultValue: 'sessions' })}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs font-bold text-text-muted">{isExpanded ? '▲' : '▼'}</Text>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View className="bg-white px-3">
                      {records.map((item: any, idx: number) => (
                        <View key={item.id || idx} className={`py-3 ${idx < records.length - 1 ? 'border-b border-border/50' : ''}`}>
                          <View className="flex-row justify-between items-center mb-1">
                            <Text className="text-xs font-bold text-text-muted">{t('attendance:shift', { defaultValue: 'Shift' })} {idx + 1}:</Text>
                            <Text className="text-sm font-bold text-primary">{item.checkIn} - {item.checkOut || t('attendance:status_active', { defaultValue: 'Active' })}</Text>
                          </View>
                          {item.workingHours && (
                            <View className="flex-row justify-between items-center mb-1.5">
                              <Text className="text-[11px] font-medium text-text-muted">{t('attendance:duration_label', { defaultValue: 'Duration:' })}</Text>
                              <Text className="text-xs font-bold text-emerald-500">{item.workingHours}</Text>
                            </View>
                          )}
                          {item.address ? (
                            <Text className="text-[11px] font-medium text-text-main mt-1 leading-4" numberOfLines={2}>
                              📍 {item.address}
                            </Text>
                          ) : item.coords ? (
                            <Text className="text-[11px] text-text-muted mt-1">
                              📍 {item.coords.lat.toFixed(4)}, {item.coords.lon.toFixed(4)}
                            </Text>
                          ) : (
                            <Text className="text-[11px] italic text-text-muted mt-1">📍 {t('attendance:no_location_resolved', { defaultValue: 'No location resolved' })}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </CardContent>
    </Card>
  );
}