import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Platform,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface Announcement {
  id: string;
  title: string;
  description: string;
  datePosted: string;
  priority: string;
  author?: string;
}

interface AnnouncementsModalProps {
  visible: boolean;
  onClose: () => void;
  announcements: Announcement[];
}

export function AnnouncementsModal({ visible, onClose, announcements }: AnnouncementsModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<'ALL' | 'URGENT' | 'POLICY' | 'GENERAL'>('ALL');

  const filteredAnnouncements = announcements.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());

    const priUpper = (item.priority || '').toUpperCase();
    let matchesPriority = selectedPriority === 'ALL';

    if (selectedPriority === 'URGENT') {
      matchesPriority = priUpper.includes('URGENT') || priUpper.includes('HIGH');
    } else if (selectedPriority === 'POLICY') {
      matchesPriority = priUpper.includes('POLICY') || priUpper.includes('NOTICE');
    } else if (selectedPriority === 'GENERAL') {
      matchesPriority = priUpper.includes('GENERAL') || priUpper.includes('MEDIUM') || priUpper.includes('LOW');
    }

    return matchesSearch && matchesPriority;
  });

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
          <View>
            <Text style={[styles.headerTitle, isDark && { color: '#F8FAFC' }]}>Company Announcements</Text>
            <Text style={[styles.headerSubtitle, isDark && { color: '#94A3B8' }]}>Official corporate notices & policy updates</Text>
          </View>
          <TouchableOpacity 
            style={[styles.closeBtn, isDark && { backgroundColor: '#334155' }]} 
            onPress={onClose} 
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </TouchableOpacity>
        </View>

        {/* Search Input Bar */}
        <View style={[styles.searchBarContainer, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
          <Ionicons name="search" size={18} color={isDark ? '#94A3B8' : '#64748B'} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, isDark && { color: '#F8FAFC' }]}
            placeholder="Search announcements..."
            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={isDark ? '#64748B' : '#94A3B8'} />
            </TouchableOpacity>
          )}
        </View>

        {/* Priority Filter Pills */}
        <View style={styles.filterRow}>
          {(['ALL', 'URGENT', 'POLICY', 'GENERAL'] as const).map((pri) => {
            const isActive = selectedPriority === pri;
            return (
              <TouchableOpacity
                key={pri}
                style={[
                  styles.filterPill, 
                  isDark && { backgroundColor: '#1E293B' },
                  isActive && (isDark ? { backgroundColor: '#38BDF8' } : styles.filterPillActive)
                ]}
                onPress={() => setSelectedPriority(pri)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.filterText, 
                  isDark && { color: '#94A3B8' },
                  isActive && (isDark ? { color: '#0F172A', fontWeight: '800' } : styles.filterTextActive)
                ]}>
                  {pri.charAt(0) + pri.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Announcements List */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredAnnouncements.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={48} color={isDark ? '#64748B' : '#94A3B8'} />
              <Text style={[styles.emptyTitle, isDark && { color: '#F8FAFC' }]}>No Announcements Found</Text>
              <Text style={[styles.emptyDesc, isDark && { color: '#94A3B8' }]}>No active company notices match your search or filter.</Text>
            </View>
          ) : (
            filteredAnnouncements.map((item) => {
              const priUpper = (item.priority || '').toUpperCase();
              const isUrgent = priUpper.includes('URGENT') || priUpper.includes('HIGH');
              const isPolicy = priUpper.includes('POLICY');

              return (
                <View key={item.id} style={[styles.card, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                  {/* Card Header Row */}
                  <View style={styles.cardHeader}>
                    <View style={[
                      styles.priorityBadge,
                      isUrgent 
                        ? (isDark ? { backgroundColor: '#4C0519' } : styles.badgeHigh) 
                        : isPolicy 
                        ? (isDark ? { backgroundColor: '#1E1B4B' } : styles.badgePolicy) 
                        : (isDark ? { backgroundColor: '#451A03' } : styles.badgeMedium)
                    ]}>
                      <Ionicons
                        name={isUrgent ? "alert-circle" : isPolicy ? "shield-checkmark" : "information-circle"}
                        size={12}
                        color={isUrgent ? (isDark ? "#FB7185" : "#E11D48") : isPolicy ? (isDark ? "#818CF8" : "#4F46E5") : (isDark ? "#FBBF24" : "#D97706")}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[
                        styles.priorityText,
                        isUrgent ? (isDark ? { color: '#FB7185' } : styles.textHigh) : isPolicy ? (isDark ? { color: '#818CF8' } : styles.textPolicy) : (isDark ? { color: '#FBBF24' } : styles.textMedium)
                      ]}>
                        {(item.priority || 'GENERAL').toUpperCase()}
                      </Text>
                    </View>

                    <Text style={[styles.dateText, isDark && { color: '#64748B' }]}>{item.datePosted}</Text>
                  </View>

                  {/* Title & Body */}
                  <Text style={[styles.cardTitle, isDark && { color: '#F8FAFC' }]}>{item.title}</Text>
                  <Text style={[styles.cardDesc, isDark && { color: '#94A3B8' }]}>{item.description}</Text>

                  {/* Footer Author */}
                  {item.author && (
                    <View style={[styles.authorRow, isDark && { borderTopColor: '#334155' }]}>
                      <Ionicons name="person-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
                      <Text style={[styles.authorText, isDark && { color: '#94A3B8' }]}>Posted by {item.author}</Text>
                    </View>
                  )}
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
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#0F172A',
  },
  filterText: {
    fontSize: 12,
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeHigh: {
    backgroundColor: '#FFE4E6',
  },
  badgePolicy: {
    backgroundColor: '#EEF2FF',
  },
  badgeMedium: {
    backgroundColor: '#FEF3C7',
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  textHigh: {
    color: '#E11D48',
  },
  textPolicy: {
    color: '#4F46E5',
  },
  textMedium: {
    color: '#D97706',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
  },
  cardDesc: {
    fontSize: 13.5,
    color: '#475569',
    marginTop: 8,
    lineHeight: 20,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  authorText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
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
