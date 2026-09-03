import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BackArrowSvgIcon, SearchSvgIcon, DoubleTickSvgIcon } from '@/components/ui/SvgIcons';
import chatService, { EmployeeProfile } from '@/services/chatService';
import socketService from '@/services/socketService';
import * as Notifications from 'expo-notifications';
import { getDocTypeInfo, formatDocOrMessageSnippet, chatNotificationManager } from '@/utils/chatFormatting';
import { ChatReadManager } from '@/utils/chatReadManager';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

interface EmployeeListProps {
  currentUserId: string;
  onSelectEmployee: (employee: EmployeeProfile) => void;
  onBack?: () => void;
}

const DEPARTMENTS = ['ALL', 'Engineering', 'Design', 'Product', 'Human Resources', 'Quality Assurance', 'Management'];

export default function EmployeeList({ currentUserId, onSelectEmployee, onBack }: EmployeeListProps) {
  const { t } = useTranslationSafe(['communication', 'common', 'employee']);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD'>('ALL');

  const isActualMessage = (text?: string | null): boolean => {
    if (!text) return false;
    const t = text.trim();
    return (
      t !== '' &&
      t !== 'Chat initialized' &&
      t !== 'No messages yet' &&
      t !== '[DIRECT]' &&
      t.toLowerCase() !== 'chat initialized' &&
      t.toLowerCase() !== 'no messages yet'
    );
  };

  const sortEmployeesWhatsApp = (list: EmployeeProfile[]): EmployeeProfile[] => {
    return [...list].sort((a, b) => {
      const hasMsgA = isActualMessage(a.lastMessageText) && !!a.lastMessageAt;
      const hasMsgB = isActualMessage(b.lastMessageText) && !!b.lastMessageAt;

      // Only persons with actual conversations come to the top
      if (hasMsgA && !hasMsgB) return -1;
      if (!hasMsgA && hasMsgB) return 1;

      // If both have conversations, sort by newest message first
      if (hasMsgA && hasMsgB) {
        const timeA = new Date(a.lastMessageAt!).getTime() || 0;
        const timeB = new Date(b.lastMessageAt!).getTime() || 0;
        if (timeA !== timeB) return timeB - timeA;
      }

      // If neither has conversation, sort by online status then name
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  };

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const [empList, convList] = await Promise.all([
        chatService.getEmployees({
          search: search.trim(),
          department: selectedDept,
          currentUserId: currentUserId || 'admin',
        }).catch(() => []),
        chatService.getConversations(currentUserId || 'admin').catch(() => []),
      ]);

      // Merge active conversations with employee directory
      const convMap = new Map();
      if (Array.isArray(convList)) {
        for (const conv of convList) {
          if (conv.otherUser && conv.otherUser.id) {
            const hasRealMsg = isActualMessage(conv.lastMessageText);
            if (hasRealMsg) {
              convMap.set(String(conv.otherUser.id), conv);
            }
          }
        }
      }

      const mergedList = (Array.isArray(empList) ? empList : []).map(emp => {
        const isRead = ChatReadManager.isRead(emp.chatId, String(emp.id), emp.lastMessageAt);
        const conv = convMap.get(String(emp.id));
        if (conv) {
          const rawUnread = conv.unreadCount !== undefined ? conv.unreadCount : emp.unreadCount;
          return {
            ...emp,
            chatId: conv.chatId || emp.chatId,
            lastMessageText: conv.lastMessageText || emp.lastMessageText,
            lastMessageAt: conv.lastMessageAt || emp.lastMessageAt,
            unreadCount: isRead ? 0 : (rawUnread || 0),
          };
        }
        return {
          ...emp,
          lastMessageText: isActualMessage(emp.lastMessageText) ? emp.lastMessageText : null,
          lastMessageAt: isActualMessage(emp.lastMessageText) ? emp.lastMessageAt : null,
          unreadCount: isRead ? 0 : (emp.unreadCount || 0),
        };
      });

      const sortedData = sortEmployeesWhatsApp(mergedList);
      setEmployees(sortedData);
    } catch (err) {
      console.error('[EmployeeList fetch error]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [search, selectedDept, currentUserId]);

  // Real-time socket listener for typing & new messages with complete cleanup
  useEffect(() => {
    let socket: any = null;

    const handleTyping = (data: { employeeId: string; isTyping: boolean }) => {
      if (data?.employeeId) {
        setTypingUsers(prev => ({
          ...prev,
          [data.employeeId]: data.isTyping,
        }));
      }
    };

    const handleReceiveMessage = async (newMsg: any) => {
      if (!newMsg) return;
      const senderId = newMsg.senderId;
      const isSentByMe = senderId === currentUserId;
      const textPreview = formatDocOrMessageSnippet(newMsg);
      const msgTime = newMsg.createdAt || new Date().toISOString();

      // Dispatch single deduplicated local notification if from someone else
      if (!isSentByMe) {
        chatNotificationManager.notifyIfNew(newMsg, currentUserId);
      }

      setEmployees(prev => {
        let matched = false;
        const updated = prev.map(emp => {
          if (emp.id === senderId || (newMsg.chatId && emp.chatId === newMsg.chatId)) {
            matched = true;
            return {
              ...emp,
              chatId: newMsg.chatId || emp.chatId,
              lastMessageText: textPreview,
              lastMessageAt: msgTime,
              lastSenderId: senderId,
              unreadCount: !isSentByMe ? (emp.unreadCount || 0) + 1 : emp.unreadCount,
            };
          }
          return emp;
        });

        if (!matched) {
          fetchEmployees();
          return prev;
        }

        // Strict WhatsApp Sorting: Latest message on top #1
        return sortEmployeesWhatsApp(updated);
      });
    };

    const handleNewMessageNotification = () => {
      fetchEmployees();
    };

    const handlePresence = (data: { employeeId: string; isOnline: boolean; lastSeen: string }) => {
      if (data?.employeeId) {
        setEmployees(prev =>
          prev.map(emp => emp.id === data.employeeId ? { ...emp, isOnline: data.isOnline, lastSeen: data.lastSeen } : emp)
        );
      }
    };

    const setupSocketListener = async () => {
      try {
        socket = await socketService.connect(currentUserId || 'admin');
        // Remove any prior listeners before attaching to prevent duplicates
        socket.off('user_typing', handleTyping);
        socket.off('receive_message', handleReceiveMessage);
        socket.off('new_message_notification', handleNewMessageNotification);
        socket.off('user_presence', handlePresence);

        socket.on('user_typing', handleTyping);
        socket.on('receive_message', handleReceiveMessage);
        socket.on('new_message_notification', handleNewMessageNotification);
        socket.on('user_presence', handlePresence);
      } catch (err) {
        console.warn('[EmployeeList socket error]', err);
      }
    };

    setupSocketListener();

    return () => {
      if (socket) {
        socket.off('user_typing', handleTyping);
        socket.off('receive_message', handleReceiveMessage);
        socket.off('new_message_notification', handleNewMessageNotification);
        socket.off('user_presence', handlePresence);
      }
    };
  }, [currentUserId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEmployees();
  };

  // Online contacts for top horizontal avatar story list
  const onlineEmployees = useMemo(() => {
    return employees.filter(e => e.isOnline && e.id !== currentUserId);
  }, [employees, currentUserId]);

  // Total unread conversations count
  const totalUnreadCount = useMemo(() => {
    return employees.filter(e => {
      const isRead = ChatReadManager.isRead(e.chatId, String(e.id), e.lastMessageAt);
      return isActualMessage(e.lastMessageText) && !isRead && (Number(e.unreadCount) || 0) > 0;
    }).length;
  }, [employees]);

  // Filtered employees by active tab & department
  const filteredEmployees = useMemo(() => {
    let list = [...employees];
    if (activeTab === 'UNREAD') {
      list = list.filter(e => {
        const isRead = ChatReadManager.isRead(e.chatId, String(e.id), e.lastMessageAt);
        return isActualMessage(e.lastMessageText) && !isRead && (Number(e.unreadCount) || 0) > 0;
      });
    }
    // Dynamic top sorting: only persons with actual conversations come to top
    return sortEmployeesWhatsApp(list);
  }, [employees, activeTab]);

  const handleItemPress = (item: EmployeeProfile) => {
    // 1. Mark as read in persistent read manager
    ChatReadManager.markRead(String(item.id));
    if (item.chatId) {
      ChatReadManager.markRead(String(item.chatId));
      chatService.markChatAsRead(item.chatId, currentUserId).catch(() => {});
    }

    // 2. Reset unread count locally immediately
    setEmployees(prev =>
      prev.map(e => e.id === item.id ? { ...e, unreadCount: 0 } : e)
    );

    onSelectEmployee(item);
  };

  const renderEmployeeItem = ({ item }: { item: EmployeeProfile }) => {
    const initials = item.name
      ? item.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
      : 'EM';
    const isTyping = typingUsers[item.id];
    const snippetDisplay = formatDocOrMessageSnippet(item.lastMessageText);
    const hasConversation = isActualMessage(snippetDisplay) && !!item.lastMessageAt;
    const isRead = ChatReadManager.isRead(item.chatId, String(item.id), item.lastMessageAt);
    const unreadCount = isRead ? 0 : (Number(item.unreadCount) || 0);
    const msgTimeStr = hasConversation ? formatMessageTime(item.lastMessageAt) : '';
    const hasUnread = hasConversation && unreadCount > 0;
    const isSentByMe = hasConversation && item.lastSenderId === currentUserId;

    return (
      <TouchableOpacity
        style={[styles.card, isDark && styles.cardDark, hasUnread && styles.cardUnread]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.75}
      >
        {/* WhatsApp Avatar with Green Online Dot */}
        <View style={styles.avatarWrapper}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.id) }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: isTyping ? '#10b981' : (item.isOnline ? '#10b981' : '#94a3b8') },
            ]}
          />
        </View>

        {/* Chat Info Content */}
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, isDark && styles.textDark]} numberOfLines={1}>
              {item.name}
            </Text>
            {msgTimeStr ? (
              <Text style={[styles.timeText, hasUnread && styles.timeTextUnread]}>
                {msgTimeStr}
              </Text>
            ) : (
              <Text style={styles.empBadge}>{item.department || 'HRMS'}</Text>
            )}
          </View>

          <View style={styles.msgPreviewRow}>
            {isTyping ? (
              <Text style={styles.typingStatusText} numberOfLines={1}>
                ✍️ {t('communication:typing', { defaultValue: 'typing...' })}
              </Text>
            ) : hasConversation ? (
              <View style={styles.snippetRow}>
                {isSentByMe && (
                  <View style={{ marginRight: 4 }}>
                    <DoubleTickSvgIcon size={14} color="#007AFF" />
                  </View>
                )}
                <Text
                  style={[
                    styles.lastMsgText,
                    isDark && styles.textDarkSub,
                    hasUnread && styles.lastMsgTextUnread,
                  ]}
                  numberOfLines={1}
                >
                  {snippetDisplay}
                </Text>
              </View>
            ) : (
              <Text style={[styles.subText, isDark && styles.textDarkSub]} numberOfLines={1}>
                {item.designation || 'Team Member'} • <Text style={styles.deptText}>{item.department || 'Company'}</Text>
              </Text>
            )}

            {/* Unread Circle Badge (only if actual unread messages exist) */}
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>

        <IconSymbol name="chevron.right" size={18} color="#94a3b8" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* WhatsApp Header */}
      <View
        style={[
          styles.header,
          isDark && styles.headerDark,
          { paddingTop: Math.max(insets.top + 6, 16) },
        ]}
      >
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <BackArrowSvgIcon size={24} color="#0F172A" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>
            {t('communication:chats', { defaultValue: 'Chats' })}
          </Text>
          <Text style={styles.headerSubTitle}>Enterprise Realtime Messaging</Text>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
          <SearchSvgIcon size={18} color="#94a3b8" />
          <TextInput
            style={[styles.searchInput, isDark && styles.textDark]}
            placeholder={t('communication:search_placeholder', { defaultValue: 'Search messages or employees...' })}
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <IconSymbol name="xmark.circle.fill" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Segment Tabs: All Chats | Unread */}
      <View style={styles.tabSegmentRow}>
        <TouchableOpacity
          style={[styles.tabSegmentBtn, activeTab === 'ALL' && styles.tabSegmentActive]}
          onPress={() => setActiveTab('ALL')}
        >
          <Text style={[styles.tabSegmentText, activeTab === 'ALL' && styles.tabSegmentTextActive]}>
            {t('common:all_chats', { defaultValue: 'All Chats' })} ({employees.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabSegmentBtn, activeTab === 'UNREAD' && styles.tabSegmentActive]}
          onPress={() => setActiveTab('UNREAD')}
        >
          <Text style={[styles.tabSegmentText, activeTab === 'UNREAD' && styles.tabSegmentTextActive]}>
            {t('common:unread', { defaultValue: 'Unread' })} ({totalUnreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Department Filter Pills */}
      <View style={styles.filterWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={DEPARTMENTS}
          keyExtractor={item => item}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={({ item }) => {
            const isSelected = selectedDept === item;
            return (
              <TouchableOpacity
                style={[
                  styles.pill,
                  isSelected && styles.pillSelected,
                  isDark && !isSelected && styles.pillDark,
                ]}
                onPress={() => setSelectedDept(item)}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {item === 'ALL' ? t('common:all_depts', { defaultValue: 'All Depts' }) : item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Main Chat / Employee List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F172A" />
          <Text style={[styles.loadingText, isDark && styles.textDarkSub]}>
            {t('communication:loading_directory', { defaultValue: 'Loading team chats...' })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEmployees}
          keyExtractor={item => item.id}
          renderItem={renderEmployeeItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 56 + insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0F172A', '#10b981']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol name="person.2.fill" size={48} color="#cbd5e1" />
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                {t('communication:no_chats_found', { defaultValue: 'No Conversations Found' })}
              </Text>
              <Text style={[styles.emptySub, isDark && styles.textDarkSub]}>
                {t('communication:no_chats_sub', { defaultValue: 'Start a new conversation or change filter parameters.' })}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function getAvatarColor(id: string) {
  const colors = ['#0F172A', '#1E293B', '#334155', '#475569', '#0F172A'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatMessageTime(dateStr?: string | number | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  containerDark: {
    backgroundColor: '#0f172a',
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
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerSubTitle: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  searchBarDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    marginLeft: 8,
  },
  onlineSection: {
    marginVertical: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
    marginHorizontal: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  onlineUserItem: {
    alignItems: 'center',
    marginRight: 14,
    width: 56,
  },
  onlineAvatarWrapper: {
    position: 'relative',
  },
  onlineAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  onlineAvatarText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  onlineBadgeRing: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  onlineUserName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    marginTop: 4,
    textAlign: 'center',
  },
  tabSegmentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  tabSegmentBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#E2E8F0',
  },
  tabSegmentActive: {
    backgroundColor: '#0F172A',
  },
  tabSegmentText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
  },
  tabSegmentTextActive: {
    color: '#ffffff',
  },
  filterWrapper: {
    marginVertical: 4,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 6,
  },
  pillDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  pillSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  pillTextSelected: {
    color: '#ffffff',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  cardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  infoContainer: {
    flex: 1,
    marginRight: 6,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    flex: 1,
    marginRight: 6,
  },
  empBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  msgPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  snippetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  lastMsgText: {
    flex: 1,
    fontSize: 13,
    color: '#64748b',
  },
  lastMsgTextUnread: {
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subText: {
    fontSize: 12,
    color: '#64748b',
  },
  deptText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  typingStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#10b981',
  },
  timeText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  timeTextUnread: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  unreadBadge: {
    backgroundColor: '#10b981',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  textDark: {
    color: '#ffffff',
  },
  textDarkSub: {
    color: '#94a3b8',
  },
});
