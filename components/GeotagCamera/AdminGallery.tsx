import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Modal, RefreshControl, Dimensions, Platform, Alert } from 'react-native';
import { Image } from 'expo-image';
import axios from 'axios';
import { API_BASE_URL } from '@/constants/API';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

export default function AdminGallery() {
  const { t } = useTranslationSafe(['camera', 'common']);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
  
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const fetchMedia = async () => {
    try {
      setLoadingMedia(true);
      const dateStr = date.toISOString().split('T')[0];
      const res = await axios.get(`${API_BASE_URL}/media?date=${dateStr}`);
      if (Array.isArray(res.data)) {
        setMediaItems(res.data);
      }
    } catch (err: any) {
      console.warn("Failed to fetch media list:", err.message);
    } finally {
      setLoadingMedia(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, [date]);

  const handleDelete = async (id: string) => {
    Alert.alert(
      t('camera:delete_photo_title', { defaultValue: "Delete Photo" }),
      t('camera:delete_photo_confirm', { defaultValue: "Are you sure you want to delete this photo?" }),
      [
        { text: t('common:cancel', { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t('common:delete', { defaultValue: "Delete" }),
          style: "destructive",
          onPress: async () => {
            try {
              await axios.delete(`${API_BASE_URL}/media/${id}`);
              setMediaItems(prev => prev.filter(item => (item.id || item._id) !== id));
              setSelectedPhoto(null);
            } catch (err: any) {
              Alert.alert(t('common:error', { defaultValue: "Error" }), t('camera:err_delete_photo', { defaultValue: "Failed to delete photo." }));
              console.error("Delete media error:", err);
            }
          }
        }
      ]
    );
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.header, isDark && styles.headerDark]}>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>{t('camera:gallery_title', { defaultValue: 'Geotagged Photo Gallery' })}</Text>
      </View>

      <View style={styles.datePickerContainer}>
        <TouchableOpacity style={styles.navBtn} onPress={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d); }}>
          <Text style={styles.btnText}>◀</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dateDisplay} onPress={() => { if (Platform.OS !== 'web') setShowPicker(true); }}>
          <Text style={styles.dateText}>{date.toLocaleDateString()}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d); }}>
          <Text style={styles.btnText}>▶</Text>
        </TouchableOpacity>
      </View>

      {showPicker && Platform.OS !== 'web' && (
        <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} />
      )}

      {loadingMedia && mediaItems.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={mediaItems}
          keyExtractor={(item) => item.id || item._id}
          numColumns={2}
          contentContainerStyle={styles.galleryContainer}
          columnWrapperStyle={styles.galleryRow}
          refreshControl={
            <RefreshControl refreshing={loadingMedia} onRefresh={fetchMedia} colors={['#007AFF']} />
          }
          renderItem={({ item }) => {
            const serverUrl = API_BASE_URL.replace('/api', '');
            
            let imgUrl = item.cloudinaryUrl;
            if (!imgUrl) {
               const safeFilePath = item.filePath ? item.filePath.replace(/\\/g, '/') : '';
               imgUrl = safeFilePath.startsWith('http') ? safeFilePath : `${serverUrl}/${safeFilePath.startsWith('/') ? safeFilePath.substring(1) : safeFilePath}`;
            }

            const dateStr = new Date(Number(item.timestamp)).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <TouchableOpacity 
                style={[styles.galleryCard, isDark && styles.cardDark]} 
                onPress={() => setSelectedPhoto(item)}
                activeOpacity={0.8}
              >
                <Image 
                  source={{ uri: imgUrl }} 
                  style={styles.galleryImage} 
                  contentFit="cover" 
                  cachePolicy="memory-disk"
                  transition={200}
                />
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardUser, isDark && styles.textDark]} numberOfLines={1}>
                    {item.userName}
                  </Text>
                  <Text style={styles.cardDate} numberOfLines={1}>
                    {dateStr}
                  </Text>
                  <Text style={styles.cardAddress} numberOfLines={2}>
                    📍 {item.address || `${item.latitude?.toFixed(4)}, ${item.longitude?.toFixed(4)}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol name="photo.on.rectangle.fill" size={64} color="#9ca3af" />
              <Text style={[styles.emptyText, isDark && styles.textDarkSub]}>{t('camera:no_photos_found', { defaultValue: 'No geotagged photos found.' })}</Text>
            </View>
          }
        />
      )}

      <Modal visible={selectedPhoto !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedPhoto(null)}>
            <Text style={styles.modalCloseText}>✕ {t('common:close', { defaultValue: 'Close' })}</Text>
          </TouchableOpacity>

          {selectedPhoto && (
            <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
              <View style={styles.imageWrapper}>
                <Image 
                  source={{ uri: selectedPhoto.cloudinaryUrl || (selectedPhoto.filePath.replace(/\\/g, '/').startsWith('http') ? selectedPhoto.filePath.replace(/\\/g, '/') : `${API_BASE_URL.replace('/api', '')}/${selectedPhoto.filePath.replace(/\\/g, '/').startsWith('/') ? selectedPhoto.filePath.replace(/\\/g, '/').substring(1) : selectedPhoto.filePath.replace(/\\/g, '/')}`) }} 
                  style={styles.modalImage} 
                  contentFit="cover" 
                  cachePolicy="memory-disk"
                  transition={200}
                />
                
                <View style={styles.locationOverlay}>
                  <View style={styles.gpsBadge}>
                    <IconSymbol name="location.fill" size={10} color="#facc15" />
                    <Text style={styles.gpsBadgeText}>GPS Map Camera</Text>
                  </View>
                  
                  <View style={styles.locationTextContainer}>
                    <Text style={styles.locationTitle}>
                      {selectedPhoto.address ? selectedPhoto.address.split(',')[0] : 'Unknown'} 🇮🇳
                    </Text>
                    <Text style={styles.locationAddressText}>
                      {selectedPhoto.address || 'Address not available'}
                    </Text>
                    <Text style={styles.locationSubText}>
                      Lat {selectedPhoto.latitude?.toFixed(5)}° Long {selectedPhoto.longitude?.toFixed(5)}°
                    </Text>
                    <Text style={styles.locationSubText}>
                      {new Date(Number(selectedPhoto.timestamp)).toLocaleString('en-US', {weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit'})}
                    </Text>
                    <Text style={[styles.locationSubText, { color: '#facc15', marginTop: 2 }]}>
                      {t('camera:uploaded_by', { defaultValue: 'Uploaded by:' })} {selectedPhoto.userName}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.deleteBtn} 
                onPress={() => handleDelete(selectedPhoto.id || selectedPhoto._id)}
              >
                <IconSymbol name="trash.fill" size={20} color="#fff" />
                <Text style={styles.deleteBtnText}>{t('camera:delete_photo_btn', { defaultValue: 'Delete Photo' })}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginBottom: 10,
  },
  headerDark: {
    backgroundColor: '#1e1e1e',
    borderBottomColor: '#333333',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    fontFamily: Fonts.rounded,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  datePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
    marginVertical: 15,
  },
  navBtn: {
    backgroundColor: '#E6F4FE',
    padding: 10,
    borderRadius: 8,
  },
  btnText: {
    color: '#007AFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  dateDisplay: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 120,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  galleryContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  galleryRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  galleryCard: {
    width: COLUMN_WIDTH,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardDark: {
    backgroundColor: '#1e1e1e',
    borderColor: '#333333',
  },
  galleryImage: {
    width: '100%',
    height: COLUMN_WIDTH * 0.75,
    backgroundColor: '#e5e7eb',
  },
  cardInfo: {
    padding: 10,
  },
  cardUser: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  cardDate: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  cardAddress: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 6,
    lineHeight: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '600',
  },
  textDark: {
    color: '#ffffff',
  },
  textDarkSub: {
    color: '#aaaaaa',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 10,
    zIndex: 10,
  },
  modalCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalContentDark: {
    backgroundColor: '#1e1e1e',
  },
  modalImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  modalInfoBox: {
    padding: 16,
  },
  modalUser: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  modalAddress: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 10,
    lineHeight: 18,
  },
  modalCoords: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 6,
  },
  deleteBtn: {
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  deleteBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    height: 400,
  },
  locationOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    padding: 12,
    flexDirection: 'row',
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
  }
});
