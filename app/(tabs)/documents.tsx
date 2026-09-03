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

export default function DocumentsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['documents', 'common', 'nav']);
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<string>(isAdmin ? 'employees' : 'received');
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

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const handleOpenDocument = (filePath: string) => {
    try {
      const serverUrl = API_BASE_URL.replace('/api', '');
      const fullUrl = filePath.startsWith('http') ? filePath : `${serverUrl}/${filePath.startsWith('/') ? filePath.substring(1) : filePath}`;
      setViewerUrl(fullUrl);
    } catch (err: any) {
      console.error('Open document error:', err.message);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:err_open_link', { defaultValue: 'Failed to open the document link.' }));
    }
  };

  const getTabFilteredData = () => {
    const empCode = user?.empCode || user?.employeeCode;
    const uId = user?.id;
    const uName = user?.name?.toLowerCase();

    const isUserDoc = (doc: any) => {
      return (
        (empCode && doc.uploaderId === empCode) ||
        (uId && doc.uploaderId === uId) ||
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

    if (isAdmin) {
      if (activeTab === 'employees') {
        return documents.filter(doc => doc.uploaderId !== 'admin');
      } else {
        return documents.filter(doc => doc.uploaderId === 'admin');
      }
    } else {
      if (activeTab === 'received') {
        return documents.filter(
          doc => !isUserDoc(doc) || isTargetedToUser(doc)
        );
      } else {
        return documents.filter(doc => isUserDoc(doc));
      }
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
      ? dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recent';

    const canDelete = isAdmin || item.uploaderId === user?.id;

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

          {isAdmin ? (
            item.uploaderId === 'admin' ? (
              <Text className={`text-xs ${isDark ? 'text-slate-300' : 'text-text-secondary'}`}>
                {t('documents:shared_with', { defaultValue: 'Shared with:' })}{' '}
                <Text className={`font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>
                  {item.targetType === 'ALL' ? t('documents:all_employees', { defaultValue: 'All Employees' }) : item.targetUserName}
                </Text>
              </Text>
            ) : (
              <Text className={`text-xs ${isDark ? 'text-slate-300' : 'text-text-secondary'}`}>
                {t('documents:from', { defaultValue: 'From:' })}{' '}
                <Text className={`font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{item.uploaderName}</Text>
              </Text>
            )
          ) : (
            item.uploaderId === 'admin' ? (
              <Text className={`text-xs ${isDark ? 'text-slate-300' : 'text-text-secondary'}`}>
                {t('documents:from', { defaultValue: 'From:' })} <Text className={`font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('documents:company', { defaultValue: 'Company' })}</Text>
              </Text>
            ) : (
              <Text className={`text-xs ${isDark ? 'text-slate-300' : 'text-text-secondary'}`}>
                {t('documents:status_label', { defaultValue: 'Status:' })} <Text className={`font-semibold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('documents:sent_to_admin', { defaultValue: 'Sent to Admin' })}</Text>
              </Text>
            )
          )}
          
          <Text className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>{dateStr}</Text>
        </View>

        <View className="justify-center items-end gap-2">
          <TouchableOpacity
            className={`py-1.5 px-3 rounded-lg min-w-[60px] items-center ${isDark ? 'bg-blue-500/20' : 'bg-primary/10'}`}
            onPress={() => handleOpenDocument(item.filePath)}
          >
            <Text className={`text-xs font-bold ${isDark ? 'text-blue-400' : 'text-primary'}`}>{t('documents:open', { defaultValue: 'Open' })}</Text>
          </TouchableOpacity>

          {canDelete && (
            <TouchableOpacity
              className={`py-1.5 px-3 rounded-lg min-w-[60px] items-center ${isDark ? 'bg-rose-950/50' : 'bg-red-50'}`}
              onPress={() => handleDelete(item.id)}
            >
              <Text className={`text-xs font-bold ${isDark ? 'text-rose-400' : 'text-red-500'}`}>{t('common:delete', { defaultValue: 'Delete' })}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>
    );
  };

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0F172A]' : 'bg-background'}`} style={{ paddingTop: Platform.OS === 'ios' ? 50 : 20 }}>
      <Header />
      <View className={`flex-row justify-between items-center px-5 py-4 border-b ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>{t('documents:doc_center', { defaultValue: 'Document Center' })}</Text>
        <TouchableOpacity
          className={`${isDark ? 'bg-blue-600' : 'bg-primary'} py-2 px-4 rounded-lg shadow-sm`}
          onPress={() => router.push('/document-upload' as any)}
        >
          <Text className="text-white font-bold text-sm">
            {isAdmin ? `+ ${t('documents:share_btn', { defaultValue: 'Share' })}` : `+ ${t('documents:upload_btn', { defaultValue: 'Upload' })}`}
          </Text>
        </TouchableOpacity>
      </View>

      <View className={`flex-row p-1.5 mx-5 my-4 rounded-xl border ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        {isAdmin ? (
          <>
            <TouchableOpacity
              className={`flex-1 py-2.5 items-center rounded-lg ${activeTab === 'employees' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
              onPress={() => setActiveTab('employees')}
            >
              <Text className={`text-sm font-semibold ${activeTab === 'employees' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
                {t('documents:emp_uploads', { defaultValue: 'Employee Uploads' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-2.5 items-center rounded-lg ${activeTab === 'admin' ? (isDark ? 'bg-blue-600/30' : 'bg-primary/10') : ''}`}
              onPress={() => setActiveTab('admin')}
            >
              <Text className={`text-sm font-semibold ${activeTab === 'admin' ? (isDark ? 'text-blue-400' : 'text-primary') : (isDark ? 'text-slate-400' : 'text-text-muted')}`}>
                {t('documents:shared_by_company', { defaultValue: 'Shared by Company' })}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
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
          </>
        )}
      </View>

      <View className={`flex-row rounded-xl mx-5 mb-3 px-3 items-center border ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-border'}`}>
        <Input
          className="flex-1 h-11 border-0 bg-transparent px-0"
          placeholder={isAdmin ? t('documents:search_admin_placeholder', { defaultValue: 'Search by title, employee, or target name...' }) : t('common:search_placeholder', { defaultValue: 'Search documents...' })}
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

      <Modal visible={!!viewerUrl} animationType="slide" transparent={false}>
        <View className="flex-1 bg-white">
          <TouchableOpacity 
            className="absolute z-10 p-2.5 bg-black/60 rounded-xl right-5" 
            style={{ top: Platform.OS === 'ios' ? 50 : 20 }}
            onPress={() => setViewerUrl(null)}
          >
            <Text className="text-white font-bold text-sm">{t('common:close', { defaultValue: 'Close' })}</Text>
          </TouchableOpacity>
          {viewerUrl && (
            <WebView 
              source={{ uri: viewerUrl }} 
              style={{ flex: 1, marginTop: 50 }} 
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
