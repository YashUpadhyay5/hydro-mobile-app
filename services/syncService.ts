import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/API';
import axios from 'axios';
import { logDebug } from './DebugLogger';

export const syncOfflineData = async () => {
  logDebug('SYNC_SERVICE', 'CHECK_START', 'PENDING', undefined, 'Checking AsyncStorage for offline buffered logs...');
  console.log('[SyncService] Checking for offline buffered logs...');

  // 1. Sync offline attendance logs
  try {
    const pendingAttendance = await AsyncStorage.getItem('offlineQueue');
    if (pendingAttendance) {
      const queue = JSON.parse(pendingAttendance);
      if (Array.isArray(queue) && queue.length > 0) {
        logDebug('ATTENDANCE', 'ASYNC_QUEUE_SYNC_START', 'PENDING', undefined, `QueueCount: ${queue.length}`);
        console.log(`[SyncService] Syncing ${queue.length} offline attendance items...`);
        for (const item of queue) {
          await api.post('/attendance/sync', item);
        }
        await AsyncStorage.removeItem('offlineQueue');
        logDebug('ATTENDANCE', 'ASYNC_QUEUE_SYNC_COMPLETE', 'SUCCESS', undefined, `Synced ${queue.length} items`);
        console.log('[SyncService] Offline attendance synced successfully.');
      }
    }
  } catch (e: any) {
    logDebug('ATTENDANCE', 'ASYNC_QUEUE_SYNC_ERROR', 'FAILURE', undefined, e.message);
    console.warn('[SyncService] Offline attendance sync deferred:', e.message);
  }

  // 2. Sync offline location footprints
  try {
    const keys = await AsyncStorage.getAllKeys();
    const footprintKeys = keys.filter(k => k === 'offlineFootprintsQueue' || k.startsWith('offline_footprints_'));

    for (const key of footprintKeys) {
      const pendingFootprints = await AsyncStorage.getItem(key);
      if (pendingFootprints) {
        const queue = JSON.parse(pendingFootprints);
        if (Array.isArray(queue) && queue.length > 0) {
          logDebug('LOCATION', 'ASYNC_QUEUE_SYNC_START', 'PENDING', undefined, `Key: ${key}, QueueCount: ${queue.length}`);
          console.log(`[SyncService] Syncing ${queue.length} offline footprint locations from ${key} to server...`);
          
          const response = await axios.post(`${API_BASE_URL.replace(/\/$/, '')}/footprints/batch`, { locations: queue });
          if (response.status === 200 || response.status === 201) {
            const uploadedIds: string[] = response.data?.uploadedIds || [];
            if (uploadedIds.length > 0) {
              const remainingQueue = queue.filter((item: any) => !uploadedIds.includes(item.id));
              if (remainingQueue.length > 0) {
                await AsyncStorage.setItem(key, JSON.stringify(remainingQueue));
              } else {
                await AsyncStorage.removeItem(key);
              }
              logDebug('LOCATION', 'ASYNC_QUEUE_SYNC_COMPLETE', 'SUCCESS', undefined, `Uploaded: ${uploadedIds.length}`);
              console.log(`[SyncService] Server ACK confirmed! Cleared ${uploadedIds.length} footprints from ${key}.`);
            } else {
              await AsyncStorage.removeItem(key);
            }
          }
        }
      }
    }
  } catch (e: any) {
    logDebug('LOCATION', 'ASYNC_QUEUE_SYNC_ERROR', 'FAILURE', undefined, e.message);
    console.warn('[SyncService] Offline footprints batch sync deferred:', e.message);
  }

  // 3. Sync offline geotagged photo uploads
  try {
    const { geotagPhotoSyncManager } = require('./GeotagPhotoSyncManager');
    if (geotagPhotoSyncManager && typeof geotagPhotoSyncManager.syncQueue === 'function') {
      logDebug('MEDIA', 'GEOTAG_PHOTO_SYNC_START', 'PENDING', undefined, 'Checking offline geotagged photos...');
      await geotagPhotoSyncManager.syncQueue();
    }
  } catch (photoErr: any) {
    logDebug('MEDIA', 'GEOTAG_PHOTO_SYNC_ERROR', 'FAILURE', undefined, photoErr.message);
    console.warn('[SyncService] Offline geotagged photo sync deferred:', photoErr.message);
  }
};