import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import axios from 'axios';
import { API_BASE_URL } from '@/constants/API';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import AttendanceServiceBridge from './AttendanceServiceBridge';

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

const formatDateISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundLocationTask] Error:', error.message);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      const loc = locations[locations.length - 1]; // Use the most recent location
      console.log('[BackgroundLocationTask] Location received:', loc.coords.latitude, loc.coords.longitude);

      try {
        // Retrieve the currently active user from storage
        let userStr = await AsyncStorage.getItem('userProfile');
        if (!userStr) userStr = await AsyncStorage.getItem('authUser');
        if (!userStr) userStr = await AsyncStorage.getItem('@user_profile');
        
        if (userStr) {
          const user = JSON.parse(userStr);
          
          // Check active attendance state
          const stateStr = await AsyncStorage.getItem(`attendanceState_${user.id || user._id}`);
          if (stateStr) {
            const state = JSON.parse(stateStr);
            if (state.status === 'Checked In') {

              // Retrieve battery metrics if available
              let currentBatteryLevel = 1.0;
              let currentBatteryTemp = null;
              try {
                const battLevel = await Battery.getBatteryLevelAsync();
                if (battLevel !== -1 && battLevel !== undefined) {
                  currentBatteryLevel = parseFloat(battLevel.toFixed(2));
                }
              } catch (bErr) {
                // Ignore battery retrieval errors in fallback
              }

              // Retrieve configured location_provider setting
              const settingsStr = await AsyncStorage.getItem('@app_settings');
              let trackingMethod = 'GPS';
              if (settingsStr) {
                try {
                  const s = JSON.parse(settingsStr);
                  if (s.location_provider === 'GPS Only') trackingMethod = 'GPS';
                  else if (s.location_provider === 'GPS + Cellular') trackingMethod = 'CELLULAR';
                  else trackingMethod = 'GPS';
                } catch (sErr) {}
              }

              const newPoint = {
                id: `loc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                userId: user.empCode || user.id || user._id,
                empCode: user.empCode || user.id,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                timestamp: Date.now(),
                date: formatDateISO(new Date()),
                locationEnabled: true,
                trackingMethod,
                locationSource: trackingMethod,
                accuracy: loc.coords.accuracy,
                speed: loc.coords.speed || 0,
                altitude: loc.coords.altitude || 0,
                heading: loc.coords.heading || 0,
                batteryLevel: currentBatteryLevel, 
                batteryTemp: currentBatteryTemp,
                isMockLocation: loc.mocked || (loc.coords as any)?.isMocked || false,
                isBackground: true
              };

              try {
                // Post directly to server
                await axios.post(`${API_BASE_URL}/footprints`, newPoint, { timeout: 8000 });
                console.log('[BackgroundLocationTask] Live footprint synced successfully to server.');
              } catch (networkErr: any) {
                // Network unavailable or server unreachable -> Buffer into offline queue
                console.warn('[BackgroundLocationTask] Device offline or network failed. Buffering footprint to offlineQueue...');
                const existingQueueStr = await AsyncStorage.getItem('offlineFootprintsQueue');
                let existingQueue = existingQueueStr ? JSON.parse(existingQueueStr) : [];
                if (!Array.isArray(existingQueue)) existingQueue = [];
                existingQueue.push(newPoint);
                if (existingQueue.length > 200) {
                  existingQueue = existingQueue.slice(-200);
                }
                await AsyncStorage.setItem('offlineFootprintsQueue', JSON.stringify(existingQueue));
                console.log(`[BackgroundLocationTask] Buffered footprint offline. Total offline buffer items: ${existingQueue.length}`);
              }

              return;
            }
          }
        }

        console.log('[BackgroundLocationTask] User is not checked in. Halting background location updates.');
        const hasTask = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (hasTask) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
      } catch (err: any) {
        console.error('[BackgroundLocationTask] Error processing footprint step:', err.message);
      }
    }
  }
});

