// services/LogExporter.ts
import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import { API_BASE_URL } from '@/constants/API';
import CellularTracker from '@/modules/cellular-tracker';
import { getActiveJSSyncSession } from './DebugLogger';

export interface DiagnosticsReportData {
  deviceInfo: {
    brand: string | null;
    manufacturer: string | null;
    modelName: string | null;
    osVersion: string | null;
    batteryLevel: string;
    platform: string;
  };
  apiConfig: {
    activeBaseUrl: string;
    isProductionBackend: boolean;
  };
  roomDiagnostics: any;
  syncSessionId: string;
  timestamp: string;
}

export const generateDiagnosticsReport = async (): Promise<DiagnosticsReportData> => {
  let battLevel = 'Unknown';
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level !== -1) {
      battLevel = `${Math.round(level * 100)}%`;
    }
  } catch (e) {}

  let roomDiag = null;
  try {
    roomDiag = await (CellularTracker as any).getDiagnostics();
  } catch (e: any) {
    roomDiag = { error: e.message };
  }

  return {
    deviceInfo: {
      brand: Device.brand,
      manufacturer: Device.manufacturer,
      modelName: Device.modelName,
      osVersion: Device.osVersion,
      batteryLevel: battLevel,
      platform: Platform.OS
    },
    apiConfig: {
      activeBaseUrl: API_BASE_URL,
      isProductionBackend: API_BASE_URL === 'https://hydro-hrms-app.onrender.com/api'
    },
    roomDiagnostics: roomDiag,
    syncSessionId: getActiveJSSyncSession(),
    timestamp: new Date().toISOString()
  };
};

export const exportDebugLogs = async (): Promise<boolean> => {
  try {
    const reportData = await generateDiagnosticsReport();
    const reportContent = `====================================================
HRMS ENTERPRISE DEBUG & DIAGNOSTICS REPORT
Generated: ${reportData.timestamp}
====================================================

[DEVICE INFORMATION]
Brand: ${reportData.deviceInfo.brand}
Manufacturer: ${reportData.deviceInfo.manufacturer}
Model: ${reportData.deviceInfo.modelName}
OS Version: ${reportData.deviceInfo.osVersion}
Battery Level: ${reportData.deviceInfo.batteryLevel}
Platform: ${reportData.deviceInfo.platform}

[API CONFIGURATION]
Active API Base URL: ${reportData.apiConfig.activeBaseUrl}
Production Host Match: ${reportData.apiConfig.isProductionBackend ? 'YES' : 'NO'}

[ROOM DATABASE DIAGNOSTICS]
Pending Count: ${reportData.roomDiagnostics?.pendingCount ?? 'N/A'}
Failed Count: ${reportData.roomDiagnostics?.failedCount ?? 'N/A'}
Uploaded Today: ${reportData.roomDiagnostics?.uploadedToday ?? 'N/A'}
Last Fix Timestamp: ${reportData.roomDiagnostics?.lastFixTimestamp ?? 'N/A'}
Last Fix Source: ${reportData.roomDiagnostics?.lastFixSource ?? 'N/A'}
Last Fix Accuracy: ${reportData.roomDiagnostics?.lastFixAccuracy ?? 'N/A'}

[SYNC SESSION]
Active Session ID: ${reportData.syncSessionId}

====================================================
End of Report
====================================================
`;

    const docDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const fileUri = `${docDir}debug_report_${Date.now()}.txt`;
    if ((FileSystem as any).writeAsStringAsync) {
      await (FileSystem as any).writeAsStringAsync(fileUri, reportContent, { encoding: (FileSystem as any).EncodingType?.UTF8 || 'utf8' });
    }

    await Share.share({
      title: 'Export HRMS Debug Report',
      message: reportContent,
      url: fileUri
    });
    return true;
  } catch (err: any) {
    console.error("Export debug logs error:", err);
    return false;
  }
};
