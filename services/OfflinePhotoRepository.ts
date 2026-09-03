import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type PhotoUploadStatus = 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';

export interface GeotaggedPhotoRecord {
  id: string;
  clientUploadId: string;
  userId: string;
  userName: string;
  fileUri: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  address?: string | null;
  capturedAt: number;
  createdAt: number;
  uploadStatus: PhotoUploadStatus;
  retryCount: number;
  lastAttemptAt?: number | null;
  lastError?: string | null;
  serverId?: string | null;
}

const STORAGE_KEY = '@geotagged_photo_uploads_queue';

const getUploadsDir = (): string => {
  if (Platform.OS === 'web') return '';
  const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).Paths?.document?.uri || (FileSystem as any).cacheDirectory || '';
  return baseDir ? `${baseDir.replace(/\/+$/, '')}/geotagged_uploads/` : '';
};

class OfflinePhotoRepository {
  private isInitialized = false;
  private memoryCache: GeotaggedPhotoRecord[] | null = null;

  /**
   * Initializes storage directory and recovers stale UPLOADING states from app crashes.
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const uploadsDir = getUploadsDir();
      if (Platform.OS !== 'web' && uploadsDir && (FileSystem as any).getInfoAsync) {
        const dirInfo = await (FileSystem as any).getInfoAsync(uploadsDir);
        if (!dirInfo.exists && (FileSystem as any).makeDirectoryAsync) {
          await (FileSystem as any).makeDirectoryAsync(uploadsDir, { intermediates: true });
          console.log('[OfflinePhotoRepository] Created local directory:', uploadsDir);
        }
      }

      // Recover stale 'UPLOADING' records back to 'PENDING' (crash resilience)
      const records = await this.loadFromStorage();
      let hasChanges = false;

      const recoveredRecords = records.map(record => {
        if (record.uploadStatus === 'UPLOADING') {
          hasChanges = true;
          return {
            ...record,
            uploadStatus: 'PENDING' as PhotoUploadStatus,
            lastError: record.lastError || 'Interrupted by app restart'
          };
        }
        return record;
      });

      if (hasChanges) {
        await this.persistToStorage(recoveredRecords);
        console.log('[OfflinePhotoRepository] Recovered stale UPLOADING records to PENDING state.');
      }

      this.memoryCache = recoveredRecords;
      this.isInitialized = true;
      console.log(`[OfflinePhotoRepository] Initialized with ${recoveredRecords.length} records.`);
    } catch (err: any) {
      console.error('[OfflinePhotoRepository] Initialization error:', err.message);
    }
  }

  /**
   * Saves a newly captured geotagged photo to local file storage and persists metadata.
   */
  async savePendingPhoto(params: {
    tempFileUri: string;
    clientUploadId: string;
    userId: string;
    userName: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude?: number | null;
    heading?: number | null;
    speed?: number | null;
    address?: string | null;
    capturedAt?: number;
  }): Promise<GeotaggedPhotoRecord> {
    await this.init();

    const clientUploadId = params.clientUploadId;
    let permanentFileUri = params.tempFileUri;

    // In native environments, copy from temporary cache into persistent document directory
    const uploadsDir = getUploadsDir();
    if (Platform.OS !== 'web' && uploadsDir) {
      const targetFilename = `geo_${clientUploadId}.jpg`;
      permanentFileUri = `${uploadsDir}${targetFilename}`;

      try {
        if ((FileSystem as any).copyAsync) {
          await (FileSystem as any).copyAsync({
            from: params.tempFileUri,
            to: permanentFileUri
          });
          console.log('[OfflinePhotoRepository] Saved photo locally to permanent path:', permanentFileUri);
        }
      } catch (copyErr: any) {
        console.warn('[OfflinePhotoRepository] File copy failed, retaining original temp URI:', copyErr.message);
        permanentFileUri = params.tempFileUri;
      }
    }

    const timestamp = params.capturedAt || Date.now();
    const newRecord: GeotaggedPhotoRecord = {
      id: `geo_rec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      clientUploadId,
      userId: params.userId,
      userName: params.userName,
      fileUri: permanentFileUri,
      latitude: params.latitude,
      longitude: params.longitude,
      accuracy: params.accuracy,
      altitude: params.altitude || null,
      heading: params.heading || null,
      speed: params.speed || null,
      address: params.address || null,
      capturedAt: timestamp,
      createdAt: Date.now(),
      uploadStatus: 'PENDING',
      retryCount: 0,
      lastAttemptAt: null,
      lastError: null,
      serverId: null
    };

    const currentRecords = await this.loadFromStorage();
    currentRecords.push(newRecord);
    await this.persistToStorage(currentRecords);

    console.log(`[OfflinePhotoRepository] Queued new photo: ID=${newRecord.id}, clientUploadId=${clientUploadId}`);
    return newRecord;
  }

  /**
   * Retrieves all items needing upload ordered chronologically.
   * Ensures all un-uploaded photos are returned so auto-sync uploads them automatically when internet returns.
   */
  async getPendingQueue(): Promise<GeotaggedPhotoRecord[]> {
    await this.init();
    const records = await this.loadFromStorage();
    return records
      .filter(r => r.uploadStatus !== 'UPLOADED')
      .sort((a, b) => a.capturedAt - b.capturedAt);
  }

  /**
   * Retrieves all records regardless of status for UI display.
   */
  async getAllItems(): Promise<GeotaggedPhotoRecord[]> {
    await this.init();
    const records = await this.loadFromStorage();
    return records.sort((a, b) => b.capturedAt - a.capturedAt);
  }

  /**
   * Updates status of a specific photo upload by clientUploadId.
   */
  async updateStatus(
    clientUploadId: string,
    status: PhotoUploadStatus,
    extra?: { serverId?: string; lastError?: string }
  ): Promise<void> {
    await this.init();
    const records = await this.loadFromStorage();
    const index = records.findIndex(r => r.clientUploadId === clientUploadId);

    if (index !== -1) {
      records[index] = {
        ...records[index],
        uploadStatus: status,
        lastAttemptAt: Date.now(),
        ...(extra?.serverId ? { serverId: extra.serverId } : {}),
        ...(extra?.lastError !== undefined ? { lastError: extra.lastError } : {})
      };

      await this.persistToStorage(records);
      console.log(`[OfflinePhotoRepository] Status updated for ${clientUploadId} -> ${status}`);
    }
  }

  /**
   * Increments retry count on temporary failure with error message.
   * Keeps uploadStatus as PENDING so that the background engine automatically syncs as soon as connection is back.
   */
  async incrementRetry(clientUploadId: string, errorMessage: string): Promise<void> {
    await this.init();
    const records = await this.loadFromStorage();
    const index = records.findIndex(r => r.clientUploadId === clientUploadId);

    if (index !== -1) {
      const newRetryCount = records[index].retryCount + 1;

      records[index] = {
        ...records[index],
        retryCount: newRetryCount,
        uploadStatus: 'PENDING',
        lastAttemptAt: Date.now(),
        lastError: errorMessage
      };

      await this.persistToStorage(records);
      console.log(`[OfflinePhotoRepository] Incremented retry for ${clientUploadId}: count=${newRetryCount}, status=PENDING`);
    }
  }

  /**
   * Handles successful upload confirmation: marks UPLOADED and safely unlinks local file.
   */
  async markUploadedAndCleanup(clientUploadId: string, serverId?: string): Promise<void> {
    await this.init();
    const records = await this.loadFromStorage();
    const index = records.findIndex(r => r.clientUploadId === clientUploadId);

    if (index !== -1) {
      const record = records[index];
      record.uploadStatus = 'UPLOADED';
      record.serverId = serverId || record.serverId;
      record.lastAttemptAt = Date.now();
      record.lastError = null;

      // Safe local file deletion after verified confirmation
      if (Platform.OS !== 'web' && record.fileUri && record.fileUri.startsWith('file://')) {
        try {
          if ((FileSystem as any).getInfoAsync && (FileSystem as any).deleteAsync) {
            const fileInfo = await (FileSystem as any).getInfoAsync(record.fileUri);
            if (fileInfo.exists) {
              await (FileSystem as any).deleteAsync(record.fileUri, { idempotent: true });
              console.log('[OfflinePhotoRepository] Cleaned up uploaded local image file:', record.fileUri);
            }
          }
        } catch (delErr: any) {
          console.warn('[OfflinePhotoRepository] Failed to delete local image file (kept in db as UPLOADED):', delErr.message);
        }
      }

      await this.persistToStorage(records);
    }
  }

  /**
   * Resets a FAILED item back to PENDING so user can retry upload.
   */
  async retryItem(clientUploadId: string): Promise<void> {
    await this.init();
    const records = await this.loadFromStorage();
    const index = records.findIndex(r => r.clientUploadId === clientUploadId);

    if (index !== -1) {
      records[index].uploadStatus = 'PENDING';
      records[index].retryCount = 0;
      records[index].lastError = null;
      await this.persistToStorage(records);
      console.log(`[OfflinePhotoRepository] Reset ${clientUploadId} to PENDING for user retry.`);
    }
  }

  /**
   * Deletes a record from the queue and removes local file.
   */
  async deleteItem(clientUploadId: string): Promise<void> {
    await this.init();
    const records = await this.loadFromStorage();
    const target = records.find(r => r.clientUploadId === clientUploadId);

    if (target && Platform.OS !== 'web' && target.fileUri && target.fileUri.startsWith('file://')) {
      try {
        if ((FileSystem as any).deleteAsync) {
          await (FileSystem as any).deleteAsync(target.fileUri, { idempotent: true });
        }
      } catch (e) {}
    }

    const updated = records.filter(r => r.clientUploadId !== clientUploadId);
    await this.persistToStorage(updated);
    console.log(`[OfflinePhotoRepository] Deleted item ${clientUploadId} from repository.`);
  }

  /**
   * Returns queue statistics for badges and progress UI.
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    uploading: number;
    uploaded: number;
    failed: number;
  }> {
    await this.init();
    const records = await this.loadFromStorage();
    return {
      total: records.length,
      pending: records.filter(r => r.uploadStatus === 'PENDING').length,
      uploading: records.filter(r => r.uploadStatus === 'UPLOADING').length,
      uploaded: records.filter(r => r.uploadStatus === 'UPLOADED').length,
      failed: records.filter(r => r.uploadStatus === 'FAILED').length
    };
  }

  private async loadFromStorage(): Promise<GeotaggedPhotoRecord[]> {
    try {
      const dataStr = await AsyncStorage.getItem(STORAGE_KEY);
      if (!dataStr) return [];
      const parsed = JSON.parse(dataStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[OfflinePhotoRepository] Storage read error:', e);
      return [];
    }
  }

  private async persistToStorage(records: GeotaggedPhotoRecord[]): Promise<void> {
    try {
      this.memoryCache = records;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error('[OfflinePhotoRepository] Storage write error:', e);
    }
  }
}

export const offlinePhotoRepository = new OfflinePhotoRepository();
export default offlinePhotoRepository;
