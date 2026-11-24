import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import CellularTracker, { AttendanceReminderStatus } from '@/modules/cellular-tracker';
import { API_BASE_URL, setBackendUrl, resetBackendUrl, checkBackendLatency, DEFAULT_API_BASE_URL } from '@/constants/API';
import { exportDebugLogs, generateDiagnosticsReport, DiagnosticsReportData } from '@/services/LogExporter';
import { getActiveJSSyncSession } from '@/services/DebugLogger';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DeveloperDiagnosticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReportData | null>(null);
  const [asyncQueueCount, setAsyncQueueCount] = useState<number>(0);
  const [exporting, setExporting] = useState(false);

  // Dynamic Backend URL & Latency State
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [latencyResult, setLatencyResult] = useState<string | null>(null);
  const [isTestingLatency, setIsTestingLatency] = useState(false);
  const [reminderStatus, setReminderStatus] = useState<AttendanceReminderStatus | null>(null);

  const handleTestReminder = (kind: 'CLOCK_IN' | 'CLOCK_OUT') => {
    if (CellularTracker.scheduleTestAttendanceReminder(kind, 60)) {
      Alert.alert(
        'Test reminder in 60 seconds',
        'Now lock the phone, or swipe HRMS away from Recents, and wait. The reminder should ring and appear. If it does not, check the items below and the device\'s auto-start / battery settings.'
      );
    } else {
      Alert.alert('Test not scheduled', 'Reminders are not configured on this device yet. Sign in and open the app once, then try again.');
    }
  };

  const handleTestActivityAlarm = () => {
    if (CellularTracker.scheduleTestActivityAlarm(20)) {
      Alert.alert(
        'Activity alarm in 20 seconds',
        'Lock the phone, or swipe HRMS away from Recents, and wait. It should ring until you open or silence it, and tapping it opens the Extra time screen.'
      );
    } else {
      Alert.alert('Test not scheduled', 'The activity alarm is only available in the installed Android app.');
    }
  };

  const fetchDiagnosticsData = async () => {
    setLoading(true);
    try {
      const data = await generateDiagnosticsReport();
      setDiagnostics(data);
      setReminderStatus(await CellularTracker.getAttendanceReminderStatus());

      const asyncQueue = await AsyncStorage.getItem('offlineFootprintsQueue');
      if (asyncQueue) {
        const parsed = JSON.parse(asyncQueue);
        setAsyncQueueCount(Array.isArray(parsed) ? parsed.length : 0);
      } else {
        setAsyncQueueCount(0);
      }
    } catch (e) {
      console.error("Failed to load developer diagnostics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnosticsData();
  }, []);

  const handleTestLatency = async (urlToCheck?: string) => {
    setIsTestingLatency(true);
    setLatencyResult(null);
    const res = await checkBackendLatency(urlToCheck || diagnostics?.apiConfig.activeBaseUrl);
    setIsTestingLatency(false);
    if (res.success) {
      setLatencyResult(`⚡ ${res.latencyMs} ms (Online & Fast)`);
    } else {
      setLatencyResult(`❌ ${res.error || 'Failed'} (${res.latencyMs}ms)`);
    }
  };

  const handleSaveUrl = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('Invalid URL', 'Please enter a valid backend URL.');
      return;
    }
    const updated = await setBackendUrl(inputUrl.trim());
    setIsEditingUrl(false);
    setInputUrl('');
    await fetchDiagnosticsData();
    Alert.alert('Backend URL Updated', `Active API base URL set to:\n${updated}`);
  };

  const handleResetUrl = async () => {
    await resetBackendUrl();
    setIsEditingUrl(false);
    setInputUrl('');
    await fetchDiagnosticsData();
    Alert.alert('Backend Reset', `Reverted to the build-configured backend:\n${DEFAULT_API_BASE_URL || 'not set'}`);
  };

  const handleExport = async () => {
    setExporting(true);
    const success = await exportDebugLogs();
    setExporting(false);
    if (success) {
      Alert.alert("Export Successful", "Debug report and logs compiled successfully.");
    } else {
      Alert.alert("Export Failed", "Could not generate or share debug report.");
    }
  };

  const handleClearLogs = async () => {
    Alert.alert("Clear Logs", "Debug log files have been reset.");
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16), paddingBottom: 14 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Developer Diagnostics</Text>
        <TouchableOpacity onPress={fetchDiagnosticsData} style={styles.refreshHeaderBtn}>
          <Text style={styles.refreshHeaderText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Fetching Observability Metrics...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Active API Config Card */}
          <View style={[styles.card, diagnostics?.apiConfig.isConfiguredBackend ? styles.cardSuccess : styles.cardWarning]}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Backend API Configuration</Text>
              <TouchableOpacity onPress={() => setIsEditingUrl(!isEditingUrl)}>
                <Text style={styles.editActionText}>{isEditingUrl ? 'Cancel' : '✏️ Change URL'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Active API Base URL:</Text>
            <Text style={styles.codeText}>{diagnostics?.apiConfig.activeBaseUrl}</Text>
            <Text style={styles.label}>Build-configured backend ({DEFAULT_API_BASE_URL || 'not set'}):</Text>
            <Text style={[styles.boldText, { color: diagnostics?.apiConfig.isConfiguredBackend ? '#10b981' : '#f59e0b' }]}>
              {diagnostics?.apiConfig.isConfiguredBackend ? 'USING BUILD CONFIG' : 'CUSTOM ENDPOINT (OVERRIDE)'}
            </Text>

            {/* Real-time Latency Check */}
            <View style={styles.latencyContainer}>
              <TouchableOpacity 
                style={styles.latencyBtn} 
                onPress={() => handleTestLatency()}
                disabled={isTestingLatency}
              >
                {isTestingLatency ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.latencyBtnText}>Test Latency</Text>
                )}
              </TouchableOpacity>
              {latencyResult && (
                <Text style={[styles.latencyResultText, latencyResult.includes('❌') ? styles.latencyError : styles.latencySuccess]}>
                  {latencyResult}
                </Text>
              )}
            </View>

            {/* Interactive URL Modification Form */}
            {isEditingUrl && (
              <View style={styles.editUrlContainer}>
                <Text style={styles.editUrlLabel}>Enter New Backend Base URL:</Text>
                <TextInput
                  style={styles.urlInput}
                  placeholder="e.g. http://192.168.0.10:8000/api"
                  placeholderTextColor="#64748b"
                  value={inputUrl}
                  onChangeText={setInputUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.editBtnRow}>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl}>
                    <Text style={styles.saveBtnText}>Save & Apply</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.resetBtn} onPress={handleResetUrl}>
                    <Text style={styles.resetBtnText}>Reset to Build Config</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Sync Session & Diagnostics */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sync Session & Observability</Text>
            <Text style={styles.label}>Active Sync Session ID:</Text>
            <Text style={styles.badgeText}>{diagnostics?.syncSessionId || getActiveJSSyncSession()}</Text>
            <Text style={styles.label}>Platform / OS Version:</Text>
            <Text style={styles.valueText}>{diagnostics?.deviceInfo.platform.toUpperCase()} - {diagnostics?.deviceInfo.osVersion}</Text>
            <Text style={styles.label}>Device Model:</Text>
            <Text style={styles.valueText}>{diagnostics?.deviceInfo.manufacturer} {diagnostics?.deviceInfo.modelName}</Text>
            <Text style={styles.label}>Battery Level:</Text>
            <Text style={styles.valueText}>{diagnostics?.deviceInfo.batteryLevel}</Text>
          </View>

          {/* Room SQLite DB Diagnostics */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Room SQLite Database Status</Text>
            <Text style={styles.label}>Clock-In State:</Text>
            <Text style={styles.valueText}>{diagnostics?.roomDiagnostics?.isClockedIn ? 'CLOCK IN ACTIVE' : 'CLOCKED OUT'}</Text>
            <Text style={styles.label}>Pending Room DB Location Count:</Text>
            <Text style={[styles.bigNumber, { color: (diagnostics?.roomDiagnostics?.pendingCount || 0) > 0 ? '#f59e0b' : '#10b981' }]}>
              {diagnostics?.roomDiagnostics?.pendingCount ?? 0}
            </Text>
            <Text style={styles.label}>Failed Sync Uploads Count:</Text>
            <Text style={styles.valueText}>{diagnostics?.roomDiagnostics?.failedCount ?? 0}</Text>
            <Text style={styles.label}>Uploaded Successfully Today:</Text>
            <Text style={styles.valueText}>{diagnostics?.roomDiagnostics?.uploadedToday ?? 0}</Text>
            <Text style={styles.label}>Last Fix Source & Accuracy:</Text>
            <Text style={styles.valueText}>{diagnostics?.roomDiagnostics?.lastFixSource} ({diagnostics?.roomDiagnostics?.lastFixAccuracy?.toFixed(1)}m)</Text>
          </View>

          {/* Native attendance reminders */}
          {reminderStatus && (
            <View style={[styles.card, reminderStatus.notificationsEnabled && reminderStatus.exactAlarmsAllowed ? styles.cardSuccess : styles.cardWarning]}>
              <Text style={styles.cardTitle}>Attendance Reminders</Text>
              <Text style={styles.label}>Next Reminder:</Text>
              <Text style={styles.valueText}>
                {!reminderStatus.enabled
                  ? 'Off (signed out or switched off in App Settings)'
                  : reminderStatus.nextReminderAt
                    ? `${reminderStatus.nextReminderKind === 'CLOCK_IN' ? 'Clock-in' : 'Clock-out'} at ${new Date(reminderStatus.nextReminderAt).toLocaleString()}`
                    : 'None scheduled'}
              </Text>
              {([
                ['Notifications allowed', reminderStatus.notificationsEnabled, 'notifications'],
                ['Exact alarms allowed (on-time delivery)', reminderStatus.exactAlarmsAllowed, 'exactAlarm'],
                ['Full-screen reminder allowed', reminderStatus.fullScreenAllowed, 'fullScreen'],
                ['Battery optimization off', reminderStatus.batteryOptimizationIgnored, 'appDetails'],
              ] as const).map(([label, ok, target]) => (
                <TouchableOpacity key={label} disabled={ok} onPress={() => CellularTracker.openAttendanceReminderSettings(target)}>
                  <Text style={styles.label}>{label}:</Text>
                  <Text style={[styles.boldText, { color: ok ? '#10b981' : '#f59e0b' }]}>{ok ? 'Yes' : 'No — tap to open settings'}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.label}>Device: {reminderStatus.manufacturer} (on Infinix/Tecno/itel also enable Auto-start in Phone Master)</Text>
              <View style={styles.editBtnRow}>
                <TouchableOpacity style={[styles.saveBtn, { marginTop: 12 }]} onPress={() => handleTestReminder('CLOCK_IN')}>
                  <Text style={styles.saveBtnText}>Test clock-in reminder (60 s)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.resetBtn, { marginTop: 12 }]} onPress={() => handleTestReminder('CLOCK_OUT')}>
                  <Text style={styles.resetBtnText}>Test clock-out (60 s)</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.editBtnRow}>
                <TouchableOpacity style={[styles.saveBtn, { marginTop: 8 }]} onPress={handleTestActivityAlarm}>
                  <Text style={styles.saveBtnText}>Test activity alarm (20 s)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* AsyncStorage Backup Queue */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>AsyncStorage Offline Buffer Queue</Text>
            <Text style={styles.label}>Pending Buffer Count:</Text>
            <Text style={styles.valueText}>{asyncQueueCount} items</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.actionBtn, styles.exportBtn]} onPress={handleExport} disabled={exporting}>
              {exporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>Export Debug Logs (.ZIP/TXT)</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionBtn, styles.clearBtn]} onPress={handleClearLogs}>
              <Text style={styles.actionBtnText}>Clear Local Logs</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionBtn, styles.refreshBtn]} onPress={fetchDiagnosticsData}>
              <Text style={styles.actionBtnText}>Refresh Metrics</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  backButton: { padding: 4 },
  backText: { color: '#3b82f6', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  refreshHeaderBtn: { padding: 4 },
  refreshHeaderText: { color: '#10b981', fontSize: 14, fontWeight: '600' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },
  scrollContent: { padding: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  cardSuccess: { borderColor: '#10b981' },
  cardWarning: { borderColor: '#f59e0b' },
  cardTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  label: { color: '#94a3b8', fontSize: 12, marginTop: 8 },
  valueText: { color: '#f1f5f9', fontSize: 14, fontWeight: '600', marginTop: 2 },
  boldText: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  codeText: { color: '#38bdf8', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 },
  badgeText: { color: '#a855f7', fontSize: 14, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 },
  bigNumber: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  buttonContainer: { marginTop: 8, marginBottom: 32 },
  actionBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  exportBtn: { backgroundColor: '#2563eb' },
  clearBtn: { backgroundColor: '#dc2626' },
  refreshBtn: { backgroundColor: '#475569' },
  actionBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  editActionText: { color: '#38bdf8', fontSize: 13, fontWeight: '700' },
  latencyContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  latencyBtn: { backgroundColor: '#334155', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#475569' },
  latencyBtnText: { color: '#f8fafc', fontSize: 12, fontWeight: '700' },
  latencyResultText: { fontSize: 12, fontWeight: '700' },
  latencySuccess: { color: '#10b981' },
  latencyError: { color: '#ef4444' },
  editUrlContainer: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  editUrlLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 6 },
  urlInput: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#475569', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#f8fafc', fontSize: 13, marginBottom: 10 },
  editBtnRow: { flexDirection: 'row', gap: 10 },
  saveBtn: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  resetBtn: { flex: 1, backgroundColor: '#475569', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  resetBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 }
});

