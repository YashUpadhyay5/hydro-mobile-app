import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import api from '@/services/api';

export const PRIVACY_POLICY_STORAGE_KEY = '@hrms_privacy_policy_accepted_v1';

interface PrivacyPolicyConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  user?: any;
}

export function PrivacyPolicyConsentModal({
  visible,
  onAccept,
  user,
}: PrivacyPolicyConsentModalProps) {
  const insets = useSafeAreaInsets();
  const [agreedAll, setAgreedAll] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!visible) return null;

  const handleAcceptSubmit = async () => {
    if (!agreedAll) {
      Alert.alert(
        'Required Acknowledgment',
        'Please review and check the acceptance checkbox to confirm your agreement to the Enterprise Privacy Policy and Operational Disclosures.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      let deviceInfo = 'Mobile Device';
      try {
        const mfg = Device.manufacturer || 'Android';
        const model = Device.modelName || 'Device';
        const os = Device.osVersion || 'OS';
        deviceInfo = `${mfg} ${model} (Android ${os})`.trim();
      } catch (dErr) {
        deviceInfo = 'Mobile App Device';
      }

      const consentRecord = {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        version: 'v1.0',
        deviceInfo,
        userId: user?.id || user?._id || 'pre-login-user',
        employeeEmail: user?.email || '',
      };

      // 1. Save locally in AsyncStorage immediately
      await AsyncStorage.setItem(PRIVACY_POLICY_STORAGE_KEY, JSON.stringify(consentRecord));

      // 2. Sync acknowledgment with backend
      try {
        await api.post('/acknowledgments', {
          userId: user?.id || user?._id || 'pending-auth',
          employeeName: user?.name || 'Employee',
          employeeEmail: user?.email || '',
          deviceInfo,
          termsVersion: 'v1.0',
          consentDetails: {
            privacyTermsConsent: true,
            locationTrackingConsent: true,
            backgroundTelemetryConsent: true,
            cameraAccessConsent: true,
            notificationsConsent: true,
            storageConsent: true
          }
        });
        console.log('[PrivacyPolicyConsent] Acknowledgment synced to server successfully.');
      } catch (syncErr: any) {
        console.warn('[PrivacyPolicyConsent] Local acceptance saved, backend sync deferred:', syncErr.message);
      }

      onAccept();
    } catch (err: any) {
      console.error('[PrivacyPolicyConsent Error]:', err);
      Alert.alert('Processing Error', 'Failed to save consent. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = () => {
    Alert.alert(
      'Policy Agreement Required',
      'Corporate HRMS requires acceptance of the privacy policy and operational disclosures to log attendance, process payroll, and validate duty operations. You cannot proceed without accepting.',
      [
        { text: 'Review Document', style: 'cancel' },
        { 
          text: 'Exit App', 
          style: 'destructive',
          onPress: () => {
            if (Platform.OS === 'android') {
              BackHandler.exitApp();
            }
          }
        }
      ]
    );
  };

  const isButtonEnabled = agreedAll && !isSubmitting;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top + 10, 24), paddingBottom: Math.max(insets.bottom + 12, 20) }]}>
        
        {/* Formal Document Top Bar */}
        <View style={styles.docHeader}>
          <View style={styles.sealBadge}>
            <Ionicons name="document-text" size={24} color="#38BDF8" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.badgeRow}>
              <View style={styles.complianceTag}>
                <Text style={styles.complianceTagText}>OFFICIAL ENTERPRISE POLICY</Text>
              </View>
              <Text style={styles.docVersionText}>DOC ID: HRMS-POL-V1.0</Text>
            </View>
            <Text style={styles.docMainTitle}>Privacy Policy & Operational Disclosures</Text>
            <Text style={styles.docSubtitle}>Employee Data Protection, Shift Telemetry & Statutory Compliance</Text>
          </View>
        </View>

        {/* Scrollable Formal Document Body */}
        <View style={styles.documentPaper}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
            
            {/* Preamble */}
            <View style={styles.docSection}>
              <Text style={styles.preambleText}>
                <Text style={styles.boldPreamble}>PREAMBLE: </Text>
                This Enterprise Privacy Policy and Operational Disclosure Agreement governs the secure collection, processing, and transmission of shift telemetry and duty records by the Corporate HRMS Mobile Platform. To maintain data transparency and organizational compliance, please review the operational terms outlined below.
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Article 1: Background Location Telemetry */}
            <View style={styles.docSection}>
              <Text style={styles.sectionHeading}>ARTICLE 1: OPERATIONAL LOCATION & SHIFT TELEMETRY</Text>
              <Text style={styles.paragraphText}>
                1.1 <Text style={styles.clauseBold}>Continuous Shift Validation:</Text> The application requires high-accuracy GPS and background location access (<Text style={styles.italicHighlight}>"Allow all the time"</Text>) to verify workplace geofence boundaries, record duty travel routes, and accurately calculate total working hours.
              </Text>
              <Text style={styles.paragraphText}>
                1.2 <Text style={styles.clauseBold}>Duty-Hours Restriction Guarantee:</Text> Shift telemetry and location coordinates are captured <Text style={styles.underlineHighlight}>strictly during active shift hours</Text> when you are Clocked In. Telemetry logging automatically halts immediately upon Clock Out or when on an approved leave.
              </Text>
              <Text style={styles.paragraphText}>
                1.3 <Text style={styles.clauseBold}>Anti-Tampering Protocol:</Text> The system validates coordinate integrity. Use of mock location providers, GPS spoofing utilities, or deliberate telemetry disruption is strictly logged and subject to organizational HR review.
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Article 2: Hardware Permissions & Purpose Limitation */}
            <View style={styles.docSection}>
              <Text style={styles.sectionHeading}>ARTICLE 2: HARDWARE ACCESS & PURPOSE LIMITATION</Text>
              <Text style={styles.paragraphText}>
                2.1 <Text style={styles.clauseBold}>Camera Hardware:</Text> Accessed exclusively when initiated by the employee for geotagged selfie attendance check-in, official document scanning, and expense claim receipt attachment. The camera is never accessed in the background.
              </Text>
              <Text style={styles.paragraphText}>
                2.2 <Text style={styles.clauseBold}>Local Storage & Photo Library:</Text> Storage permissions are requested solely on-demand when the user chooses to attach documents in Chat, upload certificates in the Document Vault, attach bills in Expenses, or select a profile picture.
              </Text>
              <Text style={styles.paragraphText}>
                2.3 <Text style={styles.clauseBold}>Push Notifications & Foreground Services:</Text> Utilized to provide persistent notification status of active shifts, clock-out alarms, supervisor dispatches, and emergency organization broadcasts.
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Article 3: Battery Optimization & Service Continuity */}
            <View style={styles.docSection}>
              <Text style={styles.sectionHeading}>ARTICLE 3: BATTERY OPTIMIZATION & CONTINUITY</Text>
              <Text style={styles.paragraphText}>
                3.1 <Text style={styles.clauseBold}>Background Service Integrity:</Text> Exemption from aggressive OS battery optimizations is required to prevent background services from being terminated during active duty, ensuring accurate shift hour calculation.
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Article 4: Data Security, Encryption & Privacy Guarantees */}
            <View style={styles.docSection}>
              <Text style={styles.sectionHeading}>ARTICLE 4: DATA ENCRYPTION & THIRD-PARTY PROHIBITION</Text>
              <Text style={styles.paragraphText}>
                4.1 <Text style={styles.clauseBold}>End-to-End Encryption:</Text> All telemetry, personal records, and communications are encrypted in transit via TLS 1.3 and encrypted at rest using AES-256 standards.
              </Text>
              <Text style={styles.paragraphText}>
                4.2 <Text style={styles.clauseBold}>Zero Commercial Sharing:</Text> Employee data is strictly utilized for internal attendance verification, safety compliance, and payroll computation. Personal data is never sold, leased, or disclosed to any third-party marketing entities.
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Legal Notice */}
            <View style={styles.auditBox}>
              <Text style={styles.auditText}>
                ⚖️ <Text style={{ fontWeight: 'bold', color: '#F1F5F9' }}>Statutory Audit Notice:</Text> Upon acceptance, an immutable compliance record containing your user identity, device model, IP address, and acceptance timestamp will be securely logged in the organizational compliance audit repository.
              </Text>
            </View>

          </ScrollView>
        </View>

        {/* Unified Single Checkbox Section */}
        <View style={styles.checkboxContainer}>
          <TouchableOpacity 
            style={styles.checkboxRow}
            activeOpacity={0.8}
            onPress={() => setAgreedAll(!agreedAll)}
          >
            <View style={[styles.checkbox, agreedAll && styles.checkboxSelected]}>
              {agreedAll && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
            <Text style={styles.checkboxLabel}>
              I hereby acknowledge that I have read, understood, and solemnly accept the <Text style={styles.boldLabel}>Enterprise Privacy Policy, Terms of Service, and all Operational Disclosures</Text>.
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action Button Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={handleDecline}
            activeOpacity={0.8}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.acceptButton, !isButtonEnabled && styles.acceptButtonDisabled]}
            disabled={!isButtonEnabled}
            onPress={handleAcceptSubmit}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.btnContentRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.acceptButtonText}>Accept & Continue</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    paddingHorizontal: 16,
  },
  docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  sealBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  complianceTag: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  complianceTagText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  docVersionText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  docMainTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  docSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  documentPaper: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 14,
  },
  docSection: {
    marginVertical: 4,
  },
  preambleText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'justify',
  },
  boldPreamble: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 10,
  },
  sectionHeading: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  paragraphText: {
    color: '#94A3B8',
    fontSize: 11.5,
    lineHeight: 17,
    marginBottom: 8,
    textAlign: 'justify',
  },
  clauseBold: {
    color: '#F1F5F9',
    fontWeight: '700',
  },
  italicHighlight: {
    color: '#67E8F9',
    fontStyle: 'italic',
    fontWeight: '700',
  },
  underlineHighlight: {
    color: '#34D399',
    fontWeight: '700',
  },
  auditBox: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 6,
  },
  auditText: {
    color: '#94A3B8',
    fontSize: 10.5,
    lineHeight: 15,
  },
  checkboxContainer: {
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxSelected: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  checkboxLabel: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 11.5,
    lineHeight: 16,
  },
  boldLabel: {
    fontWeight: '800',
    color: '#38BDF8',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  declineButton: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButtonText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#1E293B',
    opacity: 0.6,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});

