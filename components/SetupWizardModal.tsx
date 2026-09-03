import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { 
  DeviceHealthReport, 
  computeReliabilityScore,
  requestAllTimeLocationPermission,
  requestBatteryOptimizationExemption,
  requestCameraPermission,
  requestNotificationPermission
} from '@/services/DeviceHealthService';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

interface SetupWizardModalProps {
  visible: boolean;
  healthReport: DeviceHealthReport | null;
  onClose: () => void;
  onRefresh: () => Promise<boolean | void>;
  onContinueAnyway?: () => void;
}

export function SetupWizardModal({
  visible,
  healthReport,
  onClose,
  onRefresh,
  onContinueAnyway,
}: SetupWizardModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslationSafe(['settings', 'common', 'permissions']);
  const [autoStartMarkedDone, setAutoStartMarkedDone] = useState(false);

  if (!visible || !healthReport) return null;

  const isHighRisk = healthReport.riskLevel === 'High';
  const mfg = healthReport.manufacturer.toLowerCase();

  // Determine if Auto-Start is applicable for this device
  const isAutoStartApplicable = isHighRisk && (
    mfg.includes('transsion') || 
    mfg.includes('infinix') || 
    mfg.includes('tecno') || 
    mfg.includes('itel') ||
    mfg.includes('xiaomi') ||
    mfg.includes('redmi') ||
    mfg.includes('poco') ||
    mfg.includes('oppo') ||
    mfg.includes('realme') ||
    mfg.includes('vivo') ||
    mfg.includes('huawei')
  );

  const { score, level, color } = computeReliabilityScore(healthReport, autoStartMarkedDone);

  const steps = [
    {
      id: 'gps',
      icon: 'navigate-circle-outline',
      title: t('settings:step_gps_title', { defaultValue: '1. Location Services (GPS)' }),
      description: t('settings:step_gps_desc', { defaultValue: "Please turn ON high-accuracy GPS so geofenced shift validation functions accurately." }),
      isResolved: healthReport.isGpsEnabled,
      actionText: t('settings:step_gps_btn', { defaultValue: 'Turn ON GPS Services' }),
      onAction: () => {
        if (Platform.OS === 'android') {
          Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
            Linking.openSettings();
          });
        } else {
          Linking.openSettings();
        }
      }
    },
    {
      id: 'foreground',
      icon: 'location-outline',
      title: t('settings:step_loc_title', { defaultValue: '2. Always-Allow Location Access' }),
      description: t('settings:step_loc_desc', { defaultValue: 'Select "Allow all the time" in permission settings so we can log duty route & verify shift attendance in the background.' }),
      isResolved: healthReport.isForegroundGranted && healthReport.isBackgroundGranted,
      actionText: t('settings:step_loc_btn', { defaultValue: 'Set to "Allow All The Time"' }),
      onAction: async () => {
        await requestAllTimeLocationPermission();
        setTimeout(onRefresh, 1500);
      }
    },
    {
      id: 'battery',
      icon: 'battery-charging-outline',
      title: t('settings:step_battery_title', { defaultValue: '3. Battery Optimization Exemption' }),
      description: t('settings:step_battery_desc', { defaultValue: 'Exclude HRMS from system battery saving so background telemetry is not killed by the OS.' }),
      isResolved: !healthReport.isBatteryOptimized,
      actionText: t('settings:step_battery_btn', { defaultValue: 'Disable Battery Optimization' }),
      onAction: async () => {
        requestBatteryOptimizationExemption();
        setTimeout(onRefresh, 2000);
      }
    },
    {
      id: 'camera',
      icon: 'camera-outline',
      title: t('settings:step_camera_title', { defaultValue: '4. Camera Access' }),
      description: t('settings:step_camera_desc', { defaultValue: 'Required for geotagged attendance selfies, document vault scans, and expense receipt capture.' }),
      isResolved: healthReport.isCameraGranted,
      actionText: t('settings:step_camera_btn', { defaultValue: 'Allow Camera Access' }),
      onAction: async () => {
        await requestCameraPermission();
        setTimeout(onRefresh, 1500);
      }
    },
    {
      id: 'notifications',
      icon: 'notifications-outline',
      title: t('settings:step_notif_title', { defaultValue: '5. App Notifications' }),
      description: t('settings:step_notif_desc', { defaultValue: 'Required to display real-time shift duty status in your notification bar and urgent company alerts.' }),
      isResolved: healthReport.isNotificationGranted,
      actionText: t('settings:step_notif_btn', { defaultValue: 'Enable Notification Access' }),
      onAction: async () => {
        await requestNotificationPermission();
        setTimeout(onRefresh, 1500);
      }
    },
    {
      id: 'autostart',
      icon: 'flash-outline',
      title: t('settings:step_autostart_title', { defaultValue: '6. Enable Auto-Start' }),
      description: t('settings:step_autostart_desc', { defaultValue: `Your ${healthReport.manufacturer} phone requires Auto-Start permission to prevent background logs from freezing.` }),
      isResolved: autoStartMarkedDone,
      actionText: t('settings:step_autostart_btn', { defaultValue: 'Open Auto-Start Settings' }),
      onAction: async () => {
        Linking.openSettings();
      },
      isManualCheck: true,
      onMarkDone: () => {
        setAutoStartMarkedDone(true);
        setTimeout(onRefresh, 500);
      },
      showOnlyIf: isAutoStartApplicable
    }
  ];

  const activeSteps = steps.filter(step => step.showOnlyIf === undefined || step.showOnlyIf === true);
  const currentUnresolvedIdx = activeSteps.findIndex(s => !s.isResolved);
  const isEverythingResolved = currentUnresolvedIdx === -1;

  const handleContinueAnyway = () => {
    Alert.alert(
      `⚠️ ${t('common:warning', { defaultValue: 'Warning' })}`,
      t('settings:warn_continue_anyway', { defaultValue: 'Background tracking may stop or encounter issues on this device. Attendance logs and geofencing calculations could be affected without all permissions.' }),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { 
          text: t('settings:continue_anyway', { defaultValue: 'Continue Anyway' }), 
          style: 'destructive', 
          onPress: () => {
            if (onContinueAnyway) {
              onContinueAnyway();
            } else {
              onClose();
            }
          }
        }
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{t('settings:wizard_title', { defaultValue: 'Permission Setup Wizard' })}</Text>
              <Text style={styles.headerSubtitle}>
                {t('settings:wizard_subtitle', { defaultValue: `Configuring your ${healthReport.manufacturer} ${healthReport.model} device.` })}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close-circle-outline" size={26} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Reliability Score Panel */}
          <View style={styles.scorePanel}>
            <View style={styles.scoreTextCol}>
              <Text style={styles.scoreLabel}>{t('settings:tracking_reliability', { defaultValue: 'Tracking & System Reliability' })}</Text>
              <Text style={[styles.scoreLevel, { color }]}>{level}</Text>
              <Text style={styles.scoreHint}>
                {isEverythingResolved ? 'All permissions configured for seamless shifts!' : 'Complete the steps below for 100% reliability.'}
              </Text>
            </View>
            <View style={[styles.scoreBadge, { backgroundColor: color }]}>
              <Text style={styles.scoreValue}>{score}%</Text>
            </View>
          </View>

          {/* Steps List */}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {activeSteps.map((step, idx) => {
              const isCurrent = idx === currentUnresolvedIdx;
              const isCompleted = step.isResolved;
              
              return (
                <View 
                  key={step.id} 
                  style={[
                    styles.stepCard, 
                    isCompleted && styles.stepCardCompleted,
                    isCurrent && styles.stepCardCurrent
                  ]}
                >
                  <View style={styles.stepHeader}>
                    <View style={styles.stepTitleRow}>
                      <Ionicons 
                        name={step.icon as any} 
                        size={20} 
                        color={isCompleted ? '#10B981' : isCurrent ? '#3B82F6' : '#94A3B8'} 
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.stepTitle, isCompleted && styles.stepTitleCompleted]}>
                        {step.title}
                      </Text>
                    </View>
                    <Text style={[
                      styles.statusBadge, 
                      isCompleted ? styles.statusBadgeCompleted : styles.statusBadgePending
                    ]}>
                      {isCompleted ? `✓ Completed` : `⚠️ Required`}
                    </Text>
                  </View>
                  
                  <Text style={styles.stepDesc}>{step.description}</Text>
                  
                  {!isCompleted && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.actionButton} onPress={step.onAction} activeOpacity={0.8}>
                        <Text style={styles.actionButtonText}>{step.actionText}</Text>
                      </TouchableOpacity>
                      
                      {step.isManualCheck && (
                        <TouchableOpacity style={styles.markDoneButton} onPress={step.onMarkDone} activeOpacity={0.8}>
                          <Text style={styles.markDoneButtonText}>{t('settings:turned_on', { defaultValue: 'I turned it ON' })}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Footer Navigation with Safe Area Adjustment */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.8}>
              <Text style={styles.refreshButtonText}>🔄 {t('settings:verify_again', { defaultValue: 'Verify All Permissions' })}</Text>
            </TouchableOpacity>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.skipButton} onPress={handleContinueAnyway} activeOpacity={0.8}>
                <Text style={styles.skipButtonText}>{t('settings:continue_anyway', { defaultValue: 'Skip / Later' })}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.doneButton, !isEverythingResolved && styles.doneButtonDisabled]} 
                disabled={!isEverythingResolved}
                onPress={onClose}
                activeOpacity={0.85}
              >
                <Text style={styles.doneButtonText}>{t('settings:finish_setup', { defaultValue: 'Complete Setup' })}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '92%',
    padding: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
  },
  scorePanel: {
    backgroundColor: '#27272A',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  scoreTextCol: {
    flex: 1,
    paddingRight: 10,
  },
  scoreLabel: {
    color: '#E4E4E7',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  scoreLevel: {
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  scoreHint: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  scoreBadge: {
    borderRadius: 50,
    width: 62,
    height: 62,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  scoreValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  scroll: {
    maxHeight: 340,
    marginBottom: 14,
  },
  scrollContent: {
    paddingBottom: 10,
  },
  stepCard: {
    backgroundColor: '#27272A',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3F3F46',
    opacity: 0.75,
  },
  stepCardCompleted: {
    borderColor: '#10B981',
    backgroundColor: '#0F231C',
    opacity: 0.95,
  },
  stepCardCurrent: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E293B',
    opacity: 1,
    borderWidth: 2,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  stepTitleCompleted: {
    color: '#A1A1AA',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    textTransform: 'uppercase',
  },
  statusBadgeCompleted: {
    backgroundColor: '#064E3B',
    color: '#34D399',
  },
  statusBadgePending: {
    backgroundColor: '#3F3F46',
    color: '#FBBF24',
  },
  stepDesc: {
    color: '#D4D4D8',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    elevation: 2,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  markDoneButton: {
    backgroundColor: '#4B5563',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  markDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 12,
  },
  refreshButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  refreshButtonText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skipButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: 'bold',
  },
  doneButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  doneButtonDisabled: {
    backgroundColor: '#27272A',
    elevation: 0,
    opacity: 0.5,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
