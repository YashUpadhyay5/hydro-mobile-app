// services/DebugLogger.ts
import { API_BASE_URL } from '@/constants/API';

export interface DebugLogEntry {
  timestamp: string;
  module: string;
  action: string;
  status: string;
  uuid?: string;
  details?: string;
  syncSessionId?: string;
}

let activeSyncSessionId = 'N/A';

export const startJSSyncSession = (): string => {
  const d = new Date();
  const dateStr = d.toISOString().replace(/[-T:]/g, '').slice(0, 15);
  activeSyncSessionId = `SYNC_${dateStr}`;
  return activeSyncSessionId;
};

export const getActiveJSSyncSession = (): string => activeSyncSessionId;

export const logDebug = (
  module: string,
  action: String,
  status: string,
  uuid?: string,
  details?: string
) => {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
  const session = activeSyncSessionId;

  const logMessage = `
----------------------------------------------------
Time: [${timeStr}]
MODULE: ${module}
ACTION: ${action}
STATUS: ${status}
UUID: ${uuid || 'N/A'}
Thread: JS_Main
Sync Session: ${session}
Details: ${details || 'None'}
----------------------------------------------------`;

  console.log(`[HRMS_DEBUG] ${logMessage}`);
};

export const checkStartupBackendUrl = () => {
  logDebug(
    'BACKEND_URL',
    'STARTUP_CHECK',
    API_BASE_URL === 'http://45.122.121.237:8000/api' ? 'SUCCESS' : 'WARNING',
    undefined,
    `Active API Endpoint: ${API_BASE_URL}`
  );
};
