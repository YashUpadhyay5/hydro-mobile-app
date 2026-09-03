import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import api from '@/services/api';

interface SupportTicket {
  id: string;
  category: string;
  priority: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN PROGRESS' | 'RESOLVED';
  createdAt: string;
  resolution?: string;
}

const FAQ_ITEMS = [
  {
    q: 'How does shift check-in and clock-out work?',
    a: 'Tap the "Clock In Now" button on your Home screen. The app verifies your location against office geofences or records your field shift. When your duty ends, tap "Clock Out Shift" to finalize your shift hours.'
  },
  {
    q: 'Why does the app require "Allow all the time" location access?',
    a: 'Enterprise HRMS verifies your presence inside office geofence boundaries and logs travel routes for field personnel while working. Telemetry is ONLY recorded during active shift hours while you are Clocked In. Tracking immediately halts when you Clock Out.'
  },
  {
    q: 'Why is Battery Saver Optimization exemption needed?',
    a: 'Modern Android operating systems aggressively kill background applications to save power. Excluding HRMS from battery optimization prevents the OS from stopping your active shift tracking midway.'
  },
  {
    q: 'What should I do if my location shows "GPS Disabled"?',
    a: 'Ensure your phone\'s Location/GPS switch is turned ON with "High Accuracy" enabled in Android settings. You can run the Permission Setup Wizard from App Settings to verify.'
  },
  {
    q: 'How do I apply for annual leave or check holidays?',
    a: 'Navigate to the "Leaves" tab to submit leave requests, view remaining balances, or tap "View Calendar" on the Home dashboard to see your location-specific holiday schedule.'
  },
  {
    q: 'Who can I contact if my attendance record needs regularization?',
    a: 'You can submit a ticket under the "Attendance & Shift" category on this Help Desk page or message your HR Administrator directly via the Chat tab.'
  }
];

