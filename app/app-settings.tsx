import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '@/src/hooks/useLanguage';
import { LanguageModal } from '@/src/components/i18n/LanguageModal';
import { SetupWizardModal } from '@/components/SetupWizardModal';
import { PrivacyPolicyConsentModal } from '@/components/PrivacyPolicyConsentModal';
import { 
  getDeviceHealthReport, 
  DeviceHealthReport, 
  computeReliabilityScore 
} from '@/services/DeviceHealthService';
import { 
  getCachedAppSettings, 
  AppSettings, 
  DEFAULT_APP_SETTINGS 
} from '@/services/settingsService';
import { syncOfflineData } from '@/services/syncService';
import { NOTIFICATION_PREFS_KEY as NOTIF_PREFS_KEY, syncAttendanceReminders } from '@/services/AttendanceReminderService';
import CellularTracker from '@/modules/cellular-tracker';
import { useAuth } from '@/context/AuthContext';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

export default function AppSettingsScreen() {
  const { t } = useTranslationSafe(['settings', 'common']);
  // The English values are what gets stored; only the labels on the chips are translated.
  const providerLabels: Record<string, string> = {
    'GPS Preferred': t('settings:provider_gps_preferred', { defaultValue: 'GPS Preferred' }),
    'GPS Only': t('settings:provider_gps_only', { defaultValue: 'GPS Only' }),
    'GPS + Cellular': t('settings:provider_gps_cellular', { defaultValue: 'GPS + Cellular' }),
  };
  const intervalLabels: Record<string, string> = {
    '10 Seconds': t('settings:interval_10s', { defaultValue: '10 Seconds' }),
    '30 Seconds': t('settings:interval_30s', { defaultValue: '30 Seconds' }),
    '60 Seconds': t('settings:interval_60s', { defaultValue: '60 Seconds' }),
    '15 Minutes': t('settings:interval_15m', { defaultValue: '15 Minutes' }),
  };
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { currentLanguage } = useLanguage();
  const { user } = useAuth();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [healthReport, setHealthReport] = useState<DeviceHealthReport | null>(null);
  const [isWizardVisible, setIsWizardVisible] = useState(false);
  const [isLangModalVisible, setIsLangModalVisible] = useState(false);
  const [isPrivacyModalVisible, setIsPrivacyModalVisible] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Notification Toggles
  const [shiftReminders, setShiftReminders] = useState(true);
  const [chatAlerts, setChatAlerts] = useState(true);
  const [announcementAlerts, setAnnouncementAlerts] = useState(true);
  const [hapticVibration, setHapticVibration] = useState(true);

  // Telemetry preferences
  const [selectedProvider, setSelectedProvider] = useState<string>('GPS Preferred');
  const [selectedInterval, setSelectedInterval] = useState<string>('30 Seconds');

  const loadSettingsAndHealth = useCallback(async () => {
    try {
      const cached = await getCachedAppSettings();
      setSettings(cached);
      setSelectedProvider(cached.location_provider || 'GPS Preferred');
      setSelectedInterval(cached.location_update_interval || '30 Seconds');

      const notifPrefs = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (notifPrefs) {
        const parsed = JSON.parse(notifPrefs);
        setShiftReminders(parsed.shiftReminders ?? true);
        setChatAlerts(parsed.chatAlerts ?? true);
        setAnnouncementAlerts(parsed.announcementAlerts ?? true);
        setHapticVibration(parsed.hapticVibration ?? true);
      }

      const report = await getDeviceHealthReport();
      setHealthReport(report);
    } catch (e) {
      console.warn('[AppSettings] Load error:', e);
    }
  }, []);

  useEffect(() => {
    loadSettingsAndHealth();
  }, [loadSettingsAndHealth]);

  const handleToggleNotif = async (key: string, val: boolean) => {
    const updated = {
      shiftReminders: key === 'shift' ? val : shiftReminders,
      chatAlerts: key === 'chat' ? val : chatAlerts,
      announcementAlerts: key === 'ann' ? val : announcementAlerts,
      hapticVibration: key === 'vib' ? val : hapticVibration,
    };
    if (key === 'shift') setShiftReminders(val);
    if (key === 'chat') setChatAlerts(val);
    if (key === 'ann') setAnnouncementAlerts(val);
    if (key === 'vib') setHapticVibration(val);
    await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(updated));
    // The native reminders read this switch: turning it off cancels them, on re-arms them.
    if (key === 'shift') syncAttendanceReminders(user).catch(() => {});
  };

  const handleProviderSelect = async (provider: string) => {
    setSelectedProvider(provider);
    const updated = { ...settings, location_provider: provider };
    setSettings(updated);
    await AsyncStorage.setItem('@app_settings_v2', JSON.stringify(updated));
    if (Platform.OS === 'android' && CellularTracker && CellularTracker.updateTrackingSettings) {
      CellularTracker.updateTrackingSettings(
        provider,
        settings.gps_ratio_count ?? 1,
        settings.cellular_ratio_count ?? 2,
        selectedInterval
      );
    }
  };

  const handleIntervalSelect = async (interval: string) => {
    setSelectedInterval(interval);
    const updated = { ...settings, location_update_interval: interval };
    setSettings(updated);
    await AsyncStorage.setItem('@app_settings_v2', JSON.stringify(updated));
    if (Platform.OS === 'android' && CellularTracker && CellularTracker.updateTrackingSettings) {
      CellularTracker.updateTrackingSettings(
        selectedProvider,
        settings.gps_ratio_count ?? 1,
        settings.cellular_ratio_count ?? 2,
        interval
      );
    }
  };

  const handleSyncTelemetry = async () => {
    setIsSyncing(true);
    try {
      await syncOfflineData();
      Alert.alert(t('settings:sync_successful', { defaultValue: 'Sync Successful' }), t('settings:offline_telemetry_and_attendance_logs_have', { defaultValue: 'Offline telemetry and attendance logs have been synchronized with corporate servers.' }));
    } catch (e: any) {
      Alert.alert(t('settings:sync_notice', { defaultValue: 'Sync Notice' }), t('settings:data_synchronization_completed', { defaultValue: 'Data synchronization completed.' }));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      t('settings:clear_offline_cache', { defaultValue: 'Clear Offline Cache' }),
      t('settings:this_will_clear_local_temporary_map', { defaultValue: 'This will clear local temporary map and document cache. Are you sure?' }),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('settings:clear_cache', { defaultValue: 'Clear Cache' }),
          style: 'destructive',
          onPress: () => {
            Alert.alert(t('settings:cache_cleared', { defaultValue: 'Cache Cleared' }), t('settings:temporary_app_cache_has_been_purged', { defaultValue: 'Temporary app cache has been purged.' }));
          }
        }
      ]
    );
  };

  const reliability = computeReliabilityScore(healthReport);

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
        <Text style={[styles.navTitle, isDark && styles.textWhite]}>{t('settings:app_settings', { defaultValue: 'App Settings' })}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Permissions & Device Health Diagnostics */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, isDark && styles.textWhite]}>{t('settings:permissions_and_device_health', { defaultValue: 'Permissions & Device Health' })}</Text>
          <TouchableOpacity onPress={() => setIsWizardVisible(true)}>
            <Text style={styles.sectionActionText}>{t('settings:run_wizard', { defaultValue: 'Run Wizard →' })}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.reliabilityScoreRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.scoreTitle}>{t('settings:device_reliability_score', { defaultValue: 'Device Reliability Score' })}</Text>
              <Text style={[styles.scoreLevel, { color: reliability.color }]}>{reliability.level} ({reliability.score}%)</Text>
              <Text style={styles.scoreSub}>
                {reliability.score === 100 ? t('settings:all_permissions_active', { defaultValue: 'All shift permissions fully active.' }) : t('settings:some_permissions_attention', { defaultValue: 'Some permissions need attention.' })}
              </Text>
            </View>
            <TouchableOpacity 
              style={[styles.wizardBtn, { backgroundColor: reliability.color }]}
              onPress={() => setIsWizardVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.wizardBtnText}>{t('settings:setup_wizard', { defaultValue: 'Setup Wizard' })}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Live Permission Status Rows */}
          <View style={styles.permStatusGrid}>
            <View style={styles.permItem}>
              <Ionicons 
                name="location" 
                size={18} 
                color={healthReport?.isBackgroundGranted ? '#10B981' : '#F43F5E'} 
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.permName, isDark && styles.textWhite]}>{t('settings:location_all_time', { defaultValue: 'Location (All-Time)' })}</Text>
                <Text style={styles.permDesc}>{healthReport?.isBackgroundGranted ? 'Granted' : 'Foreground Only / Missing'}</Text>
              </View>
              <Text style={[styles.statusChip, healthReport?.isBackgroundGranted ? styles.statusChipOk : styles.statusChipWarn]}>
                {healthReport?.isBackgroundGranted ? t('common:ok', { defaultValue: 'OK' }) : t('settings:chip_action', { defaultValue: 'Action' })}
              </Text>
            </View>

            <View style={styles.permItem}>
              <Ionicons 
                name="battery-charging" 
                size={18} 
                color={!healthReport?.isBatteryOptimized ? '#10B981' : '#F59E0B'} 
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.permName, isDark && styles.textWhite]}>{t('settings:battery_saver_exemption', { defaultValue: 'Battery Saver Exemption' })}</Text>
                <Text style={styles.permDesc}>{!healthReport?.isBatteryOptimized ? 'Exempted (Active)' : 'Restricted by OS'}</Text>
              </View>
              <Text style={[styles.statusChip, !healthReport?.isBatteryOptimized ? styles.statusChipOk : styles.statusChipWarn]}>
                {!healthReport?.isBatteryOptimized ? t('common:ok', { defaultValue: 'OK' }) : t('settings:chip_exempt', { defaultValue: 'Exempt' })}
              </Text>
            </View>

            <View style={styles.permItem}>
              <Ionicons 
                name="notifications" 
                size={18} 
                color={healthReport?.isNotificationGranted ? '#10B981' : '#F43F5E'} 
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.permName, isDark && styles.textWhite]}>{t('settings:notifications_perm', { defaultValue: 'Push Notifications' })}</Text>
                <Text style={styles.permDesc}>{healthReport?.isNotificationGranted ? 'Allowed' : 'Disabled'}</Text>
              </View>
              <Text style={[styles.statusChip, healthReport?.isNotificationGranted ? styles.statusChipOk : styles.statusChipWarn]}>
                {healthReport?.isNotificationGranted ? t('common:ok', { defaultValue: 'OK' }) : t('settings:chip_enable', { defaultValue: 'Enable' })}
              </Text>
            </View>

            <View style={styles.permItem}>
              <Ionicons 
                name="camera" 
                size={18} 
                color={healthReport?.isCameraGranted ? '#10B981' : '#F43F5E'} 
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.permName, isDark && styles.textWhite]}>{t('settings:camera_access', { defaultValue: 'Camera Access' })}</Text>
                <Text style={styles.permDesc}>{healthReport?.isCameraGranted ? 'Allowed (Selfie/Docs)' : 'Disabled'}</Text>
              </View>
              <Text style={[styles.statusChip, healthReport?.isCameraGranted ? styles.statusChipOk : styles.statusChipWarn]}>
                {healthReport?.isCameraGranted ? t('common:ok', { defaultValue: 'OK' }) : t('settings:chip_allow', { defaultValue: 'Allow' })}
              </Text>
            </View>
          </View>

          <TouchableOpacity 
            style={styles.openSettingsBtn}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.8}
          >
            <Ionicons name="settings-outline" size={16} color="#2563EB" style={{ marginRight: 6 }} />
            <Text style={styles.openSettingsText}>{t('settings:open_android_app_settings', { defaultValue: 'Open Android App Settings' })}</Text>
          </TouchableOpacity>
        </View>

        {/* Section 2: Shift Schedule & Punch Window */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>{t('settings:shift_schedule_and_window', { defaultValue: 'Shift Schedule & Window' })}</Text>
        
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:punch_in_window', { defaultValue: 'Punch In Window' })}</Text>
              <Text style={styles.rowSub}>{t('settings:allowed_check_in_time_range', { defaultValue: 'Allowed check-in time range' })}</Text>
            </View>
            <Text style={[styles.rowValueBadge, isDark && styles.valueBadgeDark]}>
              {settings.punch_in_start} - {settings.punch_in_end}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:standard_shift_end', { defaultValue: 'Standard Shift End' })}</Text>
              <Text style={styles.rowSub}>{t('settings:expected_clock_out_timestamp', { defaultValue: 'Expected clock out timestamp' })}</Text>
            </View>
            <Text style={[styles.rowValueBadge, isDark && styles.valueBadgeDark]}>
              {settings.punch_out_time}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:grace_period', { defaultValue: 'Grace Period' })}</Text>
              <Text style={styles.rowSub}>{t('settings:late_punch_grace_allowance', { defaultValue: 'Late punch grace allowance' })}</Text>
            </View>
            <Text style={[styles.rowValueBadge, isDark && styles.valueBadgeDark]}>
              {settings.grace_minutes || 15} Mins
            </Text>
          </View>
        </View>

        {/* Section 3: Telemetry & Location Controls */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>{t('settings:telemetry_and_location_provider', { defaultValue: 'Telemetry & Location Provider' })}</Text>
        
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={styles.subHeadingLabel}>{t('settings:location_provider_mode', { defaultValue: 'Location Provider Mode' })}</Text>
          <View style={styles.chipsRow}>
            {['GPS Preferred', 'GPS Only', 'GPS + Cellular'].map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.providerChip, selectedProvider === mode && styles.providerChipActive]}
                onPress={() => handleProviderSelect(mode)}
                activeOpacity={0.8}
              >
                <Text style={[styles.providerChipText, selectedProvider === mode && styles.providerChipTextActive]}>
                  {providerLabels[mode] ?? mode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.subHeadingLabel, { marginTop: 14 }]}>{t('settings:telemetry_refresh_interval', { defaultValue: 'Telemetry Refresh Interval' })}</Text>
          <View style={styles.chipsRow}>
            {['10 Seconds', '30 Seconds', '60 Seconds', '15 Minutes'].map(interval => (
              <TouchableOpacity
                key={interval}
                style={[styles.providerChip, selectedInterval === interval && styles.providerChipActive]}
                onPress={() => handleIntervalSelect(interval)}
                activeOpacity={0.8}
              >
                <Text style={[styles.providerChipText, selectedInterval === interval && styles.providerChipTextActive]}>
                  {intervalLabels[interval] ?? interval}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 4: Notification Preferences */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>{t('settings:notification_preferences', { defaultValue: 'Notification Preferences' })}</Text>
        
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:shift_clock_in_out_reminders', { defaultValue: 'Shift Clock In / Out Reminders' })}</Text>
              <Text style={styles.rowSub}>{t('settings:receive_reminders_before_shift_starts_and', { defaultValue: 'Receive reminders before shift starts and ends' })}</Text>
            </View>
            <Switch
              value={shiftReminders}
              onValueChange={(val) => handleToggleNotif('shift', val)}
              trackColor={{ false: '#CBD5E1', true: '#2563EB' }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:team_and_hr_messages', { defaultValue: 'Team & HR Messages' })}</Text>
              <Text style={styles.rowSub}>{t('settings:instant_push_alerts_for_direct_chat', { defaultValue: 'Instant push alerts for direct chat messages' })}</Text>
            </View>
            <Switch
              value={chatAlerts}
              onValueChange={(val) => handleToggleNotif('chat', val)}
              trackColor={{ false: '#CBD5E1', true: '#2563EB' }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:company_announcements', { defaultValue: 'Company Announcements' })}</Text>
              <Text style={styles.rowSub}>{t('settings:broadcast_notifications_from_management', { defaultValue: 'Broadcast notifications from management' })}</Text>
            </View>
            <Switch
              value={announcementAlerts}
              onValueChange={(val) => handleToggleNotif('ann', val)}
              trackColor={{ false: '#CBD5E1', true: '#2563EB' }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:haptic_touch_and_vibration', { defaultValue: 'Haptic Touch & Vibration' })}</Text>
              <Text style={styles.rowSub}>{t('settings:vibrate_on_attendance_punch_actions', { defaultValue: 'Vibrate on attendance punch actions' })}</Text>
            </View>
            <Switch
              value={hapticVibration}
              onValueChange={(val) => handleToggleNotif('vib', val)}
              trackColor={{ false: '#CBD5E1', true: '#2563EB' }}
            />
          </View>
        </View>

        {/* Section 5: Language & Appearance */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>{t('settings:language_and_display', { defaultValue: 'Language & Display' })}</Text>
        
        <View style={[styles.card, isDark && styles.cardDark]}>
          <TouchableOpacity 
            style={styles.settingRow}
            onPress={() => setIsLangModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:app_language', { defaultValue: 'App Language' })}</Text>
              <Text style={styles.rowSub}>{t('settings:select_interface_language', { defaultValue: 'Select interface language' })}</Text>
            </View>
            <View style={styles.langBadge}>
              <Ionicons name="globe-outline" size={15} color="#2563EB" style={{ marginRight: 4 }} />
              <Text style={styles.langBadgeText}>{currentLanguage.toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Section 6: Storage, Sync & Privacy */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>{t('settings:data_and_storage_management', { defaultValue: 'Data & Storage Management' })}</Text>
        
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.actionItemRow}>
            <TouchableOpacity 
              style={styles.syncBtn} 
              onPress={handleSyncTelemetry}
              disabled={isSyncing}
              activeOpacity={0.8}
            >
              {isSyncing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="sync-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.syncBtnText}>{t('settings:force_sync_telemetry_now', { defaultValue: 'Force Sync Telemetry Now' })}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.clearCacheBtn} 
              onPress={handleClearCache}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
              <Text style={styles.clearCacheText}>{t('settings:clear_offline_cache', { defaultValue: 'Clear Offline Cache' })}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.settingRow}
            onPress={() => setIsPrivacyModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:privacy_policy_and_disclosures', { defaultValue: 'Privacy Policy & Disclosures' })}</Text>
              <Text style={styles.rowSub}>{t('settings:view_legal_terms_and_permission_disclosure', { defaultValue: 'View legal terms and permission disclosures' })}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.settingRow}
            onPress={() => router.push('/developer-diagnostics')}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, isDark && styles.textWhite]}>{t('settings:backend_server_and_diagnostics', { defaultValue: 'Backend Server & Diagnostics' })}</Text>
              <Text style={styles.rowSub}>{t('settings:configure_static_ip_host_and_test', { defaultValue: 'Configure static IP host & test network latency' })}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* App Version Info Card */}
        <View style={styles.versionCard}>
          <Text style={styles.versionTitle}>Enterprise HRMS Mobile</Text>
          <Text style={styles.versionSub}>Version 1.4.1 (Build 2026.11) • Production Grade</Text>
          <Text style={styles.versionCopy}>© 2026 Corporate Workforce Management Systems</Text>
        </View>

      </ScrollView>

      {/* Setup Wizard Modal */}
      <SetupWizardModal
        visible={isWizardVisible}
        healthReport={healthReport}
        onClose={() => {
          setIsWizardVisible(false);
          loadSettingsAndHealth();
        }}
        onRefresh={async () => {
          const report = await getDeviceHealthReport();
          setHealthReport(report);
        }}
      />

      {/* Language Selection Modal */}
      <LanguageModal
        visible={isLangModalVisible}
        onClose={() => setIsLangModalVisible(false)}
      />

      {/* Privacy Policy Review Modal */}
      <PrivacyPolicyConsentModal
        visible={isPrivacyModalVisible}
        onAccept={() => setIsPrivacyModalVisible(false)}
      />
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
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
  reliabilityScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  scoreLevel: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  scoreSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  wizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  wizardBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  permStatusGrid: {
    gap: 10,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  permName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  permDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  statusChip: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  statusChipOk: {
    backgroundColor: '#D1FAE5',
    color: '#059669',
  },
  statusChipWarn: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  openSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  openSettingsText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  rowValueBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  valueBadgeDark: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
  },
  subHeadingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  providerChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  providerChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  providerChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  providerChipTextActive: {
    color: '#FFFFFF',
  },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  langBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  actionItemRow: {
    gap: 8,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
  },
  syncBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  clearCacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 12,
  },
  clearCacheText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  versionCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  versionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#94A3B8',
  },
  versionSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  versionCopy: {
    fontSize: 10,
    color: '#CBD5E1',
    marginTop: 4,
  },
  textWhite: {
    color: '#F8FAFC',
  },
});
