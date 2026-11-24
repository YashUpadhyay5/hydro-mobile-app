import Header from '@/components/Header';
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  RefreshControl,
  Modal
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';
import { useAuth } from '@/context/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { getDateLocale } from '@/src/i18n/dateLocale';

export default function DocumentsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['documents', 'common', 'nav']);
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<string>('received');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      let response;
      try {
        response = await api.get('/hrms-documents');
      } catch (err) {
        response = await api.get('/documents');
      }
      setDocuments(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      console.error('Error fetching documents:', error.message);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:err_fetch', { defaultValue: 'Failed to retrieve documents.' }));
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDocuments();
    }, [activeTab, user?.id, user?.empCode])
  );

  const handleDelete = (id: string) => {
    Alert.alert(
      t('documents:delete_title', { defaultValue: 'Delete Document' }),
      t('documents:confirm_delete', { defaultValue: 'Are you sure you want to delete this document permanently?' }),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common:delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              try {
                await api.delete(`/hrms-documents/${id}`);
              } catch {
                await api.delete(`/documents/${id}`);
              }
              Alert.alert(t('common:success', { defaultValue: 'Success' }), t('documents:delete_success', { defaultValue: 'Document deleted successfully.' }));
              fetchDocuments();
            } catch (err: any) {
              console.error('Delete document error:', err.message);
              Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:err_delete', { defaultValue: 'Could not delete the document.' }));
            }
          }
        }
      ]
    );
  };

  const [viewerDoc, setViewerDoc] = useState<{
    id?: string;
    url: string;
    title: string;
    fileType?: string;
    fileSize?: number;
    candidates?: string[];
    candidateIndex?: number;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const getCandidateUrls = (filePath: string): string[] => {
    if (!filePath) return [];
    const clean = filePath.replace(/\\/g, '/');
    if (clean.startsWith('http')) return [clean];

    const serverUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    const filename = clean.split('/').pop() || clean;

    const list: string[] = [];

    // 1. Safe Express API route (bypasses NGINX /documents/ proxy to Uvicorn)
    list.push(`${API_BASE_URL}/hrms-documents/file/${filename}`);

    // 2. Standard static path as stored in database
    list.push(`${serverUrl}/${clean.startsWith('/') ? clean.substring(1) : clean}`);

    // 3. Direct /documents/ root static path
    list.push(`${serverUrl}/documents/${filename}`);

    // 4. Storage paths
    list.push(`${serverUrl}/storage/${clean.replace(/^documents\//, '')}`);
    list.push(`${serverUrl}/storage/${filename}`);

    // 5. Uploads path
    list.push(`${serverUrl}/uploads/${filename}`);

    return Array.from(new Set(list));
  };

  const buildFullUrl = (filePath: string) => {
    const urls = getCandidateUrls(filePath);
    return urls[0] || '';
  };

  const advanceToNextCandidateOrShowError = (reason: string) => {
    setViewerDoc(prev => {
      if (!prev) return prev;
      if (prev.candidates && prev.candidateIndex !== undefined) {
        const nextIdx = prev.candidateIndex + 1;
        if (nextIdx < prev.candidates.length) {
          console.log(`[DocumentViewer] Candidate ${prev.candidateIndex} failed (${reason}). Retrying with candidate ${nextIdx}: ${prev.candidates[nextIdx]}`);
          return {
            ...prev,
            url: prev.candidates[nextIdx],
            candidateIndex: nextIdx,
          };
        }
      }
      Alert.alert(
        t('documents:document_unavailable_on_server', { defaultValue: 'Document Unavailable on Server' }),
        `This document file could not be loaded from the server (${reason}). Please ensure the backend static serving has been updated, or ask the uploader to re-upload it.`
      );
      return prev;
    });
  };

  const handleOpenDocument = (doc: any) => {
    try {
      const candidates = getCandidateUrls(doc.filePath);
      const fullUrl = candidates[0] || buildFullUrl(doc.filePath);
      setViewerDoc({
        id: doc.id,
        url: fullUrl,
        title: doc.title || 'Document',
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        candidates,
        candidateIndex: 0,
      });
    } catch (err: any) {
      console.error('Open document error:', err.message);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:err_open_link', { defaultValue: 'Failed to open the document link.' }));
    }
  };

  const handleDownloadDocument = async (doc: any) => {
    try {
      const candidates = doc.candidates || (doc.filePath ? getCandidateUrls(doc.filePath) : [doc.url || '']);
      const validCandidates = candidates.filter(Boolean);

      if (!validCandidates || validCandidates.length === 0) {
        Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:invalid_document_url', { defaultValue: 'Invalid document URL.' }));
        return;
      }

      setDownloadingId(doc.id || 'viewer');

      const rawExt = (doc.fileType || validCandidates[0].split('.').pop() || 'pdf').toLowerCase().replace('.', '');
      const ext = rawExt.includes('?') ? rawExt.split('?')[0] : rawExt;
      const sanitizedTitle = (doc.title || 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${sanitizedTitle}_${Date.now()}.${ext}`;
      const localUri = `${FileSystem.documentDirectory}${fileName}`;

      let downloadedSuccessfully = false;
      let finalUri = '';

      for (const candidateUrl of validCandidates) {
        try {
          const downloadRes = await FileSystem.downloadAsync(candidateUrl, localUri);
          if (downloadRes.status === 200) {
            downloadedSuccessfully = true;
            finalUri = downloadRes.uri;
            break;
          }
        } catch (downloadTryErr: any) {
          console.warn(`Download attempt failed for ${candidateUrl}:`, downloadTryErr.message);
        }
      }

      if (!downloadedSuccessfully) {
        Alert.alert(
          t('documents:document_unavailable', { defaultValue: 'Document Unavailable' }),
          t('documents:the_document_file_could_not_be', { defaultValue: 'The document file could not be found or downloaded from the server. Please ensure the backend static file serving is updated or ask the uploader to re-upload it.' })
        );
        return;
      }

      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);

      if (isImage) {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const asset = await MediaLibrary.createAssetAsync(finalUri);
          await MediaLibrary.createAlbumAsync('HRMS Documents', asset, false);
          Alert.alert(
            t('documents:saved_to_gallery', { defaultValue: 'Saved to Gallery 🖼️' }),
            `"${doc.title || fileName}" has been saved directly to your phone's Photo Gallery (Album: HRMS Documents)!`
          );
          return;
        }
      }

      // For PDFs, HTML, or other documents (or if photo permission was not granted):
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(finalUri, {
          mimeType: isImage ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
          dialogTitle: `Save ${doc.title || fileName}`,
          UTI: isImage ? 'public.image' : (ext === 'pdf' ? 'com.adobe.pdf' : 'public.item')
        });
      } else {
        Alert.alert(
          t('common:success', { defaultValue: 'Saved 📥' }),
          `"${doc.title || fileName}" has been downloaded to device storage.`
        );
      }
    } catch (err: any) {
      console.error('Download document error:', err.message);
      Alert.alert(t('documents:download_error', { defaultValue: 'Download Error' }), err.message || 'Could not save file to device.');
    } finally {
      setDownloadingId(null);
    }
  };

  const empCode = user?.empCode || user?.employeeCode;
  const uId = user?.id;
  const uName = user?.name?.toLowerCase();

  const isUserDoc = (doc: any) => {
    return (
      (empCode && doc.uploaderId === empCode) ||
      (uId && doc.uploaderId === uId) ||
      (empCode && doc.uploaderEmpCode === empCode) ||
      (uId && doc.uploaderEmployeeId === uId) ||
      (uName && doc.uploaderName && doc.uploaderName.toLowerCase() === uName)
    );
  };

  const isTargetedToUser = (doc: any) => {
    return (
      doc.targetType === 'ALL' ||
      (empCode && doc.targetUserId === empCode) ||
      (uId && doc.targetUserId === uId) ||
      (uName && doc.targetUserName && doc.targetUserName.toLowerCase() === uName)
    );
  };

  const getTabFilteredData = () => {
    if (activeTab === 'received') {
      return documents.filter(
        doc => !isUserDoc(doc) && isTargetedToUser(doc)
      );
    } else {
      return documents.filter(doc => isUserDoc(doc));
    }
  };

  const filteredDocs = (Array.isArray(getTabFilteredData()) ? getTabFilteredData() : []).filter(doc => {
    if (!doc) return false;
    const titleMatch = (doc.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    const uploaderMatch = (doc.uploaderName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const targetMatch = (doc.targetUserName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return titleMatch || uploaderMatch || targetMatch;
  });

  const getFileColor = (type: string) => {
    const tStr = (type || '').toLowerCase();
    if (tStr === 'pdf') return 'text-red-500 bg-red-50'; 
    if (['png', 'jpg', 'jpeg', 'gif'].includes(tStr)) return 'text-emerald-500 bg-emerald-50'; 
    if (['doc', 'docx', 'txt'].includes(tStr)) return 'text-blue-500 bg-blue-50'; 
    if (['xls', 'xlsx', 'csv'].includes(tStr)) return 'text-emerald-600 bg-emerald-100'; 
    if (['zip', 'rar'].includes(tStr)) return 'text-purple-500 bg-purple-50'; 
    return 'text-gray-500 bg-gray-100'; 
  };
  const getFileIconColorHex = (type: string) => {
    const tStr = (type || '').toLowerCase();
    if (tStr === 'pdf') return '#ef4444'; 
    if (['png', 'jpg', 'jpeg', 'gif'].includes(tStr)) return '#10b981'; 
    if (['doc', 'docx', 'txt'].includes(tStr)) return '#3b82f6'; 
    if (['xls', 'xlsx', 'csv'].includes(tStr)) return '#059669'; 
    if (['zip', 'rar'].includes(tStr)) return '#8b5cf6'; 
    return '#6b7280'; 
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return 'N/A';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderItem = ({ item }: { item: any }) => {
    const fileColorClasses = getFileColor(item.fileType);
    const fileIconHex = getFileIconColorHex(item.fileType);
    const formattedSize = formatBytes(item.fileSize);
    
    let rawDate = item.uploadedAt || item.createdAt;
    if (typeof rawDate === 'string' && !isNaN(Number(rawDate))) {
      rawDate = Number(rawDate);
    }
    const dateObj = new Date(rawDate);
    const dateStr = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recent';

    const canDelete = isUserDoc(item) || item.uploaderId === user?.id;

    return (
      <Card className={`mb-3 overflow-hidden flex-row items-center p-3 border ${isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-border'}`}>
        <View className="mr-3">
          <View className={`w-12 h-12 rounded-xl justify-center items-center ${fileColorClasses.split(' ')[1]}`}>
            <IconSymbol name="doc.text.fill" color={fileIconHex} size={26} />
          </View>
        </View>
        
        <View className="flex-1 mr-2">
          <Text className={`text-[15px] font-bold mb-0.5 ${isDark ? 'text-white' : 'text-text-main'}`} numberOfLines={1}>
            {item.title}
          </Text>
          <Text className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
            {item.fileType?.toUpperCase()} • {formattedSize}
          </Text>

          {item.uploaderId === 'admin' ? (
            <Text className={`text-xs ${isDark ? 'text-slate-300' : 'text-text-secondary'}`}>
              {t('documents:from', { defaultValue: 'From:' })} <Text className={`font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('documents:company', { defaultValue: 'Company' })}</Text>
            </Text>
          ) : (
            <Text className={`text-xs ${isDark ? 'text-slate-300' : 'text-text-secondary'}`}>
              {t('documents:status_label', { defaultValue: 'Status:' })} <Text className={`font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('documents:sent_to_admin', { defaultValue: 'Sent to Admin' })}</Text>
            </Text>
          )}
          
          <Text className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>{dateStr}</Text>
        </View>

        <View className="justify-center items-end gap-2">
          <View className="flex-row items-center gap-1.5">
            <TouchableOpacity
              className={`py-1.5 px-3 rounded-lg min-w-[54px] items-center ${isDark ? 'bg-blue-500/20' : 'bg-primary/10'}`}
              onPress={() => handleOpenDocument(item)}
              activeOpacity={0.8}
            >
              <Text className={`text-xs font-bold ${isDark ? 'text-blue-400' : 'text-primary'}`}>{t('documents:open', { defaultValue: 'Open' })}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className={`w-8 h-8 rounded-lg items-center justify-center border ${isDark ? 'bg-emerald-950/40 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}
              onPress={() => handleDownloadDocument(item)}
              disabled={downloadingId === item.id}
              activeOpacity={0.8}
            >
              {downloadingId === item.id ? (
                <ActivityIndicator size="small" color={isDark ? '#34D399' : '#059669'} />
              ) : (
                <Ionicons name="download-outline" size={16} color={isDark ? '#34D399' : '#059669'} />
              )}
            </TouchableOpacity>
          </View>

          {canDelete && (
            <TouchableOpacity
              className={`py-1 px-3 rounded-lg min-w-[54px] items-center ${isDark ? 'bg-rose-950/50' : 'bg-red-50'}`}
              onPress={() => handleDelete(item.id)}
              activeOpacity={0.8}
            >
              <Text className={`text-[11px] font-bold ${isDark ? 'text-rose-400' : 'text-red-500'}`}>{t('common:delete', { defaultValue: 'Delete' })}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>
    );
  };

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-background'}`}>
      <Header />
      <View className={`flex-row justify-between items-center px-5 py-4 border-b ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>{t('documents:doc_center', { defaultValue: 'Document Center' })}</Text>
        <TouchableOpacity
          className={`w-[42px] h-[42px] rounded-full justify-center items-center shadow-md ${isDark ? 'bg-blue-600 shadow-black/40' : 'bg-primary shadow-black/20'}`}
          onPress={() => router.push('/document-upload' as any)}
          activeOpacity={0.8}
        >
          <IconSymbol name="plus" color="#ffffff" size={22} />
        </TouchableOpacity>
      </View>

      <View className={`flex-row p-1.5 mx-5 my-4 rounded-xl border ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <TouchableOpacity
          className={`flex-1 py-2.5 items-center rounded-lg ${activeTab === 'received' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('received')}
        >
          <Text className={`text-sm font-semibold ${activeTab === 'received' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
            {t('documents:received_docs', { defaultValue: 'Received Docs' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-2.5 items-center rounded-lg ${activeTab === 'mine' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
          onPress={() => setActiveTab('mine')}
        >
          <Text className={`text-sm font-semibold ${activeTab === 'mine' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
            {t('documents:my_uploads', { defaultValue: 'My Uploads' })}
          </Text>
        </TouchableOpacity>
      </View>

      <View className={`flex-row rounded-xl mx-5 mb-3 px-3 items-center border ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <Input
          className="flex-1 h-11 border-0 bg-transparent px-0"
          placeholder={t('common:search_placeholder', { defaultValue: 'Search documents...' })}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} className="p-2">
            <Text className={`font-bold ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && documents.length === 0 ? (
        <ActivityIndicator size="large" color="#0052CC" className="flex-1 justify-center items-center" />
      ) : (
        <FlatList
          data={filteredDocs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom + 110, 130) }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchDocuments} colors={['#0052CC']} />
          }
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Text className="text-sm text-text-muted italic">
                {t('documents:no_docs', { defaultValue: 'No documents found.' })}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={!!viewerDoc} animationType="slide" transparent={false} onRequestClose={() => setViewerDoc(null)}>
        <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-background'}`}>
          {/* Consistent Top Header Bar */}
          <View 
            className={`flex-row items-center justify-between px-4 pb-3 border-b z-10 ${isDark ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-border'}`}
            style={{ paddingTop: Math.max(insets.top + 6, 16) }}
          >
            <TouchableOpacity 
              className={`w-10 h-10 rounded-full items-center justify-center border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-border'}`}
              onPress={() => setViewerDoc(null)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
            </TouchableOpacity>

            <View className="flex-1 mx-3 items-center">
              <Text className={`text-base font-bold tracking-tight text-center ${isDark ? 'text-white' : 'text-text-main'}`} numberOfLines={1}>
                {viewerDoc?.title || t('documents:doc_viewer', { defaultValue: 'Document Viewer' })}
              </Text>
              {viewerDoc?.fileType && (
                <Text className={`text-[10px] font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                  {viewerDoc.fileType} {viewerDoc.fileSize ? `• ${formatBytes(viewerDoc.fileSize)}` : ''}
                </Text>
              )}
            </View>

            <TouchableOpacity 
              className={`w-10 h-10 rounded-full items-center justify-center border ${isDark ? 'bg-emerald-950/60 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}
              onPress={() => viewerDoc && handleDownloadDocument({ ...viewerDoc, filePath: viewerDoc.url, id: 'viewer' })}
              disabled={downloadingId === 'viewer'}
              activeOpacity={0.8}
            >
              {downloadingId === 'viewer' ? (
                <ActivityIndicator size="small" color={isDark ? '#34D399' : '#059669'} />
              ) : (
                <Ionicons name="download-outline" size={20} color={isDark ? '#34D399' : '#059669'} />
              )}
            </TouchableOpacity>
          </View>

          {viewerDoc && (
            <WebView 
              source={{
                uri: (viewerDoc.fileType === 'pdf' && Platform.OS === 'android')
                  ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(viewerDoc.url)}`
                  : viewerDoc.url
              }} 
              style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }}
              startInLoadingState
              renderLoading={() => (
                <View className="absolute inset-0 justify-center items-center">
                  <ActivityIndicator size="large" color="#0052CC" />
                </View>
              )}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                if (nativeEvent.statusCode >= 400) {
                  advanceToNextCandidateOrShowError(`HTTP ${nativeEvent.statusCode}`);
                }
              }}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                advanceToNextCandidateOrShowError(nativeEvent.description || 'network error');
              }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
