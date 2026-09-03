import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Platform, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Ionicons } from '@expo/vector-icons';
import { LeafletMap } from '@/components/LeafletMap';

import { useAuth } from '@/context/AuthContext';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { API_BASE_URL } from '@/constants/API';
import AdminGallery from '@/components/GeotagCamera/AdminGallery';
import CommunicationDashboard from '@/components/Communication/CommunicationDashboard';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

import * as Network from 'expo-network';
import offlinePhotoRepository, { GeotaggedPhotoRecord } from '@/services/OfflinePhotoRepository';
import geotagPhotoSyncManager from '@/services/GeotagPhotoSyncManager';
import OfflinePhotoQueueModal from '@/components/GeotagCamera/OfflinePhotoQueueModal';

// Default export renders Communication Dashboard
export default function CommunicationScreen() {
  return <CommunicationDashboard />;
}

// Standalone Geotag Camera Screen exported for Card 1 reuse
export function GeotagCameraScreen() {
  const { user } = useAuth();
  const { t } = useTranslationSafe(['camera', 'common', 'permissions']);
  const colorScheme = useColorScheme();
  const isAdmin = user?.role === 'ADMIN';
  const isDark = colorScheme === 'dark';

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy?: number; altitude?: number | null; address?: string } | null>(null);
  const [currentClientUploadId, setCurrentClientUploadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isQueueModalVisible, setIsQueueModalVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const updateQueueCount = React.useCallback(async () => {
    try {
      const stats = await offlinePhotoRepository.getStats();
      setPendingCount(stats.pending + stats.failed);
    } catch (e) {}
  }, []);

  React.useEffect(() => {
    geotagPhotoSyncManager.startListening();
    updateQueueCount();
    geotagPhotoSyncManager.syncQueue().catch(() => {});
    const unsubscribe = geotagPhotoSyncManager.subscribe(() => {
      updateQueueCount();
    });
    return () => {
      unsubscribe();
    };
  }, [updateQueueCount]);

  if (isAdmin) {
    return <AdminGallery />;
  }

  const notify = (title: string, message: string, onPressAction?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
      if (onPressAction) onPressAction();
    } else {
      Alert.alert(title, message, onPressAction ? [{ text: t('common:ok', { defaultValue: 'OK' }), onPress: onPressAction }] : undefined);
    }
  };

  const takePhoto = async () => {
    try {
      setLoading(true);

      const cameraPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraPerm.status !== ImagePicker.PermissionStatus.GRANTED) {
        notify(t('permissions:denied_title', { defaultValue: 'Permission Denied' }), t('permissions:camera_required', { defaultValue: 'Camera access is required to take geotagged photos.' }));
        setLoading(false);
        return;
      }

      const locationPerm = await Location.requestForegroundPermissionsAsync();
      if (locationPerm.status !== Location.PermissionStatus.GRANTED) {
        notify(t('permissions:denied_title', { defaultValue: 'Permission Denied' }), t('permissions:location_required', { defaultValue: 'Location access is required to geotag your photos.' }));
        setLoading(false);
        return;
      }

      // 1. Acquire GPS location directly from hardware sensors (zero internet dependency)
      let locCoords: any = null;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        locCoords = loc.coords;
      } catch (highErr) {
        console.warn("[GeotagCamera] High accuracy failed, fallback to balanced:", highErr);
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        locCoords = loc.coords;
      }

      let addressStr: string | undefined = undefined;
      try {
        const geocode = await Location.reverseGeocodeAsync({
          latitude: locCoords.latitude,
          longitude: locCoords.longitude
        });
        if (geocode && geocode.length > 0) {
          const first = geocode[0];
          addressStr = [first.name, first.street, first.city, first.region].filter(Boolean).join(', ');
        }
      } catch (e) {
        console.warn("[GeotagCamera] Reverse geocode notice (offline/timeout):", e);
      }

      // 2. Launch Camera to capture photo
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: false, 
        quality: 0.7,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        const clientUploadId = `geo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 3. Persist photo and GPS metadata immediately to local offline repository
        const savedRecord = await offlinePhotoRepository.savePendingPhoto({
          tempFileUri: uri,
          clientUploadId,
          userId: user?.empCode || user?.id || 'employee',
          userName: user?.name || 'Employee',
          latitude: locCoords.latitude,
          longitude: locCoords.longitude,
          accuracy: locCoords.accuracy || 10,
          altitude: locCoords.altitude || null,
          heading: locCoords.heading || null,
          speed: locCoords.speed || null,
          address: addressStr,
          capturedAt: Date.now()
        });

        setImageUri(savedRecord.fileUri);
        setCurrentClientUploadId(clientUploadId);
        setLocation({
          latitude: locCoords.latitude,
          longitude: locCoords.longitude,
          accuracy: locCoords.accuracy || 10,
          altitude: locCoords.altitude || null,
          address: addressStr
        });

        await updateQueueCount();
      }
    } catch (error: any) {
      console.error("Camera error:", error);
      notify(t('common:error', { defaultValue: "Error" }), t('camera:err_take_photo', { defaultValue: "Could not take photo. Please try again." }));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!imageUri || !location || !currentClientUploadId) {
      notify(t('common:error', { defaultValue: "Missing Data" }), t('camera:missing_photo_data', { defaultValue: "Please take a photo with location data first." }));
      return;
    }

    try {
      setUploading(true);

      // Check current network status
      const netState = await Network.getNetworkStateAsync();
      const isOnline = !!netState.isConnected;

      if (!isOnline) {
        // Safe offline flow: photo is already saved in repository!
        setImageUri(null);
        setImageBase64(null);
        setLocation(null);
        setCurrentClientUploadId(null);
        await updateQueueCount();

        // Ensure auto-sync is actively listening and will upload automatically upon reconnection
        geotagPhotoSyncManager.triggerImmediateCheck();

        notify(
          "Photo Saved Offline",
          "Photo saved offline. It will automatically upload to the server as soon as internet connection returns."
        );
        return;
      }

      // Online flow: Trigger immediate synchronization
      const result = await geotagPhotoSyncManager.syncQueue();
      await updateQueueCount();

      setImageUri(null);
      setImageBase64(null);
      setLocation(null);
      setCurrentClientUploadId(null);

      if (result.uploaded > 0) {
        notify(
          t('common:success', { defaultValue: 'Success' }),
          t('camera:upload_success', { defaultValue: 'Geotagged photo uploaded successfully!' })
        );
      } else {
        geotagPhotoSyncManager.triggerImmediateCheck();
        notify(
          "Saved Offline",
          "Photo saved offline. It will automatically upload as soon as internet connection is stable."
        );
      }
    } catch (err: any) {
      console.error("[GeotagCamera] Upload flow exception:", err.message);
      geotagPhotoSyncManager.triggerImmediateCheck();
      notify(
        "Saved Offline",
        "Photo saved offline. It will automatically upload as soon as internet connection returns."
      );
      setImageUri(null);
      setImageBase64(null);
      setLocation(null);
      setCurrentClientUploadId(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>{t('camera:geotag_title', { defaultValue: 'Geotagged Photo Capture' })}</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
            Offline-Ready • Auto-Sync
          </Text>
        </View>

        {/* Offline Queue Badge Button */}
        <TouchableOpacity
          style={[styles.queueButton, pendingCount > 0 && styles.queueButtonActive]}
          onPress={() => setIsQueueModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={pendingCount > 0 ? "cloud-upload" : "checkmark-circle"}
            size={16}
            color={pendingCount > 0 ? "#D97706" : "#10B981"}
          />
          <Text style={[styles.queueButtonText, pendingCount > 0 && { color: '#D97706', fontWeight: '700' }]}>
            {pendingCount > 0 ? `${pendingCount} Offline` : 'Queue (0)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Offline Status Alert Banner if pending photos exist */}
      {pendingCount > 0 && (
        <TouchableOpacity 
          style={styles.offlineBanner}
          onPress={() => setIsQueueModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="time-outline" size={16} color="#D97706" />
          <Text style={styles.offlineBannerText}>
            {pendingCount} photo(s) saved offline. Tap to view queue.
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#D97706" />
        </TouchableOpacity>
      )}
      
      <View style={styles.content}>
        {imageUri ? (
          <View style={styles.previewContainer}>
            <View style={styles.imageWrapper}>
              <Image 
                source={{ uri: imageBase64 || imageUri }} 
                style={styles.previewImage} 
                resizeMode="cover" 
              />
              {location && (
                <View style={styles.locationOverlay}>
                  <View style={styles.gpsBadge}>
                    <IconSymbol name="location.fill" size={10} color="#facc15" />
                    <Text style={styles.gpsBadgeText}>GPS Map Camera (Offline Verified)</Text>
                  </View>

                  <View style={styles.mapContainer}>
                    {Platform.OS !== 'web' ? (
                      <LeafletMap 
                        style={styles.miniMap}
                        initialRegion={{
                          latitude: location.latitude,
                          longitude: location.longitude,
                          latitudeDelta: 0.005,
                          longitudeDelta: 0.005,
                        }}
                        markers={[{ latitude: location.latitude, longitude: location.longitude }]}
                      />
                    ) : (
                      <View style={[styles.miniMap, { backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' }]}>
                        <IconSymbol name="location.fill" size={24} color="#94a3b8" />
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.locationTextContainer}>
                    <Text style={styles.locationTitle}>
                      {location.address ? location.address.split(',')[0] : 'GPS Fixed'} 🇮🇳
                    </Text>
                    <Text style={styles.locationAddressText}>
                      {location.address || `Coordinates: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}
                    </Text>
                    <Text style={styles.locationSubText}>
                      Lat {location.latitude.toFixed(5)}° Long {location.longitude.toFixed(5)}° (±{Math.round(location.accuracy || 10)}m)
                    </Text>
                    <Text style={styles.locationSubText}>
                      {`${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]}, ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})} GMT+05:30`}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.button, styles.retakeButton]} 
                onPress={async () => {
                  if (currentClientUploadId) {
                    await offlinePhotoRepository.deleteItem(currentClientUploadId);
                    await updateQueueCount();
                  }
                  setImageUri(null);
                  setImageBase64(null);
                  setLocation(null);
                  setCurrentClientUploadId(null);
                }}
                disabled={uploading}
              >
                <Text style={styles.buttonText}>{t('camera:retake', { defaultValue: 'Retake' })}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.button, styles.uploadButton, uploading && styles.disabledButton]} 
                onPress={handleSubmit}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>{t('camera:upload_btn', { defaultValue: 'Save & Upload Photo' })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.uploadCard, isDark && styles.uploadCardDark]}>
            <View style={styles.iconContainer}>
              <IconSymbol name="camera.fill" size={48} color="#0F172A" />
            </View>
            <Text style={[styles.uploadTitle, isDark && styles.textDark]}>
              {t('camera:capture_title', { defaultValue: 'Capture Geotagged Photo' })}
            </Text>
            <Text style={[styles.uploadSubtitle, isDark && styles.textDarkSub]}>
              {t('camera:capture_subtitle', { defaultValue: 'Take a picture at your current location. The photo will be automatically saved offline and uploaded whenever internet is available.' })}
            </Text>
            <TouchableOpacity 
              style={[styles.button, styles.cameraButton, loading && styles.disabledButton]} 
              onPress={takePhoto}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>📸 {t('camera:open_camera', { defaultValue: 'Open Camera' })}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Offline Queue Modal */}
      <OfflinePhotoQueueModal
        visible={isQueueModalVisible}
        onClose={() => setIsQueueModalVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerDark: {
    backgroundColor: '#1e1e1e',
    borderBottomColor: '#333333',
  },
  queueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  queueButtonActive: {
    backgroundColor: '#FEF3C7',
  },
  queueButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    gap: 8,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    fontFamily: Fonts.rounded,
  },
  textDark: {
    color: '#ffffff',
  },
  textDarkSub: {
    color: '#aaaaaa',
  },
  content: {
    padding: 20,
  },
  previewContainer: {
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    height: 450,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  locationOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    padding: 12,
    flexDirection: 'row',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  mapContainer: {
    width: 90,
    height: 90,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  miniMap: {
    flex: 1,
  },
  locationTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  locationTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  locationAddressText: {
    color: '#e2e8f0',
    fontSize: 12,
    marginBottom: 4,
    lineHeight: 16,
  },
  locationSubText: {
    color: '#cbd5e1',
    fontSize: 10,
    marginBottom: 2,
  },
  gpsBadge: {
    position: 'absolute',
    top: -24,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  gpsBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#1e293b',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButton: {
    backgroundColor: '#0F172A',
    marginTop: 20,
  },
  retakeButton: {
    backgroundColor: '#ef4444',
    flex: 1,
    marginRight: 10,
  },
  uploadButton: {
    backgroundColor: '#10b981',
    flex: 2,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  uploadCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 20,
  },
  uploadCardDark: {
    backgroundColor: '#1e293b',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  uploadTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    textAlign: 'center',
  },
  uploadSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 20,
  },
});
