import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Linking,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BackArrowSvgIcon } from '@/components/ui/SvgIcons';
import { EmployeeProfile, MessageItem, AttachmentItem } from '@/services/chatService';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

interface EmployeeChatDetailScreenProps {
  employee: EmployeeProfile;
  messages: MessageItem[];
  onBack: () => void;
}

export default function EmployeeChatDetailScreen({
  employee,
  messages,
  onBack,
}: EmployeeChatDetailScreenProps) {
  const { t } = useTranslationSafe(['communication', 'common']);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'MEDIA' | 'DOCS' | 'LINKS'>('MEDIA');
  const [selectedAttachment, setSelectedAttachment] = useState<AttachmentItem | null>(null);

  // Direct Native File Download helper (Saved to Gallery for Images)
  const handleDownloadDirect = async (url: string, fileName?: string) => {
    try {
      const name = fileName || url.split('/').pop() || `file_${Date.now()}`;
      const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(name) || url.includes('image') || url.includes('png') || url.includes('jpg');
      const fileUri = `${FileSystem.documentDirectory}${name}`;
      const downloadRes = await FileSystem.downloadAsync(url, fileUri);

      if (downloadRes.status !== 200) {
        Alert.alert('Download Error', 'Could not download file from server.');
        return;
      }

      if (isImage) {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const asset = await MediaLibrary.createAssetAsync(downloadRes.uri);
          await MediaLibrary.createAlbumAsync('HRMS App', asset, false);
          Alert.alert(
            'Saved to Photos 🖼️',
            `"${name}" has been saved directly to your phone's Photo Gallery (Album: HRMS App)!`
          );
          return;
        }
      }

      Alert.alert(
        t('common:success', { defaultValue: 'Download Complete 📥' }),
        `"${name}" has been saved to your device storage.`
      );
    } catch (err) {
      console.error('[handleDownloadDirect error]', err);
      Alert.alert('Download Error', 'Could not save file to device.');
    }
  };

  // Extract all attachments from chat message history
  const allAttachments: AttachmentItem[] = messages.reduce((acc: AttachmentItem[], msg) => {
    if (msg.attachments && msg.attachments.length > 0) {
      return [...acc, ...msg.attachments];
    }
    return acc;
  }, []);

  const imageAttachments = allAttachments.filter(att => att.fileType === 'IMAGE');
  const docAttachments = allAttachments.filter(att => att.fileType !== 'IMAGE');

  // Extract all shared links from message content
  const linkRegex = /(https?:\/\/[^\s]+)/g;
  const sharedLinks: { url: string; msgDate: string }[] = [];

  messages.forEach(msg => {
    if (msg.content) {
      const matches = msg.content.match(linkRegex);
      if (matches) {
        matches.forEach(url => {
          sharedLinks.push({ url, msgDate: msg.createdAt });
        });
      }
    }
  });

  const getDocIcon = (fileType: string) => {
    if (fileType === 'EXCEL') return 'tablecells.fill';
    if (fileType === 'WORD') return 'doc.text.fill';
    if (fileType === 'ZIP') return 'archivebox.fill';
    return 'doc.fill';
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Top Navigation Header */}
      <View
        style={[
          styles.header,
          isDark && styles.headerDark,
          { paddingTop: Math.max(insets.top + 6, 16) },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <BackArrowSvgIcon size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>
          {t('communication:contact_info', { defaultValue: 'Contact Info' })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 32) }}>
        {/* Profile Card Header */}
        <View style={[styles.profileCard, isDark && styles.profileCardDark]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {employee.name ? employee.name.substring(0, 2).toUpperCase() : 'EM'}
            </Text>
            <View
              style={[
                styles.onlineDot,
                { backgroundColor: employee.isOnline ? '#10b981' : '#94a3b8' },
              ]}
            />
          </View>

          <Text style={[styles.empName, isDark && styles.textDark]}>{employee.name}</Text>
          <Text style={styles.empDesignation}>
            {employee.designation || 'Employee'} • {employee.department || 'General'}
          </Text>
          <Text style={styles.empEmail}>{employee.email}</Text>

          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {employee.isOnline
                ? t('common:active_now', { defaultValue: 'Active now' })
                : t('communication:offline', { defaultValue: 'Offline' })}
            </Text>
          </View>
        </View>

        {/* Media / Docs / Links Segmented Tabs Header */}
        <View style={[styles.tabBar, isDark && styles.tabBarDark]}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'MEDIA' && styles.tabBtnActive]}
            onPress={() => setActiveTab('MEDIA')}
          >
            <Text style={[styles.tabText, activeTab === 'MEDIA' && styles.tabTextActive]}>
              📷 {t('communication:photos', { defaultValue: 'Photos' })} ({imageAttachments.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'DOCS' && styles.tabBtnActive]}
            onPress={() => setActiveTab('DOCS')}
          >
            <Text style={[styles.tabText, activeTab === 'DOCS' && styles.tabTextActive]}>
              📄 {t('communication:docs', { defaultValue: 'Docs' })} ({docAttachments.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'LINKS' && styles.tabBtnActive]}
            onPress={() => setActiveTab('LINKS')}
          >
            <Text style={[styles.tabText, activeTab === 'LINKS' && styles.tabTextActive]}>
              🔗 {t('communication:links', { defaultValue: 'Links' })} ({sharedLinks.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content Section */}
        <View style={styles.tabContentArea}>
          {activeTab === 'MEDIA' && (
            <View>
              {imageAttachments.length === 0 ? (
                <Text style={[styles.emptyText, isDark && styles.textDarkSub]}>
                  {t('communication:no_photos_shared', { defaultValue: 'No shared photos yet.' })}
                </Text>
              ) : (
                <View style={styles.mediaGrid}>
                  {imageAttachments.map((att, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.gridItem}
                      onPress={() => setSelectedAttachment(att)}
                    >
                      <Image source={{ uri: att.fileUrl }} style={styles.gridImage} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {activeTab === 'DOCS' && (
            <View>
              {docAttachments.length === 0 ? (
                <Text style={[styles.emptyText, isDark && styles.textDarkSub]}>
                  {t('communication:no_docs_shared', { defaultValue: 'No shared documents yet.' })}
                </Text>
              ) : (
                docAttachments.map((att, idx) => (
                  <TouchableOpacity key={idx} style={[styles.docRow, isDark && styles.cardDark]} onPress={() => setSelectedAttachment(att)}>
                    <View style={styles.docIconBox}>
                      <IconSymbol name={getDocIcon(att.fileType)} size={28} color="#0F172A" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.docName, isDark && styles.textDark]} numberOfLines={1}>
                        {att.fileName}
                      </Text>
                      <Text style={styles.docSub}>{att.fileType} Document</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.downloadBtn}
                      onPress={() => handleDownloadDirect(att.fileUrl, att.fileName)}
                    >
                      <IconSymbol name="arrow.down.circle.fill" size={24} color="#10b981" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {activeTab === 'LINKS' && (
            <View>
              {sharedLinks.length === 0 ? (
                <Text style={[styles.emptyText, isDark && styles.textDarkSub]}>
                  {t('communication:no_links_shared', { defaultValue: 'No shared links yet.' })}
                </Text>
              ) : (
                sharedLinks.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.linkRow, isDark && styles.cardDark]}
                    onPress={() => handleDownloadDirect(item.url)}
                  >
                    <IconSymbol name="paperplane.fill" size={20} color="#0F172A" />
                    <Text style={styles.linkText} numberOfLines={2}>
                      {item.url}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* In-App Fullscreen Media/Doc Preview Modal */}
      <Modal visible={!!selectedAttachment} transparent={false} animationType="fade">
        <View style={[styles.previewModalOverlay, isDark && styles.containerDark]}>
          <View style={[styles.previewHeader, { paddingTop: Math.max(insets.top + 8, 20) }]}>
            <TouchableOpacity onPress={() => setSelectedAttachment(null)} style={styles.previewCloseBtn}>
              <IconSymbol name="xmark" size={24} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {selectedAttachment?.fileName || 'Attachment Preview'}
            </Text>
          </View>

          <View style={styles.previewBody}>
            {selectedAttachment?.fileType === 'IMAGE' ? (
              <Image source={{ uri: selectedAttachment.fileUrl }} style={styles.fullPreviewImage} resizeMode="contain" />
            ) : (
              <View style={styles.docPreviewCard}>
                <IconSymbol name={getDocIcon(selectedAttachment?.fileType || '')} size={72} color="#38bdf8" />
                <Text style={styles.docPreviewName}>{selectedAttachment?.fileName}</Text>
                <Text style={styles.docPreviewType}>{selectedAttachment?.fileType} Document</Text>
              </View>
            )}
          </View>

          <View style={[styles.previewFooter, { paddingBottom: Math.max(insets.bottom + 20, 28) }]}>
            <TouchableOpacity
              style={styles.downloadActionBtn}
              onPress={() => selectedAttachment && handleDownloadDirect(selectedAttachment.fileUrl, selectedAttachment.fileName)}
            >
              <IconSymbol name="arrow.down.circle.fill" size={24} color="#ffffff" />
              <Text style={styles.downloadActionText}>
                {t('communication:download_attachment', { defaultValue: 'Download / Save File' })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  containerDark: {
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerDark: {
    backgroundColor: '#1e293b',
    borderBottomColor: '#334155',
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginLeft: 12,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  profileCardDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  onlineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ffffff',
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  empName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  empDesignation: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  empEmail: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabBarDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  tabContentArea: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 14,
    marginVertical: 24,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  gridItem: {
    width: '33.33%',
    padding: 4,
    aspectRatio: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  docIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  docSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  downloadBtn: {
    padding: 6,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  linkText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#38bdf8',
    textDecorationLine: 'underline',
  },
  cardDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  textDark: {
    color: '#ffffff',
  },
  textDarkSub: {
    color: '#94a3b8',
  },
  previewModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  previewCloseBtn: {
    padding: 8,
  },
  previewTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullPreviewImage: {
    width: '100%',
    height: '100%',
  },
  docPreviewCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    marginHorizontal: 24,
  },
  docPreviewName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  docPreviewType: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
  },
  previewFooter: {
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(15,23,42,0.9)',
    paddingTop: 16,
  },
  downloadActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 28,
  },
  downloadActionText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 10,
  },
});
