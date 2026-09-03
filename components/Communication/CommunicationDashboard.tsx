import Header from '@/components/Header';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  BackHandler,
  Platform,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  CameraSvgIcon,
  ChatSvgIcon,
  VideoMeetingSvgIcon,
  BackArrowSvgIcon,
} from '@/components/ui/SvgIcons';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Notifications from 'expo-notifications';
import { GeotagCameraScreen } from '@/app/(tabs)/explore';
import EmployeeList from './EmployeeList';
import ChatRoomScreen from './ChatRoomScreen';
import chatService, { EmployeeProfile } from '@/services/chatService';

export default function CommunicationDashboard() {
  const { t } = useTranslationSafe(['communication', 'common']);
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ openChatId?: string; senderId?: string; senderName?: string; openChatTime?: string }>();

  const [activeView, setActiveView] = useState<'DASHBOARD' | 'CAMERA' | 'EMPLOYEES' | 'CHAT'>('DASHBOARD');
  const [selectedChat, setSelectedChat] = useState<{ chatId: string; otherUser: EmployeeProfile } | null>(null);
  const [showMeetingsModal, setShowMeetingsModal] = useState(false);

  const openDirectChat = async (targetEmpId: string, directChatId?: string, senderName?: string) => {
    try {
      const currentId = user?.id ? String(user.id) : 'admin';
      if (targetEmpId && targetEmpId !== currentId) {
        const chatData = await chatService.getOrCreateDirectChat(currentId, targetEmpId);
        setSelectedChat({
          chatId: chatData.chatId || directChatId || '',
          otherUser: chatData.otherUser || {
            id: targetEmpId,
            name: senderName || 'Team Member',
            email: '',
            role: '',
            designation: '',
            department: 'HRMS',
            isOnline: true,
            lastSeen: new Date().toISOString(),
          },
        });
        setActiveView('CHAT');
      } else if (directChatId) {
        setSelectedChat({
          chatId: directChatId,
          otherUser: {
            id: targetEmpId || 'user',
            name: senderName || 'Team Member',
            email: '',
            role: '',
            designation: '',
            department: 'HRMS',
            isOnline: true,
            lastSeen: new Date().toISOString(),
          },
        });
        setActiveView('CHAT');
      }
    } catch (err) {
      console.error('[openDirectChat Error]', err);
    }
  };

  // 1. Handle navigation route params from notification / other tabs
  React.useEffect(() => {
    if (params?.senderId || params?.openChatId) {
      openDirectChat(String(params.senderId || ''), String(params.openChatId || ''), params.senderName);
    }
  }, [params?.senderId, params?.openChatId, params?.openChatTime]);

  // 2. Handle cold-start launch via push / local notification
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    let isMounted = true;
    const checkColdStartNotification = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response && isMounted) {
          const data = response?.notification?.request?.content?.data;
          if (data && (data.senderId || data.chatId)) {
            openDirectChat(String(data.senderId || ''), String(data.chatId || ''), String(data.senderName || ''));
          }
        }
      } catch (err) {
        console.warn('[Cold Start Notification Warning]', err);
      }
    };
    checkColdStartNotification();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // 3. Handle foreground / background notification response click
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      const sub = Notifications.addNotificationResponseReceivedListener(async response => {
        try {
          const data = response?.notification?.request?.content?.data;
          if (data && (data.chatId || data.senderId)) {
            openDirectChat(String(data.senderId || ''), String(data.chatId || ''), String(data.senderName || ''));
          }
        } catch (err) {
          console.error('[Notification Redirection Error]', err);
        }
      });

      return () => {
        try {
          sub.remove();
        } catch (e) {}
      };
    } catch (e) {
      console.warn('[Notification Listener Setup Warning]', e);
    }
  }, [user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (activeView === 'CHAT') {
          setActiveView('EMPLOYEES');
          setSelectedChat(null);
          return true;
        }
        if (activeView === 'EMPLOYEES') {
          setActiveView('DASHBOARD');
          return true;
        }
        if (activeView === 'CAMERA') {
          setActiveView('DASHBOARD');
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [activeView])
  );

  const handleSelectEmployee = async (targetEmployee: EmployeeProfile) => {
    try {
      const currentId = user?.id || 'admin';
      const chatData = await chatService.getOrCreateDirectChat(currentId, targetEmployee.id);
      setSelectedChat({
        chatId: chatData.chatId,
        otherUser: chatData.otherUser || targetEmployee,
      });
      setActiveView('CHAT');
    } catch (err) {
      console.error('[handleSelectEmployee Error]', err);
    }
  };

  if (activeView === 'CAMERA') {
    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          style={[
            styles.backTopBar,
            isDark && styles.backTopBarDark,
            { paddingTop: Math.max(insets.top, 16) },
          ]}
          onPress={() => setActiveView('DASHBOARD')}
        >
          <BackArrowSvgIcon size={24} color="#0F172A" />
          <Text style={[styles.backTopBarText, isDark && styles.textDark]}>{t('communication:back_to_comm', { defaultValue: 'Back to Communication' })}</Text>
        </TouchableOpacity>
        <GeotagCameraScreen />
      </View>
    );
  }

  if (activeView === 'EMPLOYEES') {
    return (
      <EmployeeList
        currentUserId={user?.id || 'admin'}
        onSelectEmployee={handleSelectEmployee}
        onBack={() => setActiveView('DASHBOARD')}
      />
    );
  }

  if (activeView === 'CHAT' && selectedChat) {
    return (
      <ChatRoomScreen
        currentUserId={user?.id || 'admin'}
        chatId={selectedChat.chatId}
        otherUser={selectedChat.otherUser}
        onBack={() => setActiveView('EMPLOYEES')}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <Header />
      <ScrollView
        style={[styles.container, isDark && styles.containerDark]}
        contentContainerStyle={[styles.content, { paddingBottom: 56 + insets.bottom + 24 }]}
      >
      {/* Header with Dynamic Status Bar Safe Area */}
      <View
        style={[
          styles.header,
          isDark && styles.headerDark,
          { paddingTop: Math.max(insets.top + 8, 20) },
        ]}
      >
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>{t('communication:title', { defaultValue: 'Enterprise Communication' })}</Text>
        <Text style={[styles.headerSub, isDark && styles.textDarkSub]}>
          {t('communication:subtitle', { defaultValue: 'Secure Internal Platform' })} • {user?.name || 'Employee'}
        </Text>
      </View>

      {/* Cards Container - 100% Uniform Theme (#0F172A Glossy Obsidian Black) */}
      <View style={styles.cardList}>
        {/* Card 1: Geo-tagged Camera */}
        <TouchableOpacity
          style={[styles.card, styles.cardCamera, isDark && styles.cardDark]}
          activeOpacity={0.85}
          onPress={() => setActiveView('CAMERA')}
        >
          <View style={[styles.cardIconWrapper, { backgroundColor: '#F1F5F9' }]}>
            <CameraSvgIcon size={34} color="#0F172A" />
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, isDark && styles.textDark]}>{t('communication:geotag_title', { defaultValue: 'Geo-tagged Camera' })}</Text>
              <View style={[styles.badgeActive, { backgroundColor: '#F1F5F9' }]}>
                <Text style={[styles.badgeActiveText, { color: '#0F172A' }]}>{t('common:active', { defaultValue: 'Active' })}</Text>
              </View>
            </View>
            <Text style={[styles.cardDesc, isDark && styles.textDarkSub]}>
              {t('communication:geotag_desc', { defaultValue: 'Capture geo-tagged attendance image with verified location & timestamp.' })}
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={20} color="#94a3b8" />
        </TouchableOpacity>

        {/* Card 2: Employee Chat - Unified Glossy Black Palette */}
        <TouchableOpacity
          style={[styles.card, styles.cardChat, isDark && styles.cardDark]}
          activeOpacity={0.85}
          onPress={() => setActiveView('EMPLOYEES')}
        >
          <View style={[styles.cardIconWrapper, { backgroundColor: '#F1F5F9' }]}>
            <ChatSvgIcon size={34} color="#0F172A" />
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, isDark && styles.textDark]}>{t('communication:chat_title', { defaultValue: 'Employee Chat' })}</Text>
              <View style={[styles.badgeActive, { backgroundColor: '#F1F5F9' }]}>
                <Text style={[styles.badgeActiveText, { color: '#0F172A' }]}>{t('communication:internal', { defaultValue: 'Internal' })}</Text>
              </View>
            </View>
            <Text style={[styles.cardDesc, isDark && styles.textDarkSub]}>
              {t('communication:chat_desc', { defaultValue: 'Secure realtime internal company messaging, file sharing & read receipts.' })}
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={20} color="#94a3b8" />
        </TouchableOpacity>

        {/* Card 3: Video Meetings */}
        <TouchableOpacity
          style={[styles.card, styles.cardMeetings, isDark && styles.cardDark]}
          activeOpacity={0.85}
          onPress={() => setShowMeetingsModal(true)}
        >
          <View style={[styles.cardIconWrapper, { backgroundColor: '#F1F5F9' }]}>
            <VideoMeetingSvgIcon size={34} color="#0F172A" />
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, isDark && styles.textDark]}>{t('communication:meetings_title', { defaultValue: 'Meetings' })}</Text>
              <View style={[styles.badgeSoon, { backgroundColor: '#F1F5F9' }]}>
                <Text style={[styles.badgeSoonText, { color: '#64748B' }]}>{t('common:coming_soon', { defaultValue: 'Coming Soon' })}</Text>
              </View>
            </View>
            <Text style={[styles.cardDesc, isDark && styles.textDarkSub]}>
              {t('communication:meetings_desc', { defaultValue: 'Enterprise HD video & voice calls, live transcription & AI summaries.' })}
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Meetings Modal */}
      <Modal visible={showMeetingsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, isDark && styles.cardDark]}>
            <View style={[styles.modalIconBox, { backgroundColor: '#F1F5F9' }]}>
              <VideoMeetingSvgIcon size={44} color="#0F172A" />
            </View>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>{t('communication:modal_meetings_title', { defaultValue: 'Meetings Module' })}</Text>
            <View style={[styles.badgeSoon, { backgroundColor: '#F1F5F9' }]}>
              <Text style={[styles.badgeSoonText, { color: '#64748B' }]}>{t('common:coming_soon', { defaultValue: 'Coming Soon' })}</Text>
            </View>
            <Text style={[styles.modalDesc, isDark && styles.textDarkSub]}>
              {t('communication:modal_meetings_desc', { defaultValue: 'The Enterprise Meetings architecture is designed and will feature HD Video/Voice calls, screen sharing, live transcription, and AI meeting summaries.' })}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowMeetingsModal(false)}
            >
              <Text style={styles.modalCloseText}>{t('common:got_it', { defaultValue: 'Got it' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
  content: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 20,
  },
  headerDark: {
    backgroundColor: '#1E293B',
    borderBottomColor: '#334155',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  cardList: {
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  cardCamera: {
    borderLeftWidth: 4,
    borderLeftColor: '#0F172A',
  },
  cardChat: {
    borderLeftWidth: 4,
    borderLeftColor: '#0F172A',
  },
  cardMeetings: {
    borderLeftWidth: 4,
    borderLeftColor: '#0F172A',
  },
  cardIconWrapper: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginRight: 8,
  },
  cardDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  badgeActive: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeActiveText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeSoon: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeSoonText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  backTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backTopBarDark: {
    backgroundColor: '#1E293B',
    borderBottomColor: '#334155',
  },
  backTopBarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  modalIconBox: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 20,
  },
  modalCloseBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 14,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  textDark: {
    color: '#FFFFFF',
  },
  textDarkSub: {
    color: '#94A3B8',
  },
});
