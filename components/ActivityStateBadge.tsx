import React from 'react';
import { Text, View } from 'react-native';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import type { ActivityState } from '@/services/activityService';

const COLORS: Record<ActivityState, { bg: string; fg: string }> = {
  IN_PROGRESS: { bg: '#DBEAFE', fg: '#1D4ED8' },
  OVERDUE: { bg: '#FEE2E2', fg: '#B91C1C' },
  COMPLETED: { bg: '#DCFCE7', fg: '#15803D' },
  COMPLETED_LATE: { bg: '#FEF3C7', fg: '#B45309' },
  CANCELLED: { bg: '#E2E8F0', fg: '#475569' },
  UNFINISHED: { bg: '#FFEDD5', fg: '#C2410C' },
};

export default function ActivityStateBadge({ state }: { state: ActivityState }) {
  const { t } = useTranslationSafe(['attendance']);
  const labels: Record<ActivityState, string> = {
    IN_PROGRESS: t('attendance:act_state_in_progress', { defaultValue: 'In progress' }),
    OVERDUE: t('attendance:act_state_overdue', { defaultValue: 'Overdue' }),
    COMPLETED: t('attendance:act_state_completed', { defaultValue: 'Completed' }),
    COMPLETED_LATE: t('attendance:act_state_completed_late', { defaultValue: 'Completed late' }),
    CANCELLED: t('attendance:act_state_cancelled', { defaultValue: 'Cancelled' }),
    UNFINISHED: t('attendance:act_state_unfinished', { defaultValue: 'Not finished' }),
  };
  const c = COLORS[state] ?? COLORS.IN_PROGRESS;
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' }}>
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: '800' }}>{labels[state] ?? state}</Text>
    </View>
  );
}