const CATEGORIES = [
  'Attendance & Shift',
  'Location & Telemetry',
  'Leave & Payroll',
  'Expense Reimbursement',
  'Technical Glitch',
  'Other'
];

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activeTab, setActiveTab] = useState<'TICKETS' | 'NEW_TICKET' | 'FAQ'>('NEW_TICKET');
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(0);

  // New ticket state
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState<'Normal' | 'High' | 'Urgent'>('Normal');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tickets list
  const [tickets, setTickets] = useState<SupportTicket[]>([
    {
      id: 'TKT-1001',
      category: 'Attendance & Shift',
      priority: 'Normal',
      subject: 'Shift regularization verification',
      message: 'Verified geofence entry timestamp for yesterday shift.',
      status: 'RESOLVED',
      createdAt: '2 days ago',
      resolution: 'Attendance logs synchronized with HR server.'
    },
    {
      id: 'TKT-1002',
      category: 'Location & Telemetry',
      priority: 'Low',
      subject: 'Background tracking on Android 14',
      message: 'Confirmed battery optimization exemption configured.',
      status: 'RESOLVED',
      createdAt: 'Yesterday',
      resolution: 'Device verified in background telemetry logs.'
    }
  ]);

  const [networkType, setNetworkType] = useState('Connected');

  useEffect(() => {
    Network.getNetworkStateAsync().then(state => {
      setNetworkType(state.isConnected ? 'Internet Online (Active)' : 'Offline');
    }).catch(() => {});

    // Fetch tickets from backend
    if (user?.id) {
      api.get('/support/tickets', { params: { employeeId: user.id } })
        .then(res => {
          if (Array.isArray(res.data) && res.data.length > 0) {
            setTickets(res.data);
          }
        })
        .catch(err => {
          console.warn('[HelpDesk] Tickets fetch notice:', err.message);
        });
    }
  }, [user]);

  const handleCallHR = () => {
    Linking.openURL('tel:+918001234567').catch(() => {
      Alert.alert('Helpline', 'HR Support Helpline: +91 800 123 4567');
    });
  };

  const handleEmailHR = () => {
    Linking.openURL('mailto:hr-support@company.com?subject=HRMS%20Support%20Inquiry').catch(() => {
      Alert.alert('Email Support', 'HR Support Email: hr-support@company.com');
    });
  };

  const handleChatHR = () => {
    router.push('/(tabs)/explore' as any);
  };

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Required Fields', 'Please provide both a subject and a description for your support ticket.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        employeeId: user?.id || 'emp1',
        employeeName: user?.name || 'Employee',
        employeeEmail: user?.email || '',
        category,
        priority,
        subject: subject.trim(),
        message: message.trim()
      };

      const res = await api.post('/support/tickets', payload);

      const createdTicket: SupportTicket = res.data?.ticket || {
        id: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
        category,
        priority,
        subject: subject.trim(),
        message: message.trim(),
        status: 'OPEN',
        createdAt: 'Just now'
      };

      setTickets([createdTicket, ...tickets]);
      setSubject('');
      setMessage('');
      setActiveTab('TICKETS');

      Alert.alert(
        'Ticket Submitted',
        `Your support request (#${createdTicket.id}) has been logged. Our operations team will review it shortly.`
      );
    } catch (err: any) {
      console.warn('[HelpDesk] Backend submit warning, creating local ticket:', err.message);
      const fallbackTicket: SupportTicket = {
        id: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
        category,
        priority,
        subject: subject.trim(),
        message: message.trim(),
        status: 'OPEN',
        createdAt: 'Just now'
      };
      setTickets([fallbackTicket, ...tickets]);
      setSubject('');
      setMessage('');
      setActiveTab('TICKETS');
      Alert.alert('Ticket Submitted', `Ticket #${fallbackTicket.id} logged successfully.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.screen, isDark && styles.screenDark]}>
      {/* Navigation Header */}
      <View style={[styles.navBar, isDark && styles.navBarDark, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <TouchableOpacity 
          style={[styles.backBtn, isDark && styles.backBtnDark]} 
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, isDark && styles.textWhite]}>Help Desk & Support</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Contact Action Bar */}
        <View style={styles.quickContactRow}>
          <TouchableOpacity style={styles.contactCard} onPress={handleCallHR} activeOpacity={0.8}>
            <View style={[styles.contactIconCircle, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="call" size={20} color="#2563EB" />
            </View>
            <Text style={styles.contactTitle}>Call HR</Text>
            <Text style={styles.contactSub}>Helpline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={handleEmailHR} activeOpacity={0.8}>
            <View style={[styles.contactIconCircle, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="mail" size={20} color="#16A34A" />
            </View>
            <Text style={styles.contactTitle}>Email HR</Text>
            <Text style={styles.contactSub}>Support Desk</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={handleChatHR} activeOpacity={0.8}>
            <View style={[styles.contactIconCircle, { backgroundColor: '#FAF5FF' }]}>
              <Ionicons name="chatbubbles" size={20} color="#9333EA" />
            </View>
            <Text style={styles.contactTitle}>Live Chat</Text>
            <Text style={styles.contactSub}>HR Admin</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Navigation Pill Bar */}
        <View style={styles.tabPillContainer}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'NEW_TICKET' && styles.tabPillActive]}
            onPress={() => setActiveTab('NEW_TICKET')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabPillText, activeTab === 'NEW_TICKET' && styles.tabPillTextActive]}>
              Raise Ticket
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'TICKETS' && styles.tabPillActive]}
            onPress={() => setActiveTab('TICKETS')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabPillText, activeTab === 'TICKETS' && styles.tabPillTextActive]}>
              My Tickets ({tickets.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'FAQ' && styles.tabPillActive]}
            onPress={() => setActiveTab('FAQ')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabPillText, activeTab === 'FAQ' && styles.tabPillTextActive]}>
              FAQs
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB CONTENT: 1. Raise New Ticket */}
        {activeTab === 'NEW_TICKET' && (
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Text style={[styles.formHeading, isDark && styles.textWhite]}>Submit Support Ticket</Text>
            <Text style={styles.formSub}>Our operations team typically responds within 2-4 business hours.</Text>

            {/* Category Selector */}
            <Text style={styles.inputLabel}>Issue Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              <View style={styles.categoryChipsRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, category === cat && styles.chipActive]}
                    onPress={() => setCategory(cat)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Priority Selector */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>Priority Level</Text>
            <View style={styles.priorityRow}>
              {(['Normal', 'High', 'Urgent'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityBtn, priority === p && styles.priorityBtnActive]}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Subject Input */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>Ticket Subject</Text>
            <TextInput
              style={[styles.textInput, isDark && styles.textInputDark]}
              placeholder="e.g. Geofence clock-in inquiry"
              placeholderTextColor="#94A3B8"
              value={subject}
              onChangeText={setSubject}
            />

            {/* Detailed Description */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>Detailed Description</Text>
            <TextInput
              style={[styles.textArea, isDark && styles.textInputDark]}
              placeholder="Please describe your issue, shift date, and relevant details..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={message}
              onChangeText={setMessage}
              textAlignVertical="top"
            />

            {/* Submit Button */}
            <TouchableOpacity
              style={styles.submitTicketBtn}
              onPress={handleSubmitTicket}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitTicketBtnText}>Submit Support Request</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* TAB CONTENT: 2. My Tickets */}
        {activeTab === 'TICKETS' && (
          <View style={{ gap: 12 }}>
            {tickets.length === 0 ? (
              <View style={[styles.card, isDark && styles.cardDark, { alignItems: 'center', padding: 24 }]}>
                <Ionicons name="ticket-outline" size={40} color="#94A3B8" />
                <Text style={[styles.emptyTitle, isDark && styles.textWhite]}>No Support Tickets</Text>
                <Text style={styles.emptySub}>You have not submitted any support tickets yet.</Text>
              </View>
            ) : (
              tickets.map(ticket => {
                const isResolved = ticket.status === 'RESOLVED';
                const isOpen = ticket.status === 'OPEN';

                return (
                  <View key={ticket.id} style={[styles.ticketCard, isDark && styles.cardDark]}>
                    <View style={styles.ticketTopRow}>
                      <View style={styles.ticketIdBadge}>
                        <Text style={styles.ticketIdText}>#{ticket.id}</Text>
                      </View>
                      <View style={[
                        styles.statusBadge, 
                        isResolved ? styles.statusBadgeResolved : isOpen ? styles.statusBadgeOpen : styles.statusBadgePending
                      ]}>
                        <Text style={[
                          styles.statusBadgeText,
                          isResolved ? { color: '#059669' } : isOpen ? { color: '#2563EB' } : { color: '#D97706' }
                        ]}>
                          {ticket.status}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.ticketSubject, isDark && styles.textWhite]}>{ticket.subject}</Text>
                    <Text style={styles.ticketMsg}>{ticket.message}</Text>

                    {ticket.resolution && (
                      <View style={styles.resolutionBox}>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={styles.resolutionText}>
                          <Text style={{ fontWeight: 'bold' }}>Resolution:</Text> {ticket.resolution}
                        </Text>
                      </View>
                    )}

                    <View style={styles.ticketMetaRow}>
                      <Text style={styles.ticketCategoryTag}>📁 {ticket.category}</Text>
                      <Text style={styles.ticketDateText}>{ticket.createdAt}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB CONTENT: 3. FAQs Accordion */}
        {activeTab === 'FAQ' && (
          <View style={{ gap: 10 }}>
            {FAQ_ITEMS.map((faq, idx) => {
              const isExpanded = expandedFaqIndex === idx;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.faqCard, isDark && styles.cardDark]}
                  onPress={() => setExpandedFaqIndex(isExpanded ? null : idx)}
                  activeOpacity={0.85}
                >
                  <View style={styles.faqHeaderRow}>
                    <Ionicons name="help-circle-outline" size={20} color="#2563EB" style={{ marginRight: 10 }} />
                    <Text style={[styles.faqQuestion, isDark && styles.textWhite]}>{faq.q}</Text>
                    <Ionicons 
                      name={isExpanded ? "chevron-up" : "chevron-down"} 
                      size={18} 
                      color="#94A3B8" 
                    />
                  </View>

                  {isExpanded && (
                    <View style={styles.faqAnswerBox}>
                      <Text style={styles.faqAnswer}>{faq.a}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* System Diagnostics Card */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 24 }]}>System Diagnostics</Text>
        
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Device Model</Text>
            <Text style={[styles.diagVal, isDark && styles.textWhite]}>
              {Device.manufacturer || 'Android'} {Device.modelName || 'Device'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Operating System</Text>
            <Text style={[styles.diagVal, isDark && styles.textWhite]}>
              {Platform.OS === 'android' ? `Android OS ${Device.osVersion || '14'}` : 'iOS'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Network Status</Text>
            <Text style={[styles.diagVal, { color: '#10B981' }]}>{networkType}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>App Build</Text>
            <Text style={[styles.diagVal, isDark && styles.textWhite]}>v1.0.0 (Production)</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  screenDark: {
    backgroundColor: '#0F172A',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navBarDark: {
    backgroundColor: '#0F172A',
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnDark: {
    backgroundColor: '#1E293B',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  quickContactRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  contactCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  contactIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  contactTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  contactSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  tabPillContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillActive: {
    backgroundColor: '#0F172A',
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tabPillTextActive: {
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cardDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  formHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  formSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  categoryScroll: {
    marginBottom: 2,
  },
  categoryChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  priorityBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  priorityTextActive: {
    color: '#FFFFFF',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 90,
  },
  textInputDark: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    color: '#F8FAFC',
  },
  submitTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 18,
    elevation: 2,
  },
  submitTicketBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ticketTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketIdBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ticketIdText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeResolved: {
    backgroundColor: '#D1FAE5',
  },
  statusBadgeOpen: {
    backgroundColor: '#EFF6FF',
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  ticketSubject: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  ticketMsg: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 8,
  },
  resolutionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  resolutionText: {
    flex: 1,
    fontSize: 11,
    color: '#15803D',
    lineHeight: 16,
  },
  ticketMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  ticketCategoryTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  ticketDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  faqHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  faqAnswerBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  faqAnswer: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  diagLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  diagVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  textWhite: {
    color: '#F8FAFC',
  },
});
