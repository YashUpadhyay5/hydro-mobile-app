import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import offlinePhotoRepository, { GeotaggedPhotoRecord } from '@/services/OfflinePhotoRepository';
import geotagPhotoSyncManager from '@/services/GeotagPhotoSyncManager';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { getDateLocale } from '@/src/i18n/dateLocale';

interface OfflinePhotoQueueModalProps {
  visible: boolean;
  onClose: () => void;
}

const { width } = Dimensions.get('window');

export default function OfflinePhotoQueueModal({ visible, onClose }: OfflinePhotoQueueModalProps) {
  const { t } = useTranslationSafe(['camera', 'common']);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [items, setItems] = useState<GeotaggedPhotoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      const records = await offlinePhotoRepository.getAllItems();
      setItems(records);
    } catch (e) {
      console.warn('[OfflinePhotoQueueModal] Error loading queue:', e);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      geotagPhotoSyncManager.startListening();
      geotagPhotoSyncManager.syncQueue().catch(() => {});
      loadQueue();
      const unsubscribe = geotagPhotoSyncManager.subscribe(() => {
        loadQueue();
        setIsSyncing(geotagPhotoSyncManager.isSyncing());
      });
      return unsubscribe;
    }
  }, [visible, loadQueue]);

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      const result = await geotagPhotoSyncManager.syncQueue();
      await loadQueue();
      setIsSyncing(false);

      if (result.uploaded > 0) {
        Alert.alert(t('camera:sync_complete', { defaultValue: 'Sync Complete' }), t('camera:sync_uploaded', { defaultValue: 'Successfully uploaded {{count}} photo(s).', count: result.uploaded }));
      } else if (result.failed > 0) {
        Alert.alert(t('camera:sync_partial', { defaultValue: 'Sync Partial' }), t('camera:sync_failed_retry', { defaultValue: '{{count}} photo(s) could not be uploaded. Will retry automatically.', count: result.failed }));
      } else {
        Alert.alert(t('camera:in_sync', { defaultValue: 'In Sync' }), t('camera:all_photos_are_up_to_date', { defaultValue: 'All photos are up to date.' }));
      }
    } catch (e: any) {
      setIsSyncing(false);
      Alert.alert(t('camera:sync_notice', { defaultValue: 'Sync Notice' }), e.message || 'Could not complete sync. Please check your internet connection.');
    }
  };

  const handleRetryItem = async (clientUploadId: string) => {
    await offlinePhotoRepository.retryItem(clientUploadId);
    await loadQueue();
    geotagPhotoSyncManager.syncQueue().catch(() => {});
  };

  const handleDeleteItem = (clientUploadId: string) => {
    Alert.alert(
      t('camera:remove_photo', { defaultValue: 'Remove Photo' }),
      t('camera:are_you_sure_you_want_to', { defaultValue: 'Are you sure you want to remove this pending photo from your local device?' }),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('camera:remove', { defaultValue: 'Remove' }),
          style: 'destructive',
          onPress: async () => {
            await offlinePhotoRepository.deleteItem(clientUploadId);
            await loadQueue();
          },
        },
      ]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return {
          label: t('camera:auto_sync_active_waiting_for_internet', { defaultValue: 'Auto-Sync Active (Waiting for Internet)' }),
          bg: isDark ? '#451A03' : '#FEF3C7',
          color: isDark ? '#FBBF24' : '#D97706',
          icon: 'time-outline' as const,
        };
      case 'UPLOADING':
        return {
          label: t('camera:auto_uploading_to_server', { defaultValue: 'Auto-Uploading to Server...' }),
          bg: isDark ? '#1E3A8A' : '#DBEAFE',
          color: isDark ? '#60A5FA' : '#2563EB',
          icon: 'cloud-upload-outline' as const,
        };
      case 'UPLOADED':
        return {
          label: t('camera:uploaded_to_server', { defaultValue: 'Uploaded to Server' }),
          bg: isDark ? '#064E3B' : '#D1FAE5',
          color: isDark ? '#34D399' : '#059669',
          icon: 'checkmark-circle-outline' as const,
        };
      case 'FAILED':
        return {
          label: t('camera:auto_retrying_when_online', { defaultValue: 'Auto-Retrying when Online' }),
          bg: isDark ? '#4C0519' : '#FEE2E2',
          color: isDark ? '#FB7185' : '#DC2626',
          icon: 'sync-outline' as const,
        };
      default:
        return {
          label: status,
          bg: isDark ? '#1E293B' : '#F3F4F6',
          color: isDark ? '#94A3B8' : '#4B5563',
          icon: 'help-circle-outline' as const,
        };
    }
  };

  const pendingCount = items.filter(i => i.uploadStatus === 'PENDING' || i.uploadStatus === 'FAILED').length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, isDark && { backgroundColor: '#0F172A' }]}>
          {/* Header */}
          <View style={[styles.modalHeader, isDark && { borderBottomColor: '#334155' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, isDark && { color: '#F8FAFC' }]}>{t('camera:offline_photo_uploads', { defaultValue: 'Offline Photo Uploads' })}</Text>
              <Text style={[styles.modalSubtitle, isDark && { color: '#94A3B8' }]}>
                {pendingCount > 0 
                  ? t('camera:auto_sync_active', { defaultValue: '⚡ Auto-Sync Active: {{count}} photo(s) will upload automatically when online', count: pendingCount }) 
                  : t('camera:all_synced', { defaultValue: 'All captured photos are synced with server' })}
              </Text>
            </View>

            <TouchableOpacity 
              style={[styles.closeBtn, isDark && { backgroundColor: '#1E293B' }]} 
              onPress={onClose} 
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color={isDark ? "#F8FAFC" : "#0F172A"} />
            </TouchableOpacity>
          </View>

          {/* Sync Now Bar */}
          <View style={[styles.syncBar, isDark && { borderBottomColor: '#1E293B' }]}>
            <TouchableOpacity
              style={[
                styles.syncBtn, 
                isDark && { backgroundColor: '#2563EB' },
                isSyncing && { opacity: 0.7 }
              ]}
              onPress={handleSyncNow}
              disabled={isSyncing}
              activeOpacity={0.8}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="sync" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.syncBtnText}>
                {isSyncing ? t('camera:auto_synchronizing', { defaultValue: 'Auto-Synchronizing Queue...' }) : t('camera:force_sync_now', { defaultValue: 'Force Sync Now' })}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Items List */}
          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={56} color="#10B981" />
              <Text style={[styles.emptyTitle, isDark && { color: '#F8FAFC' }]}>{t('camera:queue_is_empty', { defaultValue: 'Queue is Empty' })}</Text>
              <Text style={[styles.emptySub, isDark && { color: '#94A3B8' }]}>
                {t('camera:every_geotagged_photo_you_capture_while', { defaultValue: 'Every geotagged photo you capture while offline is safely saved here and automatically uploaded as soon as an internet connection is established.' })}
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.clientUploadId}
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const badge = getStatusBadge(item.uploadStatus);
                const dateStr = new Date(item.capturedAt).toLocaleTimeString(getDateLocale(), {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });
                const fullDateStr = new Date(item.capturedAt).toLocaleDateString(getDateLocale(), {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <View style={[styles.card, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                    <View style={styles.cardRow}>
                      {/* Image Thumbnail */}
                      <Image
                        source={{ uri: item.fileUri }}
                        style={styles.thumbnail}
                        contentFit="cover"
                        transition={150}
                      />

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        {/* Title Row */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.itemTitle, isDark && { color: '#F8FAFC' }]}>Photo #{items.length - index}</Text>
                          <Text style={[styles.itemTime, isDark && { color: '#94A3B8' }]}>{dateStr}</Text>
                        </View>

                        <Text style={[styles.itemDate, isDark && { color: '#64748B' }]}>{fullDateStr}</Text>

                        {/* Coordinates & Accuracy */}
                        <Text style={[styles.itemCoords, isDark && { color: '#38BDF8' }]}>
                          📍 {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)} (±{Math.round(item.accuracy)}m)
                        </Text>

                        {item.address ? (
                          <Text style={[styles.itemAddress, isDark && { color: '#94A3B8' }]} numberOfLines={1}>
                            {item.address}
                          </Text>
                        ) : null}

                        {/* Status Badge */}
                        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                          <Ionicons name={badge.icon} size={12} color={badge.color} style={{ marginRight: 4 }} />
                          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>

                        {item.lastError && item.uploadStatus === 'FAILED' ? (
                          <Text style={styles.errorText} numberOfLines={1}>
                            {item.lastError}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Action Bar for Pending / Failed items */}
                    {(item.uploadStatus === 'FAILED' || item.uploadStatus === 'PENDING') && (
                      <View style={[styles.cardActions, isDark && { borderTopColor: '#334155' }]}>
                        <TouchableOpacity
                          style={[styles.retryBtn, isDark && { backgroundColor: '#1E3A8A' }]}
                          onPress={() => handleRetryItem(item.clientUploadId)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="refresh-outline" size={14} color={isDark ? "#93C5FD" : "#2563EB"} />
                          <Text style={[styles.retryBtnText, isDark && { color: '#93C5FD' }]}>{t('camera:retry_now', { defaultValue: 'Retry Now' })}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.deleteBtn, isDark && { backgroundColor: '#4C0519' }]}
                          onPress={() => handleDeleteItem(item.clientUploadId)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={14} color={isDark ? "#FB7185" : "#DC2626"} />
                          <Text style={[styles.deleteBtnText, isDark && { color: '#FB7185' }]}>{t('camera:remove', { defaultValue: 'Remove' })}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  syncBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardRow: {
    flexDirection: 'row',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemTime: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  itemDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  itemCoords: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    marginTop: 4,
  },
  itemAddress: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 10,
    color: '#DC2626',
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
});
