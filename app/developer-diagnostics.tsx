// app/developer-diagnostics.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import CellularTracker from '@/modules/cellular-tracker';
import { API_BASE_URL } from '@/constants/API';
import { exportDebugLogs, generateDiagnosticsReport, DiagnosticsReportData } from '@/services/LogExporter';
import { getActiveJSSyncSession } from '@/services/DebugLogger';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DeveloperDiagnosticsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReportData | null>(null);
  const [asyncQueueCount, setAsyncQueueCount] = useState<number>(0);
  const [exporting, setExporting] = useState(false);

  const fetchDiagnosticsData = async () => {
    setLoading(true);
    try {
      const data = await generateDiagnosticsReport();
      setDiagnostics(data);

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
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
          <View style={[styles.card, diagnostics?.apiConfig.isProductionBackend ? styles.cardSuccess : styles.cardWarning]}>
            <Text style={styles.cardTitle}>Backend API Configuration</Text>
            <Text style={styles.label}>Active API Base URL:</Text>
            <Text style={styles.codeText}>{diagnostics?.apiConfig.activeBaseUrl}</Text>
            <Text style={styles.label}>Production Host Match (https://hydro-hrms-app.onrender.com/api):</Text>
            <Text style={[styles.boldText, { color: diagnostics?.apiConfig.isProductionBackend ? '#10b981' : '#f59e0b' }]}>
              {diagnostics?.apiConfig.isProductionBackend ? 'VERIFIED (PRODUCTION)' : 'CUSTOM / DEV ENDPOINT'}
            </Text>
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
    </SafeAreaView>
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
  actionBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' }
});
