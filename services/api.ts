import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE_URL } from '@/constants/API';
import { logDebug } from './DebugLogger';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 60000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('userToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  (config as any).meta = { startTime: Date.now() };

  const fullUrl = config.url?.startsWith('http')
    ? config.url
    : `${(config.baseURL || API_BASE_URL).replace(/\/$/, '')}/${(config.url || '').replace(/^\//, '')}`;

  const payloadStr = config.data ? JSON.stringify(config.data) : 'None';
  const payloadSize = payloadStr.length;
  logDebug(
    'API',
    'HTTP_REQUEST_SEND',
    'PENDING',
    undefined,
    `Method: ${config.method?.toUpperCase()} | URL: ${fullUrl} | PayloadSize: ${payloadSize} bytes | Payload: ${payloadStr.slice(0, 300)}`
  );

  return config;
});

api.interceptors.response.use(
  (response) => {
    const startTime = (response.config as any)?.meta?.startTime || Date.now();
    const duration = Date.now() - startTime;
    const bodyStr = response.data ? JSON.stringify(response.data) : 'Empty';
    const fullUrl = response.config.url?.startsWith('http')
      ? response.config.url
      : `${(response.config.baseURL || API_BASE_URL).replace(/\/$/, '')}/${(response.config.url || '').replace(/^\//, '')}`;

    logDebug(
      'API',
      'HTTP_RESPONSE_RECEIVE',
      'SUCCESS',
      undefined,
      `Status: ${response.status} | Duration: ${duration}ms | URL: ${fullUrl} | ResponseBody: ${bodyStr.slice(0, 300)}`
    );
    return response;
  },
  async (error) => {
    const startTime = (error.config as any)?.meta?.startTime || Date.now();
    const duration = Date.now() - startTime;
    const status = error.response ? error.response.status : (error.code || 'NETWORK_ERROR');
    const bodyStr = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    const fullUrl = error.config?.url?.startsWith('http')
      ? error.config.url
      : `${(error.config?.baseURL || API_BASE_URL).replace(/\/$/, '')}/${(error.config?.url || '').replace(/^\//, '')}`;

    logDebug(
      'API',
      'HTTP_RESPONSE_ERROR',
      'FAILURE',
      undefined,
      `Status: ${status} | Duration: ${duration}ms | URL: ${fullUrl} | ErrorBody: ${bodyStr.slice(0, 300)}`
    );

    if (error.response && error.response.status === 401) {
      console.warn("[API Security Interceptor] Detected 401 Unauthorized, cleaning auth session cache...");
      try {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('userProfile');
        await AsyncStorage.removeItem('hasLaunched');
        
        // Automatically redirect to login screen
        try {
          router.replace('/(auth)/login');
        } catch (rErr) {
          console.warn("[API Security Interceptor] Router replace deferred:", rErr);
        }
      } catch (cleanErr) {
        console.error("[API Security Interceptor Error] Failed to clear session:", cleanErr);
      }
    }
    return Promise.reject(error);
  }
);

export default api;