// mobile-app/constants/API.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BACKEND_URL_STORAGE_KEY = '@hrms_custom_backend_url';

/**
 * Turns "192.168.1.5:8000", "http://host:8000" or "https://host/api/" into "<scheme>://host[:port]/api".
 * A bare host:port is assumed to be plain http, since that is how a dev machine is typically reached.
 */
export const normalizeApiBaseUrl = (input: string): string => {
  let cleaned = input.trim().replace(/\/+$/, '');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `http://${cleaned}`;
  }
  if (!cleaned.endsWith('/api')) {
    cleaned = `${cleaned}/api`;
  }
  return cleaned;
};

// The backend this build talks to. It is supplied by the environment (see .env.example) and inlined
// by Metro, so it has to be read as a literal `process.env.EXPO_PUBLIC_API_URL`.
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || 'http://45.122.121.237:8000/api';

export const DEFAULT_API_BASE_URL: string = normalizeApiBaseUrl(configuredApiUrl);

if (!DEFAULT_API_BASE_URL) {
  console.error(
    '[API Endpoint Manager] EXPO_PUBLIC_API_URL is not set, so no backend is configured. ' +
      'Copy .env.example to .env.local, set it, then restart Expo with `npx expo start --clear`.'
  );
}

let activeApiBaseUrl: string = DEFAULT_API_BASE_URL;

// Export active URL reference
export let API_BASE_URL = activeApiBaseUrl;

/** True once a backend address is available, from the build config or a saved override. */
export const isApiConfigured = (): boolean => API_BASE_URL.length > 0;

/** True while the active backend is the one this build was configured with (no runtime override). */
export const isUsingConfiguredBackend = (): boolean => API_BASE_URL === DEFAULT_API_BASE_URL;

// Initialize and sync backend URL from AsyncStorage
export const initApiBaseUrl = async (): Promise<string> => {
  try {
    const saved = await AsyncStorage.getItem(BACKEND_URL_STORAGE_KEY);
    if (saved && saved.trim().startsWith('http')) {
      activeApiBaseUrl = saved.trim();
      API_BASE_URL = activeApiBaseUrl;
      console.log('[API Endpoint Manager] Loaded custom backend URL:', activeApiBaseUrl);
      return activeApiBaseUrl;
    }
  } catch (err) {
    console.warn('[API Endpoint Manager] Failed reading stored backend URL:', err);
  }
  activeApiBaseUrl = DEFAULT_API_BASE_URL;
  API_BASE_URL = activeApiBaseUrl;
  return activeApiBaseUrl;
};

// Set and persist new backend URL
export const setBackendUrl = async (newUrl: string): Promise<string> => {
  const cleaned = normalizeApiBaseUrl(newUrl);

  await AsyncStorage.setItem(BACKEND_URL_STORAGE_KEY, cleaned);
  activeApiBaseUrl = cleaned;
  API_BASE_URL = cleaned;
  console.log('[API Endpoint Manager] Backend URL switched to:', cleaned);
  return cleaned;
};

// Drop any saved override and go back to the backend this build was configured with
export const resetBackendUrl = async (): Promise<string> => {
  await AsyncStorage.removeItem(BACKEND_URL_STORAGE_KEY);
  activeApiBaseUrl = DEFAULT_API_BASE_URL;
  API_BASE_URL = DEFAULT_API_BASE_URL;
  console.log('[API Endpoint Manager] Reset backend URL to configured default:', DEFAULT_API_BASE_URL);
  return DEFAULT_API_BASE_URL;
};

// Ping backend and measure round-trip network latency (in ms)
export const checkBackendLatency = async (
  url?: string
): Promise<{ success: boolean; latencyMs: number; error?: string }> => {
  const target = (url || API_BASE_URL).replace(/\/$/, '');
  const testUrl = `${target}/geofence`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(testUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    return {
      success: response.ok || response.status === 200 || response.status === 304,
      latencyMs,
    };
  } catch (e: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      latencyMs,
      error: e.name === 'AbortError' ? 'Connection timed out (>6s)' : (e.message || 'Network unreachable'),
    };
  }
};

// Initialize on module load. Other modules that fire requests during app startup
// (e.g. AuthContext's initAuth) must `await apiBaseUrlReady` first so they don't
// race this AsyncStorage read and dispatch against the build-time default host.
export const apiBaseUrlReady: Promise<string> = initApiBaseUrl();

// Debug tracker to confirm the correct handshake address in developer console
console.log('--- ACTIVE NETWORK API ENDPOINT: ---', API_BASE_URL || '(not configured)');
