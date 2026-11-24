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
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

// Support contacts come from the build environment (EXPO_PUBLIC_*, see .env.example); a missing one hides its button.
const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE?.trim() || '';
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || '';

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


const CATEGORIES = [
  'Attendance & Shift',
  'Location & Telemetry',
  'Leave & Payroll',
  'Expense Reimbursement',
  'Technical Glitch',
  'Other'
];

export default function HelpSupportScreen() {
  const { t } = useTranslationSafe(['settings', 'common']);
  const faqItems = [
    {
      q: t('settings:faq_checkin_q', { defaultValue: 'How does shift check-in and clock-out work?' }),
      a: t('settings:faq_checkin_a', { defaultValue: 'Tap the "Clock In Now" button on your Home screen. The app verifies your location against office geofences or records your field shift. When your duty ends, tap "Clock Out Shift" to finalize your shift hours.' }),
    },
    {
      q: t('settings:faq_location_q', { defaultValue: 'Why does the app require "Allow all the time" location access?' }),
      a: t('settings:faq_location_a', { defaultValue: 'Enterprise HRMS verifies your presence inside office geofence boundaries and logs travel routes for field personnel while working. Telemetry is ONLY recorded during active shift hours while you are Clocked In. Tracking immediately halts when you Clock Out.' }),
    },
    {
      q: t('settings:faq_battery_q', { defaultValue: 'Why is Battery Saver Optimization exemption needed?' }),
      a: t('settings:faq_battery_a', { defaultValue: 'Modern Android operating systems aggressively kill background applications to save power. Excluding HRMS from battery optimization prevents the OS from stopping your active shift tracking midway.' }),
    },
    {
      q: t('settings:faq_gps_q', { defaultValue: 'What should I do if my location shows "GPS Disabled"?' }),
      a: t('settings:faq_gps_a', { defaultValue: "Ensure your phone's Location/GPS switch is turned ON with \"High Accuracy\" enabled in Android settings. You can run the Permission Setup Wizard from App Settings to verify." }),
    },
    {
      q: t('settings:faq_leave_q', { defaultValue: 'How do I apply for annual leave or check holidays?' }),
      a: t('settings:faq_leave_a', { defaultValue: 'Navigate to the "Leaves" tab to submit leave requests, view remaining balances, or tap "View Calendar" on the Home dashboard to see your location-specific holiday schedule.' }),
    },
    {
      q: t('settings:faq_regularize_q', { defaultValue: 'Who can I contact if my attendance record needs regularization?' }),
      a: t('settings:faq_regularize_a', { defaultValue: 'You can submit a ticket under the "Attendance & Shift" category on this Help Desk page or message your HR Administrator directly via the Chat tab.' }),
    },
  ];

  // The English values are what the server stores; only the labels shown on screen are translated.
  const categoryLabels: Record<string, string> = {
    'Attendance & Shift': t('settings:cat_attendance_shift', { defaultValue: 'Attendance & Shift' }),
    'Location & Telemetry': t('settings:cat_location_telemetry', { defaultValue: 'Location & Telemetry' }),
    'Leave & Payroll': t('settings:cat_leave_payroll', { defaultValue: 'Leave & Payroll' }),
    'Expense Reimbursement': t('settings:cat_expense_reimbursement', { defaultValue: 'Expense Reimbursement' }),
    'Technical Glitch': t('settings:cat_technical_glitch', { defaultValue: 'Technical Glitch' }),
    'Other': t('settings:cat_other', { defaultValue: 'Other' }),
  };
  const priorityLabels: Record<string, string> = {
    Normal: t('settings:priority_normal', { defaultValue: 'Normal' }),
    High: t('settings:priority_high', { defaultValue: 'High' }),
    Urgent: t('settings:priority_urgent', { defaultValue: 'Urgent' }),
  };
  const ticketStatusLabels: Record<string, string> = {
    OPEN: t('settings:ticket_open', { defaultValue: 'OPEN' }),
    RESOLVED: t('settings:ticket_resolved', { defaultValue: 'RESOLVED' }),
    PENDING: t('settings:ticket_pending', { defaultValue: 'PENDING' }),
  };

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
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const [networkType, setNetworkType] = useState('Connected');

  useEffect(() => {
    Network.getNetworkStateAsync().then(state => {
      setNetworkType(state.isConnected ? 'Internet Online (Active)' : 'Offline');
    }).catch(() => {});

    // Fetch tickets from backend
    if (user?.id) {
      api.get('/support/tickets', { params: { employeeId: user.id } })
        .then(res => {
          if (Array.isArray(res.data)) {
            setTickets(res.data);
          }
        })
        .catch(err => {
          console.warn('[HelpDesk] Tickets fetch notice:', err.message);
        });
    }
  }, [user]);

  const handleCallHR = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {
      Alert.alert(t('settings:helpline', { defaultValue: 'Helpline' }), `${t('settings:hr_support_helpline', { defaultValue: 'HR Support Helpline' })}: ${SUPPORT_PHONE}`);
    });
  };

  const handleEmailHR = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=HRMS%20Support%20Inquiry`).catch(() => {
      Alert.alert(t('settings:email_support', { defaultValue: 'Email Support' }), `${t('settings:hr_support_email', { defaultValue: 'HR Support Email' })}: ${SUPPORT_EMAIL}`);
    });
  };

  const handleChatHR = () => {
    router.push('/(tabs)/explore' as any);
  };

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert(t('settings:required_fields', { defaultValue: 'Required Fields' }), t('settings:please_provide_both_a_subject_and', { defaultValue: 'Please provide both a subject and a description for your support ticket.' }));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('settings:not_signed_in', { defaultValue: 'Not Signed In' }), t('settings:please_sign_in_again_before_raising', { defaultValue: 'Please sign in again before raising a support ticket.' }));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        employeeId: user.id,
        employeeName: user.name,
        employeeEmail: user.email,
        category,
        priority,
        subject: subject.trim(),
        message: message.trim()
      };

      const res = await api.post('/support/tickets', payload);

      // Only a ticket the server actually returned is shown; nothing is made up locally.
      const createdTicket: SupportTicket | undefined = res.data?.ticket;
      if (createdTicket) {
        setTickets([createdTicket, ...tickets]);
      }
      setSubject('');
      setMessage('');
      setActiveTab('TICKETS');

      Alert.alert(
        t('settings:ticket_submitted', { defaultValue: 'Ticket Submitted' }),
        createdTicket
          ? t('settings:ticket_logged_with_id', { defaultValue: 'Your support request (#{{id}}) has been logged. Our operations team will review it shortly.', id: createdTicket.id })
          : t('settings:ticket_logged', { defaultValue: 'Your support request has been logged. Our operations team will review it shortly.' })
      );
    } catch (err: any) {
      // The form is left as typed so the employee can retry.
      console.warn('[HelpDesk] Ticket submit failed:', err.message);
      Alert.alert(
        t('settings:could_not_submit_ticket', { defaultValue: 'Could Not Submit Ticket' }),
        err.response?.data?.error || t('settings:ticket_not_sent', { defaultValue: 'Your ticket was not sent. Check your connection and try again.' })
      );
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
        <Text style={[styles.navTitle, isDark && styles.textWhite]}>{t('settings:help_desk_and_support', { defaultValue: 'Help Desk & Support' })}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Contact Action Bar */}
        <View style={styles.quickContactRow}>
          {!!SUPPORT_PHONE && (
            <TouchableOpacity style={styles.contactCard} onPress={handleCallHR} activeOpacity={0.8}>
              <View style={[styles.contactIconCircle, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="call" size={20} color="#2563EB" />
              </View>
              <Text style={styles.contactTitle}>{t('settings:call_hr', { defaultValue: 'Call HR' })}</Text>
              <Text style={styles.contactSub}>{t('settings:helpline', { defaultValue: 'Helpline' })}</Text>
            </TouchableOpacity>
          )}

          {!!SUPPORT_EMAIL && (
            <TouchableOpacity style={styles.contactCard} onPress={handleEmailHR} activeOpacity={0.8}>
              <View style={[styles.contactIconCircle, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="mail" size={20} color="#16A34A" />
              </View>
              <Text style={styles.contactTitle}>{t('settings:email_hr', { defaultValue: 'Email HR' })}</Text>
              <Text style={styles.contactSub}>{t('settings:support_desk', { defaultValue: 'Support Desk' })}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.contactCard} onPress={handleChatHR} activeOpacity={0.8}>
            <View style={[styles.contactIconCircle, { backgroundColor: '#FAF5FF' }]}>
              <Ionicons name="chatbubbles" size={20} color="#9333EA" />
            </View>
            <Text style={styles.contactTitle}>{t('settings:live_chat', { defaultValue: 'Live Chat' })}</Text>
            <Text style={styles.contactSub}>{t('settings:hr_admin', { defaultValue: 'HR Admin' })}</Text>
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
              {t('settings:raise_ticket', { defaultValue: 'Raise Ticket' })}
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
              {t('settings:faqs', { defaultValue: 'FAQs' })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB CONTENT: 1. Raise New Ticket */}
        {activeTab === 'NEW_TICKET' && (
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Text style={[styles.formHeading, isDark && styles.textWhite]}>{t('settings:submit_support_ticket', { defaultValue: 'Submit Support Ticket' })}</Text>
            <Text style={styles.formSub}>{t('settings:our_operations_team_typically_responds_wit', { defaultValue: 'Our operations team typically responds within 2-4 business hours.' })}</Text>

            {/* Category Selector */}
            <Text style={styles.inputLabel}>{t('settings:issue_category', { defaultValue: 'Issue Category' })}</Text>
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
                      {categoryLabels[cat] ?? cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Priority Selector */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>{t('settings:priority_level', { defaultValue: 'Priority Level' })}</Text>
            <View style={styles.priorityRow}>
              {(['Normal', 'High', 'Urgent'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityBtn, priority === p && styles.priorityBtnActive]}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>
                    {priorityLabels[p] ?? p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Subject Input */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>{t('settings:ticket_subject', { defaultValue: 'Ticket Subject' })}</Text>
            <TextInput
              style={[styles.textInput, isDark && styles.textInputDark]}
              placeholder={t('settings:e_g_geofence_clock_in_inquiry', { defaultValue: 'e.g. Geofence clock-in inquiry' })}
              placeholderTextColor="#94A3B8"
              value={subject}
              onChangeText={setSubject}
            />

            {/* Detailed Description */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>{t('settings:detailed_description', { defaultValue: 'Detailed Description' })}</Text>
            <TextInput
              style={[styles.textArea, isDark && styles.textInputDark]}
              placeholder={t('settings:please_describe_your_issue_shift_date', { defaultValue: 'Please describe your issue, shift date, and relevant details...' })}
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
                  <Text style={styles.submitTicketBtnText}>{t('settings:submit_support_request', { defaultValue: 'Submit Support Request' })}</Text>
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
                <Text style={[styles.emptyTitle, isDark && styles.textWhite]}>{t('settings:no_support_tickets', { defaultValue: 'No Support Tickets' })}</Text>
                <Text style={styles.emptySub}>{t('settings:you_have_not_submitted_any_support', { defaultValue: 'You have not submitted any support tickets yet.' })}</Text>
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
                          {ticketStatusLabels[String(ticket.status).toUpperCase()] ?? ticket.status}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.ticketSubject, isDark && styles.textWhite]}>{ticket.subject}</Text>
                    <Text style={styles.ticketMsg}>{ticket.message}</Text>

                    {ticket.resolution && (
                      <View style={styles.resolutionBox}>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={styles.resolutionText}>
                          <Text style={{ fontWeight: 'bold' }}>{t('settings:resolution', { defaultValue: 'Resolution:' })}</Text> {ticket.resolution}
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
            {faqItems.map((faq, idx) => {
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
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 24 }]}>{t('settings:system_diagnostics', { defaultValue: 'System Diagnostics' })}</Text>
        
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>{t('settings:device_model', { defaultValue: 'Device Model' })}</Text>
            <Text style={[styles.diagVal, isDark && styles.textWhite]}>
              {Device.manufacturer || 'Android'} {Device.modelName || 'Device'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>{t('settings:operating_system', { defaultValue: 'Operating System' })}</Text>
            <Text style={[styles.diagVal, isDark && styles.textWhite]}>
              {Platform.OS === 'android' ? `Android OS ${Device.osVersion || '14'}` : 'iOS'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>{t('settings:network_status', { defaultValue: 'Network Status' })}</Text>
            <Text style={[styles.diagVal, { color: '#10B981' }]}>{networkType === 'Connected' ? t('settings:network_connected', { defaultValue: 'Connected' }) : networkType === 'Offline' ? t('settings:network_offline', { defaultValue: 'Offline' }) : t('settings:network_online', { defaultValue: 'Internet Online (Active)' })}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>{t('settings:app_build', { defaultValue: 'App Build' })}</Text>
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
