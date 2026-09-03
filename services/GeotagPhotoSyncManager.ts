import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform, AppState, AppStateStatus } from 'react-native';
import axios from 'axios';
import { API_BASE_URL } from '@/constants/API';
import offlinePhotoRepository, { GeotaggedPhotoRecord } from './OfflinePhotoRepository';

type QueueChangeListener = () => void;

class GeotagPhotoSyncManager {
  private isSyncRunning = false;
  private isListening = false;
  private listeners: Set<QueueChangeListener> = new Set();
  private appStateSubscription: any = null;
  private networkSubscription: any = null;
  private pollTimer: any = null;
  private retryTimers: any[] = [];

  /**
   * Initializes real-time triggers: Network state changes, App foreground events,
   * and an active polling loop that continuously syncs whenever internet is available.
   */
  startListening(): void {
    if (this.isListening) return;
    this.isListening = true;

    // 1. App foreground listener: trigger sync when user switches back to app
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[GeotagPhotoSyncManager] App resumed to foreground, triggering automatic queue sync...');
        this.syncQueue().catch(() => {});
      }
    });

    // 2. Network state listener: triggers instantly when Wi-Fi/Cellular reconnects
    if (Platform.OS !== 'web' && Network.addNetworkStateListener) {
      try {
        this.networkSubscription = Network.addNetworkStateListener((state) => {
          if (state.isConnected) {
            console.log('[GeotagPhotoSyncManager] Network connection restored! Triggering immediate sync...');
            this.syncQueue().catch(() => {});

            // Android DNS resolution fallback: re-trigger after 2s and 5s in case DNS takes a moment
            const timer1 = setTimeout(() => this.syncQueue().catch(() => {}), 2000);
            const timer2 = setTimeout(() => this.syncQueue().catch(() => {}), 5000);
            this.retryTimers.push(timer1, timer2);
          }
        });
      } catch (netErr: any) {
        console.warn('[GeotagPhotoSyncManager] Network listener warning:', netErr.message);
      }
    }

    // 3. Active auto-sync poll interval (every 5 seconds)
    // Ensures that photos taken offline are synced automatically as soon as connectivity returns
    // even if the OS-level event was missed or internet was restored without a network reconnect.
    this.pollTimer = setInterval(async () => {
      try {
        const stats = await offlinePhotoRepository.getStats();
        const hasUnsynced = stats.pending > 0 || stats.uploading > 0 || stats.failed > 0;
        if (hasUnsynced && !this.isSyncRunning) {
          const netState = await Network.getNetworkStateAsync();
          if (netState.isConnected) {
            console.log(`[GeotagPhotoSyncManager] Auto-sync detected ${stats.pending + stats.failed} pending photo(s) with active internet. Syncing now...`);
            await this.syncQueue();
          }
        }
      } catch (e: any) {
        // Silently catch polling errors to avoid log spam
      }
    }, 5000);

    console.log('[GeotagPhotoSyncManager] Auto-sync listeners & 5s polling engine registered.');
    // Trigger initial sync check
    this.syncQueue().catch(() => {});
  }

  /**
   * Manually kick off an immediate sync check (e.g. immediately after saving an offline photo).
   */
  triggerImmediateCheck(): void {
    if (!this.isListening) {
      this.startListening();
    }
    this.syncQueue().catch(() => {});
  }

  stopListening(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.networkSubscription && typeof this.networkSubscription.remove === 'function') {
      this.networkSubscription.remove();
      this.networkSubscription = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.retryTimers.forEach(t => clearTimeout(t));
    this.retryTimers = [];
    this.isListening = false;
  }

  subscribe(listener: QueueChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(fn => {
      try {
        fn();
      } catch (e) {}
    });
  }

  /**
   * Synchronizes the offline geotagged photo queue sequentially with idempotency.
   */
  async syncQueue(): Promise<{ uploaded: number; failed: number }> {
    if (this.isSyncRunning) {
      console.log('[GeotagPhotoSyncManager] Sync already running. Skipping concurrent trigger.');
      return { uploaded: 0, failed: 0 };
    }

    // 1. Check network connectivity
    try {
      const netState = await Network.getNetworkStateAsync();
      if (!netState.isConnected) {
        console.log('[GeotagPhotoSyncManager] Device is offline. Auto-sync waiting for internet connection...');
        return { uploaded: 0, failed: 0 };
      }
    } catch (netErr: any) {
      console.warn('[GeotagPhotoSyncManager] Network check failed:', netErr.message);
      return { uploaded: 0, failed: 0 };
    }

    this.isSyncRunning = true;
    let uploadedCount = 0;
    let failedCount = 0;

    try {
      const pendingQueue = await offlinePhotoRepository.getPendingQueue();
      if (pendingQueue.length === 0) {
        return { uploaded: 0, failed: 0 };
      }

      console.log(`[GeotagPhotoSyncManager] Auto-sync processing ${pendingQueue.length} pending geotagged photo(s)...`);

      for (const record of pendingQueue) {
        const success = await this.uploadSingleRecord(record);
        if (success) {
          uploadedCount++;
        } else {
          failedCount++;
        }
        this.notifyListeners();
      }
    } catch (globalErr: any) {
      console.error('[GeotagPhotoSyncManager] Global sync error:', globalErr.message);
    } finally {
      this.isSyncRunning = false;
      this.notifyListeners();
    }

    return { uploaded: uploadedCount, failed: failedCount };
  }

  private async uploadSingleRecord(record: GeotaggedPhotoRecord): Promise<boolean> {
    const { clientUploadId, fileUri, userId, userName, latitude, longitude, accuracy, altitude, address, capturedAt } = record;

    console.log(`[GeotagPhotoSyncManager] Uploading record: clientUploadId=${clientUploadId}, user=${userName} (${userId})`);

    // Verify local file exists on disk
    if (Platform.OS !== 'web' && fileUri.startsWith('file://')) {
      try {
        if ((FileSystem as any).getInfoAsync) {
          const info = await (FileSystem as any).getInfoAsync(fileUri);
          if (!info.exists) {
            console.error(`[GeotagPhotoSyncManager] Local file missing on disk: ${fileUri}`);
            await offlinePhotoRepository.updateStatus(clientUploadId, 'FAILED', {
              lastError: 'Local image file not found on device storage'
            });
            return false;
          }
        }
      } catch (e: any) {
        console.warn(`[GeotagPhotoSyncManager] File check warning:`, e.message);
      }
    }

    // Mark as UPLOADING
    await offlinePhotoRepository.updateStatus(clientUploadId, 'UPLOADING');
    this.notifyListeners();

    try {
      const formData = new FormData();
      const filename = `geo_${clientUploadId}.jpg`;
      const mimeType = 'image/jpeg';

      if (Platform.OS === 'web') {
        const fetchRes = await fetch(fileUri);
        const blob = await fetchRes.blob();
        formData.append('file', blob, filename);
      } else {
        const decodedUri = decodeURIComponent(fileUri);
        // @ts-ignore
        formData.append('file', {
          uri: decodedUri,
          name: filename,
          type: mimeType
        });
      }

      formData.append('userId', userId);
      formData.append('userName', userName);
      formData.append('latitude', String(latitude));
      formData.append('longitude', String(longitude));
      formData.append('accuracy', String(accuracy || 0));
      if (altitude !== undefined && altitude !== null) {
        formData.append('altitude', String(altitude));
      }
      if (address) {
        formData.append('address', address);
      }
      formData.append('capturedAt', String(capturedAt));
      formData.append('clientUploadId', clientUploadId);
      formData.append('mediaType', 'image');
      formData.append('timestamp', String(capturedAt));
      formData.append('date', new Date(capturedAt).toISOString().split('T')[0]);

      const targetUrl = `${API_BASE_URL.replace(/\/$/, '')}/media`;
      const token = await SecureStore.getItemAsync('userToken');
      const headers: Record<string, string> = {
        'Content-Type': 'multipart/form-data',
        'Accept': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await axios.post(targetUrl, formData, {
        headers,
        timeout: 30000 // 30s timeout for large uploads
      });

      if (response.status === 200 || response.status === 201) {
        const serverId = response.data?.id || response.data?.photoId;
        console.log(`[GeotagPhotoSyncManager] Upload verified by server! Server ID: ${serverId}, clientUploadId: ${clientUploadId}`);
        await offlinePhotoRepository.markUploadedAndCleanup(clientUploadId, serverId);
        return true;
      } else {
        throw new Error(`Unexpected server response: HTTP ${response.status}`);
      }
    } catch (uploadErr: any) {
      const status = uploadErr.response?.status;
      const errorMsg = uploadErr.response?.data?.error || uploadErr.message || 'Network upload failed';

      console.warn(`[GeotagPhotoSyncManager] Upload failed for ${clientUploadId} (Status: ${status || 'Network Error'}):`, errorMsg);

      if (status === 401 || status === 403) {
        // Authentication failure: keep in PENDING and pause sync loop
        await offlinePhotoRepository.updateStatus(clientUploadId, 'PENDING', {
          lastError: 'Authentication expired. Please log in again.'
        });
        return false;
      } else if (status === 400) {
        // Permanent format/validation error: mark FAILED
        await offlinePhotoRepository.updateStatus(clientUploadId, 'FAILED', {
          lastError: `Validation rejected: ${errorMsg}`
        });
        return false;
      } else {
        // Transient error (5xx, timeout, network disconnect): increment retry with exponential backoff
        await offlinePhotoRepository.incrementRetry(clientUploadId, errorMsg);
        return false;
      }
    }
  }

  isSyncing(): boolean {
    return this.isSyncRunning;
  }
}

export const geotagPhotoSyncManager = new GeotagPhotoSyncManager();
export default geotagPhotoSyncManager;
