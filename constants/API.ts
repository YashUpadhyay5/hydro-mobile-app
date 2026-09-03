// mobile-app/constants/API.ts
import Constants from 'expo-constants';

import { Platform } from 'react-native';

const PUBLIC_SERVER_IP = '45.122.121.237';

const getBaseUrl = (): string => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const currentHost = window.location.hostname;
    
    if (currentHost.includes('github.dev')) {
      const backendHost = currentHost.replace('-8081.', '-8000.');
      return `https://${backendHost}/hrms/api`;
    }
  }

  // Primary public server API host
  return `http://${PUBLIC_SERVER_IP}:8000/api`;
};

export const API_BASE_URL = getBaseUrl();

// Debug tracker to confirm the correct handshake address in your browser developer console
console.log('--- ACTIVE NETWORK API ENDPOINT: ---', API_BASE_URL);