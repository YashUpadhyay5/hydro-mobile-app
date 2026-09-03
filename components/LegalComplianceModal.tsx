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
  Platform,
} from 'react-native';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/services/api';

interface LegalComplianceModalProps {
  visible: boolean;
  user: any;
  onAccept: () => void;
}

export function LegalComplianceModal({
  visible,
  user,
  onAccept,
}: LegalComplianceModalProps) {
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedLocation, setAgreedLocation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!visible || !user) return null;

  const handleAcceptSubmit = async () => {
    if (!agreedTerms || !agreedLocation) {
      Alert.alert('Required Confirmation', 'Please check both agreement boxes to accept the legal compliance terms.');
      return;
    }

    setIsSubmitting(true);
    try {
      let deviceInfo = 'Mobile App';
      try {
        const mfg = Device?.manufacturer || 'Android';
        const model = Device?.modelName || 'Device';
        const os = Device?.osVersion || '';
        deviceInfo = `${mfg} ${model} (OS ${os})`.trim();
      } catch (dErr) {
        deviceInfo = 'Android Device';
      }

      const payload = {
        userId: user.id || user._id,
        employeeName: user.name || 'Employee',
        employeeEmail: user.email || '',
        deviceInfo,
        termsVersion: 'v1.0'
      };

      try {
        await api.post('/acknowledgments', payload);
        console.log('[LegalComplianceModal] Acknowledgment synced to server successfully.');
      } catch (netErr: any) {
        console.warn('[LegalComplianceModal] Backend sync failed, saving locally:', netErr.message);
      }

      // Save local acceptance indicator
      const storageKey = `@has_accepted_legal_terms_${user.id || user._id}`;
      await AsyncStorage.setItem(storageKey, JSON.stringify({
        accepted: true,
        acceptedAt: new Date().toISOString(),
        version: 'v1.0'
      }));

      onAccept();
    } catch (err: any) {
      console.error('[LegalComplianceModal] Error during acceptance:', err);
      Alert.alert('Submission Error', 'Failed to process agreement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isButtonEnabled = agreedTerms && agreedLocation && !isSubmitting;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconBadge}>
              <Text style={styles.iconText}>⚖️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Legal & Compliance Agreement</Text>
              <Text style={styles.headerSubtitle}>Privacy Terms, Conditions & Location Consent (v1.0)</Text>
            </View>
          </View>

          {/* Document Content Scroll */}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            
            {/* Section 1: Privacy Policy */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>1. Data Protection & Privacy Policy</Text>
              <Text style={styles.bodyText}>
                Hydro HRMS values your privacy and data security. All employee profile details, attendance timestamps, and location logs collected by this mobile application are strictly encrypted and transmitted over secure channels. Data is utilized exclusively for internal organization management, payroll processing, shift validation, and employee safety compliance. Your personal information will never be shared with or sold to third-party commercial entities.
              </Text>
            </View>

            {/* Section 2: Terms & Conditions */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>2. Terms of Service & Conduct</Text>
              <Text style={styles.bodyText}>
                By using this application, you agree to submit accurate attendance check-in and check-out records. Attempting to use mock location tools, GPS spoofing software, or unauthorized device alterations to manipulate shift records constitutes a violation of company policy and may lead to disciplinary proceedings under organization regulations.
              </Text>
            </View>

            {/* Section 3: Location Tracking Disclosure */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>3. Location & Background Tracking Consent</Text>
              <Text style={styles.bodyText}>
                This application requires location access (including background location access while checked in) to verify office geofence boundaries, track field duty travel, and ensure operational safety. Location telemetry is captured solely during active shift hours while you are Clocked In. Tracking automatically halts upon Clock Out.
              </Text>
            </View>

            {/* Audit Notice */}
            <View style={styles.auditNotice}>
              <Text style={styles.auditNoticeText}>
                🔒 <Text style={{ fontWeight: 'bold' }}>Legal Audit Notice:</Text> Your signed acceptance timestamp, IP address, and device model will be recorded in the organization&apos;s compliance database accessible to HR Administrators.
              </Text>
            </View>

          </ScrollView>

          {/* Checkboxes */}
          <View style={styles.checkboxContainer}>
            <TouchableOpacity 
              style={styles.checkboxRow}
              activeOpacity={0.8}
              onPress={() => setAgreedTerms(!agreedTerms)}
            >
              <View style={[styles.checkbox, agreedTerms && styles.checkboxSelected]}>
                {agreedTerms && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                I have read, understood, and agree to the <Text style={styles.boldText}>Privacy Policy & Terms of Service</Text>.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.checkboxRow}
              activeOpacity={0.8}
              onPress={() => setAgreedLocation(!agreedLocation)}
            >
              <View style={[styles.checkbox, agreedLocation && styles.checkboxSelected]}>
                {agreedLocation && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                I explicitly consent to <Text style={styles.boldText}>Location & Background Shift Telemetry Tracking</Text>.
              </Text>
            </TouchableOpacity>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, !isButtonEnabled && styles.submitButtonDisabled]}
            disabled={!isButtonEnabled}
            onPress={handleAcceptSubmit}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>I Accept & Submit Legal Acknowledgment</Text>
            )}
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '94%',
    padding: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  iconText: {
    fontSize: 22,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  scroll: {
    maxHeight: 320,
    marginBottom: 16,
  },
  scrollContent: {
    paddingRight: 4,
  },
  sectionCard: {
    backgroundColor: '#27272A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  sectionTitle: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  bodyText: {
    color: '#D4D4D8',
    fontSize: 12,
    lineHeight: 18,
  },
  auditNotice: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  auditNoticeText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
  },
  checkboxContainer: {
    marginBottom: 20,
    gap: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(39, 39, 42, 0.5)',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F46',
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
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 17,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#60A5FA',
  },
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#3F3F46',
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
