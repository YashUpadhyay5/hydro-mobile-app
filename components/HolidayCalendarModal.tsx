import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface Holiday {
  id: string;
  title?: string;
  name?: string;
  date: string;
  dateFormatted?: string;
  day?: string;
  type: string;
  description?: string;
  diffDays?: number;
  countdown?: string;
}

export interface CalendarInfo {
  id: string;
  name: string;
  location: string;
  year: number;
  totalHolidays: number;
}

interface HolidayCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  holidays: Holiday[];
  calendar?: CalendarInfo | null;
}

export function HolidayCalendarModal({ visible, onClose, holidays, calendar }: HolidayCalendarModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'UPCOMING' | 'PAST' | 'NATIONAL' | 'REGIONAL' | 'FLOATING'>('ALL');

  const filteredHolidays = holidays.filter((item) => {
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'UPCOMING') return item.diffDays !== undefined && item.diffDays >= 0;
    if (selectedFilter === 'PAST') return item.diffDays !== undefined && item.diffDays < 0;
    
    const typeUpper = (item.type || '').toUpperCase();
    if (selectedFilter === 'NATIONAL') return typeUpper.includes('NATIONAL');
    if (selectedFilter === 'REGIONAL') return typeUpper.includes('REGIONAL') || typeUpper.includes('STATE') || typeUpper.includes('FESTIVAL');
    if (selectedFilter === 'FLOATING') return typeUpper.includes('FLOAT');
    return true;
  });

  const totalCount = holidays.length;
  const upcomingCount = holidays.filter(h => h.diffDays !== undefined && h.diffDays >= 0).length;
  const pastCount = holidays.filter(h => h.diffDays !== undefined && h.diffDays < 0).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, isDark && { backgroundColor: '#0F172A' }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        
        {/* Top Header */}
        <View style={[styles.header, isDark && { backgroundColor: '#1E293B', borderBottomColor: '#334155' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, isDark && { color: '#F8FAFC' }]}>{calendar?.name || 'Holiday Calendar'}</Text>
            <Text style={[styles.headerSubtitle, isDark && { color: '#94A3B8' }]}>
              {calendar?.location ? `📍 Location: ${calendar.location} • ${calendar.year || 2026}` : 'Official company holidays schedule'}
            </Text>
          </View>
          <TouchableOpacity 
            style={[styles.closeBtn, isDark && { backgroundColor: '#334155' }]} 
            onPress={onClose} 
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </TouchableOpacity>
        </View>

        {/* Quick Stats Bar */}
        <View style={[styles.statsRow, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, isDark && { color: '#F8FAFC' }]}>{totalCount}</Text>
            <Text style={[styles.statLabel, isDark && { color: '#94A3B8' }]}>Total</Text>
          </View>
          <View style={[styles.statBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <Text style={[styles.statNumber, { color: '#10B981' }]}>{upcomingCount}</Text>
            <Text style={[styles.statLabel, isDark && { color: '#94A3B8' }]}>Upcoming</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#64748B' }]}>{pastCount}</Text>
            <Text style={[styles.statLabel, isDark && { color: '#94A3B8' }]}>Passed</Text>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(['ALL', 'UPCOMING', 'PAST', 'NATIONAL', 'REGIONAL', 'FLOATING'] as const).map((filter) => {
            const isActive = selectedFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterPill, 
                  isDark && { backgroundColor: '#1E293B' },
                  isActive && (isDark ? { backgroundColor: '#38BDF8' } : styles.filterPillActive)
                ]}
                onPress={() => setSelectedFilter(filter)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.filterText, 
                  isDark && { color: '#94A3B8' },
                  isActive && (isDark ? { color: '#0F172A', fontWeight: '800' } : styles.filterTextActive)
                ]}>
                  {filter === 'ALL' ? 'All' : filter.charAt(0) + filter.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Holiday Cards List */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredHolidays.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={isDark ? '#64748B' : '#94A3B8'} />
              <Text style={[styles.emptyTitle, isDark && { color: '#F8FAFC' }]}>No Holidays Found</Text>
              <Text style={[styles.emptyDesc, isDark && { color: '#94A3B8' }]}>No company holidays match your selected filter criteria.</Text>
            </View>
          ) : (
            filteredHolidays.map((holiday) => {
              const typeUpper = (holiday.type || '').toUpperCase();
              const isNational = typeUpper.includes('NATIONAL');
              const isRegional = typeUpper.includes('REGIONAL') || typeUpper.includes('STATE') || typeUpper.includes('FESTIVAL');
              const isPast = holiday.diffDays !== undefined && holiday.diffDays < 0;

              const title = holiday.title || holiday.name || 'Holiday';
              const dateDisplay = holiday.dateFormatted || holiday.date;

              return (
                <View 
                  key={holiday.id} 
                  style={[
                    styles.holidayCard, 
                    isDark && { backgroundColor: '#1E293B', borderColor: '#334155' },
                    isPast && (isDark ? { backgroundColor: '#0F172A', borderColor: '#334155' } : styles.holidayCardPast)
                  ]}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.dateBadge}>
                      <Ionicons name="calendar-sharp" size={16} color={isPast ? "#64748B" : (isDark ? "#38BDF8" : "#0F172A")} />
                      <Text style={[styles.dateBadgeText, isDark && { color: '#F8FAFC' }, isPast && { color: '#64748B' }]}>{dateDisplay}</Text>
                      {holiday.day ? <Text style={[styles.dayBadgeText, isDark && { color: '#94A3B8' }]}>• {holiday.day}</Text> : null}
                    </View>

                    {holiday.countdown ? (
                      <View style={[
                        styles.countdownBadge,
                        holiday.countdown.includes('Today') ? styles.countdownToday :
                        holiday.countdown.includes('Tomorrow') ? styles.countdownTomorrow :
                        isPast ? styles.countdownPast : styles.countdownStandard,
                        isDark && { backgroundColor: '#0F172A' }
                      ]}>
                        <Text style={[
                          styles.countdownText,
                          holiday.countdown.includes('Today') ? styles.countdownTextToday :
                          holiday.countdown.includes('Tomorrow') ? styles.countdownTextTomorrow :
                          isPast ? styles.countdownTextPast : (isDark ? { color: '#38BDF8' } : styles.countdownTextStandard)
                        ]}>
                          {holiday.countdown}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.holidayDetails}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.holidayTitle, isDark && { color: '#F8FAFC' }, isPast && styles.holidayTitlePast]}>{title}</Text>
                      <View style={[
                        styles.tagBadge,
                        isNational ? styles.tagNational : isRegional ? styles.tagRegional : styles.tagFloating,
                        isDark && { backgroundColor: '#0F172A' }
                      ]}>
                        <Text style={[
                          styles.tagText,
                          isNational ? styles.tagTextNational : isRegional ? styles.tagTextRegional : styles.tagTextFloating,
                          isDark && { color: '#38BDF8' }
                        ]}>
                          {holiday.type}
                        </Text>
                      </View>
                    </View>

                    {holiday.description ? (
                      <Text style={[styles.holidayDesc, isDark && { color: '#94A3B8' }]}>{holiday.description}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#0F172A',
  },
  filterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  holidayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  holidayCardPast: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.85,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  countdownBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countdownToday: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  countdownTomorrow: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  countdownStandard: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  countdownPast: {
    backgroundColor: '#F1F5F9',
  },
  countdownText: {
    fontSize: 11,
    fontWeight: '800',
  },
  countdownTextToday: {
    color: '#15803D',
  },
  countdownTextTomorrow: {
    color: '#B45309',
  },
  countdownTextStandard: {
    color: '#0284C7',
  },
  countdownTextPast: {
    color: '#94A3B8',
  },
  holidayDetails: {
    marginTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  holidayTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  holidayTitlePast: {
    color: '#64748B',
  },
  holidayDesc: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 18,
  },
  tagBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagNational: {
    backgroundColor: '#E0F2FE',
  },
  tagRegional: {
    backgroundColor: '#F3E8FF',
  },
  tagFloating: {
    backgroundColor: '#FEF3C7',
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  tagTextNational: {
    color: '#0284C7',
  },
  tagTextRegional: {
    color: '#7E22CE',
  },
  tagTextFloating: {
    color: '#D97706',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
  },
});
