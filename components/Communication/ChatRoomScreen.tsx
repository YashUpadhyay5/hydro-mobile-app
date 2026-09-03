import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  Image,
  Clipboard,
  Keyboard,
  Linking,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  BackArrowSvgIcon,
  AttachmentSvgIcon,
  SendSvgIcon,
  DoubleTickSvgIcon,
} from '@/components/ui/SvgIcons';
import chatService, { EmployeeProfile, MessageItem, AttachmentItem } from '@/services/chatService';
import socketService from '@/services/socketService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import EmployeeChatDetailScreen from './EmployeeChatDetailScreen';
import { formatDocOrMessageSnippet, chatNotificationManager } from '@/utils/chatFormatting';
import { ChatReadManager } from '@/utils/chatReadManager';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

interface ChatRoomScreenProps {
  currentUserId: string;
  chatId: string;
  otherUser: EmployeeProfile;
  onBack: () => void;
}

export default function ChatRoomScreen({ currentUserId, chatId, otherUser, onBack }: ChatRoomScreenProps) {
  const { t } = useTranslationSafe(['communication', 'common', 'permissions']);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isTargetTyping, setIsTargetTyping] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [targetPresence, setTargetPresence] = useState({ isOnline: otherUser.isOnline, lastSeen: otherUser.lastSeen });
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageItem | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showChatDetailScreen, setShowChatDetailScreen] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentItem | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    fileName: string;
    fileType: string;
    fileSize?: number;
  } | null>(null);
  const [captionText, setCaptionText] = useState('');

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard Event Listeners for smooth position above soft keypad
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardVisible(true);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    let socket: any = null;

    // Track that user is actively viewing this specific chat
    chatNotificationManager.setActiveChatId(chatId);

    const handleReceiveMessage = async (newMsg: MessageItem) => {
      if (!newMsg) return;
      if (newMsg.chatId === chatId) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id || (m.tempId && m.tempId === newMsg.tempId))) {
            return prev.map(m => (m.tempId && m.tempId === newMsg.tempId) ? newMsg : m);
          }
          return [...prev, newMsg];
        });

        if (newMsg.senderId !== currentUserId) {
          socketService.markRead(chatId, newMsg.id);
          ChatReadManager.markRead(chatId);
          if (otherUser?.id) {
            ChatReadManager.markRead(otherUser.id);
          }
        }
      } else if (newMsg.senderId !== currentUserId) {
        // Single deduplicated local notification if message is from another conversation
        chatNotificationManager.notifyIfNew(newMsg, currentUserId);
      }
    };

    const handleTyping = (data: { chatId: string; employeeId: string; isTyping: boolean }) => {
      if (data.chatId === chatId && data.employeeId === otherUser?.id) {
        setIsTargetTyping(data.isTyping);
        if (data.isTyping) {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      }
    };

    const handleMessageRead = (data: { chatId: string; messageId: string }) => {
      if (data.chatId === chatId) {
        setMessages(prev =>
          prev.map(m => m.id === data.messageId ? { ...m, status: 'READ' } : m)
        );
      }
    };

    const handlePresence = (data: { employeeId: string; isOnline: boolean; lastSeen: string }) => {
      if (data.employeeId === otherUser?.id) {
        setTargetPresence({ isOnline: data.isOnline, lastSeen: data.lastSeen });
      }
    };

    const setupChat = async () => {
      try {
        setLoading(true);
        const history = await chatService.getMessages(chatId);
        setMessages(history);

        // Mark all messages as read immediately on entering chat
        chatService.markChatAsRead(chatId, currentUserId).catch(() => {});
        ChatReadManager.markRead(chatId);
        if (otherUser?.id) {
          ChatReadManager.markRead(otherUser.id);
        }

        socket = await socketService.connect(currentUserId);
        socketService.joinChat(chatId);
        socketService.markAllRead(chatId);

        // Detach any previous duplicate listeners before attaching
        socket.off('receive_message', handleReceiveMessage);
        socket.off('user_typing', handleTyping);
        socket.off('message_read', handleMessageRead);
        socket.off('user_presence', handlePresence);

        socket.on('receive_message', handleReceiveMessage);
        socket.on('user_typing', handleTyping);
        socket.on('message_read', handleMessageRead);
        socket.on('user_presence', handlePresence);

      } catch (err) {
        console.error('[ChatRoom setup error]', err);
      } finally {
        setLoading(false);
      }
    };

    setupChat();

    return () => {
      chatNotificationManager.setActiveChatId(null);
      if (socket) {
        socket.off('receive_message', handleReceiveMessage);
        socket.off('user_typing', handleTyping);
        socket.off('message_read', handleMessageRead);
        socket.off('user_presence', handlePresence);
      }
      socketService.leaveChat(chatId);
    };
  }, [chatId, currentUserId]);

  const handleInputChange = (text: string) => {
    setInputText(text);

    if (!isTyping) {
      setIsTyping(true);
      socketService.sendTyping(chatId, true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketService.sendTyping(chatId, false);
    }, 2000) as any;
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const content = inputText.trim();
    const tempId = Date.now().toString();
    const parentMsg = replyingTo;

    setInputText('');
    setReplyingTo(null);

    const tempMsg: MessageItem = {
      id: tempId,
      tempId,
      chatId,
      senderId: currentUserId,
      content,
      type: 'TEXT',
      status: 'SENT',
      createdAt: new Date().toISOString(),
      parentMessage: parentMsg || undefined,
    };

    setMessages(prev => [...prev, tempMsg]);

    socketService.sendMessage({
      chatId,
      content,
      type: 'TEXT',
      parentMessageId: parentMsg ? parentMsg.id : null,
      tempId,
    });
  };

  const handlePickCamera = async () => {
    setShowAttachmentMenu(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('permissions:denied_title', { defaultValue: 'Permission Denied' }), t('permissions:camera_required', { defaultValue: 'Access to camera is required.' }));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const name = asset.fileName || `photo_${Date.now()}.jpg`;
        setPendingAttachment({
          uri: asset.uri,
          fileName: name,
          fileType: 'IMAGE',
          fileSize: asset.fileSize,
        });
        setCaptionText('');
      }
    } catch (err) {
      console.error('[Pick Camera Error]', err);
    }
  };

  const handlePickImage = async () => {
    setShowAttachmentMenu(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('permissions:denied_title', { defaultValue: 'Permission Denied' }), t('permissions:photos_required', { defaultValue: 'Access to photos is required.' }));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const name = asset.fileName || `image_${Date.now()}.jpg`;
        setPendingAttachment({
          uri: asset.uri,
          fileName: name,
          fileType: 'IMAGE',
          fileSize: asset.fileSize,
        });
        setCaptionText('');
      }
    } catch (err) {
      console.error('[Pick Image Error]', err);
    }
  };

  const handlePickDocument = async () => {
    setShowAttachmentMenu(false);
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(t('permissions:denied_title', { defaultValue: 'Permission Denied' }), t('permissions:photos_required', { defaultValue: 'Storage & media permission is required to attach files.' }));
          return;
        }
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const doc = result.assets[0];
        let fileType: any = 'PDF';
        const name = (doc.name || 'document.pdf').toLowerCase();
        if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) fileType = 'EXCEL';
        else if (name.endsWith('.docx') || name.endsWith('.doc')) fileType = 'WORD';
        else if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) fileType = 'ZIP';

        setPendingAttachment({
          uri: doc.uri,
          fileName: doc.name,
          fileType,
          fileSize: doc.size,
        });
        setCaptionText('');
      }
    } catch (err) {
      console.error('[Pick Document Error]', err);
    }
  };

  const handleSendPendingAttachment = async () => {
    if (!pendingAttachment) return;
    const draft = pendingAttachment;
    const caption = captionText.trim();

    setPendingAttachment(null);
    setCaptionText('');

    try {
      setUploadingFile(true);
      const attachment = await chatService.uploadAttachment(draft.uri, draft.fileName, draft.fileType);

      const tempId = Date.now().toString();
      const contentText = caption || (draft.fileType === 'IMAGE' ? '📷 Photo' : `📄 ${draft.fileName}`);
      
      socketService.sendMessage({
        chatId,
        content: contentText,
        type: draft.fileType as any,
        tempId,
        attachments: [attachment],
      });
    } catch (err) {
      console.error('[uploadAndSendAttachment Error]', err);
      Alert.alert(t('common:error', { defaultValue: 'Upload Failed' }), t('communication:err_upload_att', { defaultValue: 'Could not upload attachment to backend server.' }));
    } finally {
      setUploadingFile(false);
    }
  };

  // Persistent Reactions Loading
  useEffect(() => {
    const loadSavedReactions = async () => {
      try {
        const stored = await AsyncStorage.getItem(`@chat_reactions_${chatId}`);
        if (stored) {
          setReactions(JSON.parse(stored));
        }
      } catch (err) {
        console.warn('[loadSavedReactions error]', err);
      }
    };
    loadSavedReactions();
  }, [chatId]);

  const handleDownloadAttachment = async (attUrl?: string, attName?: string) => {
    try {
      const targetUrl = attUrl || (selectedMessage?.attachments && selectedMessage.attachments[0]?.fileUrl) || previewAttachment?.fileUrl;
      const fileName = attName || (selectedMessage?.attachments && selectedMessage.attachments[0]?.fileName) || previewAttachment?.fileName || targetUrl?.split('/').pop() || `download_${Date.now()}`;
      if (!targetUrl) {
        Alert.alert('Download Error', 'Attachment URL is not available.');
        return;
      }

      const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(fileName) || targetUrl.includes('image') || targetUrl.includes('png') || targetUrl.includes('jpg');
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      const downloadRes = await FileSystem.downloadAsync(targetUrl, fileUri);

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
            `"${fileName}" has been saved directly to your phone's Photo Gallery (Album: HRMS App)!`
          );
          return;
        }
      }

      Alert.alert(
        t('common:success', { defaultValue: 'Download Complete 📥' }),
        `"${fileName}" has been saved to your device storage.`
      );
    } catch (err) {
      console.error('[Download Attachment Error]', err);
      Alert.alert('Download Error', 'Could not save file to device.');
    }
  };

  const handleLongPressMessage = (msg: MessageItem) => {
    setSelectedMessage(msg);
    setShowActionModal(true);
  };

  const handleCopyMessage = () => {
    if (selectedMessage) {
      Clipboard.setString(selectedMessage.content);
      setShowActionModal(false);
      Alert.alert(t('common:copied', { defaultValue: 'Copied' }), t('communication:msg_copied', { defaultValue: 'Message copied to clipboard.' }));
    }
  };

  const handleDeleteMessage = async (deleteForAll: boolean) => {
    if (!selectedMessage) return;
    try {
      await chatService.deleteMessage(selectedMessage.id, deleteForAll, currentUserId);
      setMessages(prev =>
        prev.map(m => m.id === selectedMessage.id ? { ...m, content: t('communication:msg_deleted', { defaultValue: 'This message was deleted' }), deletedForAll: true } : m)
      );
    } catch (err) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('communication:err_delete_msg', { defaultValue: 'Failed to delete message.' }));
    } finally {
      setShowActionModal(false);
    }
  };

  const handleReactToMessage = (emoji: string) => {
    if (!selectedMessage) return;
    const msgKey = selectedMessage.id || selectedMessage.tempId || '';
    setReactions(prev => {
      const existing = prev[msgKey] || [];
      const updated = existing.includes(emoji)
        ? existing.filter(e => e !== emoji)
        : [...existing, emoji];
      const nextState = { ...prev, [msgKey]: updated };
      AsyncStorage.setItem(`@chat_reactions_${chatId}`, JSON.stringify(nextState)).catch(() => {});
      return nextState;
    });
    setShowActionModal(false);
  };

  const renderMessageItem = ({ item, index }: { item: MessageItem; index: number }) => {
    const isMine = item.senderId === currentUserId;
    const showDateSeparator = index === 0 || shouldShowDateSeparator(messages[index - 1], item);

    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 35) {
          setReplyingTo(item);
        }
      },
    });

    return (
      <View>
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateText, isDark && styles.textDarkSub]}>
              {formatDateSeparator(item.createdAt)}
            </Text>
          </View>
        )}

        <View {...panResponder.panHandlers}>
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => handleLongPressMessage(item)}
            style={[
              styles.messageContainer,
              isMine ? styles.messageMineContainer : styles.messageOtherContainer,
            ]}
          >
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : (isDark ? styles.bubbleOtherDark : styles.bubbleOther),
            ]}
          >
            {/* Quoted WhatsApp Reply Card */}
            {(() => {
              const parentMsg = item.parentMessage || (item.parentMessageId ? messages.find(m => m.id === item.parentMessageId || m.tempId === item.parentMessageId) : null);
              if (!parentMsg) return null;
              return (
                <View style={[styles.replyContextBox, isMine ? styles.replyContextMine : styles.replyContextOther]}>
                  <Text style={[styles.replyContextTitle, isMine && { color: '#ffffff' }]}>
                    {parentMsg.senderId === currentUserId ? 'You' : otherUser.name}
                  </Text>
                  <Text style={[styles.replyContextText, isMine && { color: '#e0e7ff' }]} numberOfLines={2}>
                    {parentMsg.content || (parentMsg.attachments?.[0] ? `📷 ${parentMsg.attachments[0].fileName}` : 'Attachment')}
                  </Text>
                </View>
              );
            })()}

            {/* Attachments */}
            {item.attachments && item.attachments.map((att, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.attachmentCard}
                onPress={() => setPreviewAttachment(att)}
              >
                {att.fileType === 'IMAGE' ? (
                  <Image source={{ uri: att.fileUrl }} style={styles.attachmentImagePreview} />
                ) : (
                  <View style={styles.docAttachmentRow}>
                    <IconSymbol
                      name={getAttachmentIcon(att.fileType)}
                      size={24}
                      color={isMine ? '#ffffff' : '#007AFF'}
                    />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={[styles.attachmentName, isMine && { color: '#ffffff' }]} numberOfLines={1}>
                        {att.fileName}
                      </Text>
                      <Text style={[styles.attachmentSub, isMine && { color: '#e0e7ff' }]}>
                        {att.fileType} Document
                      </Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {/* Content */}
            <Text style={[styles.messageText, isMine ? styles.textMine : (isDark ? styles.textDark : styles.textOther)]}>
              {item.deletedForAll ? `🚫 ${t('communication:msg_deleted', { defaultValue: 'This message was deleted' })}` : item.content}
            </Text>

            {/* Footer Row (Time + SVG Read Ticks) */}
            <View style={styles.bubbleFooter}>
              {item.isEdited && <Text style={styles.editedTag}>{t('communication:edited', { defaultValue: 'edited' })} </Text>}
              <Text style={[styles.timeText, isMine ? styles.timeMine : styles.timeOther]}>
                {formatTime(item.createdAt)}
              </Text>

              {isMine && (
                <View style={{ marginLeft: 4 }}>
                  <DoubleTickSvgIcon
                    size={15}
                    color={item.status === 'READ' ? '#38bdf8' : '#e0e7ff'}
                  />
                </View>
              )}
            </View>

            {/* Emoji Reactions Badge (WhatsApp exact floating position) */}
            {reactions[item.id || item.tempId || ''] && reactions[item.id || item.tempId || ''].length > 0 && (
              <View
                style={[
                  styles.reactionBadgeBox,
                  isMine ? styles.reactionBadgeMine : styles.reactionBadgeOther,
                  isDark && styles.reactionBadgeBoxDark,
                ]}
              >
                <Text style={styles.reactionBadgeText}>
                  {reactions[item.id || item.tempId || ''].join(' ')}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (showChatDetailScreen) {
    return (
      <EmployeeChatDetailScreen
        employee={otherUser}
        messages={messages}
        onBack={() => setShowChatDetailScreen(false)}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header with Dynamic Safe Area */}
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

        <TouchableOpacity style={styles.headerProfile} onPress={() => setShowChatDetailScreen(true)}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {otherUser.name ? otherUser.name.substring(0, 2).toUpperCase() : 'EM'}
            </Text>
            <View
              style={[
                styles.headerOnlineDot,
                { backgroundColor: targetPresence.isOnline ? '#10b981' : '#94a3b8' },
              ]}
            />
          </View>

          <View style={{ marginLeft: 10 }}>
            <Text style={[styles.headerName, isDark && styles.textDark]}>{otherUser.name}</Text>
            <Text style={[styles.headerSub, isTargetTyping && styles.typingSubText]}>
              {isTargetTyping
                ? `✍️ ${t('communication:typing', { defaultValue: 'typing...' })}`
                : targetPresence.isOnline
                ? t('common:active_now', { defaultValue: 'Active now' })
                : `${t('communication:last_seen', { defaultValue: 'Last seen' })} ${formatTime(targetPresence.lastSeen)}`}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Messages FlatList */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#0F172A" />
          <Text style={[styles.loadingText, isDark && styles.textDarkSub]}>{t('communication:connecting_chat', { defaultValue: 'Connecting socket & loading messages...' })}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id || item.tempId || Math.random().toString()}
            renderItem={renderMessageItem}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />

          {/* WhatsApp-style Floating Typing Indicator Bubble */}
          {isTargetTyping && (
            <View style={[styles.typingBubble, isDark ? styles.typingBubbleDark : styles.typingBubbleLight]}>
              <View style={styles.typingDotRow}>
                <Text style={styles.typingBubbleText}>✍️ {otherUser.name} {t('communication:is_typing', { defaultValue: 'is typing' })}</Text>
                <ActivityIndicator size="small" color="#10b981" style={{ marginLeft: 6 }} />
              </View>
            </View>
          )}
        </View>
      )}

      {/* Uploading File Bar */}
      {uploadingFile && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color="#0F172A" />
          <Text style={styles.uploadingText}>{t('communication:uploading_att', { defaultValue: 'Uploading attachment to backend server...' })}</Text>
        </View>
      )}

      {/* Reply Preview Bar */}
      {replyingTo && (
        <View style={[styles.replyBar, isDark && styles.replyBarDark]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyTitle}>{t('communication:replying_to', { defaultValue: 'Replying to' })} {replyingTo.senderId === currentUserId ? t('communication:yourself', { defaultValue: 'yourself' }) : otherUser.name}</Text>
            <Text style={styles.replyText} numberOfLines={1}>{replyingTo.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <IconSymbol name="xmark.circle.fill" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input Bar positioned flush above soft keypad or bottom navigation bar */}
      <View
        style={[
          styles.inputBar,
          isDark && styles.inputBarDark,
          {
            paddingBottom: isKeyboardVisible
              ? 8
              : 56 + insets.bottom + 6,
          },
        ]}
      >
        <TouchableOpacity style={styles.attachBtn} onPress={() => setShowAttachmentMenu(true)}>
          <AttachmentSvgIcon size={22} color="#0F172A" />
        </TouchableOpacity>

        <TextInput
          style={[styles.input, isDark && styles.textDark]}
          placeholder={t('communication:type_message', { defaultValue: 'Type message...' })}
          placeholderTextColor="#94a3b8"
          value={inputText}
          onChangeText={handleInputChange}
          multiline
        />

        <TouchableOpacity
          style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <SendSvgIcon size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Attachment Options Modal */}
      <Modal visible={showAttachmentMenu} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAttachmentMenu(false)}
        >
          <View style={[styles.attachmentMenuBox, isDark && styles.cardDark, { paddingBottom: Math.max(insets.bottom + 16, 20) }]}>
            <Text style={[styles.menuTitle, isDark && styles.textDark]}>{t('communication:send_attachment', { defaultValue: 'Send Attachment' })}</Text>
            
            <TouchableOpacity style={styles.menuOption} onPress={handlePickCamera}>
              <View style={[styles.menuIconCircle, { backgroundColor: '#e0e7ff' }]}>
                <IconSymbol name="camera.fill" size={20} color="#6366f1" />
              </View>
              <Text style={[styles.menuOptionText, isDark && styles.textDark]}>{t('communication:take_photo', { defaultValue: 'Camera / Take Photo' })}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuOption} onPress={handlePickImage}>
              <View style={[styles.menuIconCircle, { backgroundColor: '#dbeafe' }]}>
                <IconSymbol name="photo.fill" size={20} color="#007AFF" />
              </View>
              <Text style={[styles.menuOptionText, isDark && styles.textDark]}>{t('communication:img_gallery', { defaultValue: 'Image / Gallery' })}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuOption} onPress={handlePickDocument}>
              <View style={[styles.menuIconCircle, { backgroundColor: '#dcfce7' }]}>
                <IconSymbol name="doc.fill" size={20} color="#10b981" />
              </View>
              <Text style={[styles.menuOptionText, isDark && styles.textDark]}>{t('communication:doc_types', { defaultValue: 'Document (PDF, Excel, Word, ZIP)' })}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Long Press Action Modal */}
      <Modal visible={showActionModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowActionModal(false)}
        >
          <View style={[styles.attachmentMenuBox, isDark && styles.cardDark, { paddingBottom: Math.max(insets.bottom + 16, 20) }]}>
            {/* Quick Emoji Reaction Bar (WhatsApp Style) */}
            <View style={styles.reactionBarContainer}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.reactionEmojiBtn}
                  onPress={() => handleReactToMessage(emoji)}
                >
                  <Text style={styles.reactionEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.menuTitle, isDark && styles.textDark]}>{t('communication:msg_options', { defaultValue: 'Message Options' })}</Text>

            <TouchableOpacity style={styles.menuOption} onPress={() => { setReplyingTo(selectedMessage); setShowActionModal(false); }}>
              <IconSymbol name="arrowshape.turn.up.left.fill" size={20} color="#007AFF" />
              <Text style={[styles.menuOptionText, isDark && styles.textDark]}>{t('communication:reply', { defaultValue: 'Reply' })}</Text>
            </TouchableOpacity>

            {selectedMessage?.attachments && selectedMessage.attachments.length > 0 && (
              <TouchableOpacity style={styles.menuOption} onPress={() => { handleDownloadAttachment(); setShowActionModal(false); }}>
                <IconSymbol name="arrow.down.circle.fill" size={20} color="#10b981" />
                <Text style={[styles.menuOptionText, { color: '#10b981', fontWeight: '600' }]}>{t('communication:download_attachment', { defaultValue: 'Download / Open File' })}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.menuOption} onPress={handleCopyMessage}>
              <IconSymbol name="doc.on.doc.fill" size={20} color="#6366f1" />
              <Text style={[styles.menuOptionText, isDark && styles.textDark]}>{t('communication:copy_msg', { defaultValue: 'Copy Message' })}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuOption} onPress={() => handleDeleteMessage(false)}>
              <IconSymbol name="trash.fill" size={20} color="#f59e0b" />
              <Text style={[styles.menuOptionText, isDark && styles.textDark]}>{t('communication:delete_for_me', { defaultValue: 'Delete for Me' })}</Text>
            </TouchableOpacity>

            {selectedMessage?.senderId === currentUserId && (
              <TouchableOpacity style={styles.menuOption} onPress={() => handleDeleteMessage(true)}>
                <IconSymbol name="trash.fill" size={20} color="#ef4444" />
                <Text style={[styles.menuOptionText, { color: '#ef4444' }]}>{t('communication:delete_for_everyone', { defaultValue: 'Delete for Everyone' })}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* WhatsApp-Style Fullscreen Attachment Stage & Caption Modal */}
      <Modal visible={!!pendingAttachment} transparent animationType="slide">
        <View style={styles.stageModalContainer}>
          {/* Top Bar */}
          <View style={[styles.stageHeader, { paddingTop: Math.max(insets.top + 8, 20) }]}>
            <TouchableOpacity onPress={() => setPendingAttachment(null)} style={styles.stageCloseBtn}>
              <IconSymbol name="xmark" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={styles.stageFileName} numberOfLines={1}>{pendingAttachment?.fileName}</Text>
              <Text style={styles.stageFileType}>{pendingAttachment?.fileType} Document</Text>
            </View>
          </View>

          {/* Center Stage Preview */}
          <View style={styles.stageBody}>
            {pendingAttachment?.fileType === 'IMAGE' ? (
              <Image source={{ uri: pendingAttachment.uri }} style={styles.stageImagePreview} resizeMode="contain" />
            ) : (
              <View style={styles.stageDocCard}>
                <IconSymbol name={getAttachmentIcon(pendingAttachment?.fileType)} size={72} color="#ffffff" />
                <Text style={styles.stageDocTitle} numberOfLines={2}>{pendingAttachment?.fileName}</Text>
                <View style={styles.stageDocBadge}>
                  <Text style={styles.stageDocBadgeText}>{pendingAttachment?.fileType}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Bottom Caption Input & Send (WhatsApp Style) */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.stageCaptionBar, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
              <TextInput
                style={styles.stageCaptionInput}
                placeholder={t('communication:add_caption', { defaultValue: 'Add a caption...' })}
                placeholderTextColor="#94a3b8"
                value={captionText}
                onChangeText={setCaptionText}
                multiline
              />
              <TouchableOpacity style={styles.stageSendBtn} onPress={handleSendPendingAttachment}>
                <SendSvgIcon size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Preview Attachment Modal */}
      <Modal visible={!!previewAttachment} transparent animationType="slide">
        <View style={styles.previewModalContainer}>
          <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewAttachment(null)}>
            <IconSymbol name="xmark.circle.fill" size={32} color="#ffffff" />
          </TouchableOpacity>

          {previewAttachment?.fileType === 'IMAGE' ? (
            <Image source={{ uri: previewAttachment.fileUrl }} style={styles.fullPreviewImage} resizeMode="contain" />
          ) : (
            <View style={styles.docPreviewBox}>
              <IconSymbol name={getAttachmentIcon(previewAttachment?.fileType)} size={64} color="#ffffff" />
              <Text style={styles.docPreviewTitle}>{previewAttachment?.fileName}</Text>
              <Text style={styles.docPreviewSub}>Document URL: {previewAttachment?.fileUrl}</Text>
            </View>
          )}

          {/* Preview Footer with Download & Action Options */}
          <View style={[styles.previewFooterRow, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <TouchableOpacity
              style={styles.previewDownloadBtn}
              onPress={() => {
                if (previewAttachment) handleDownloadAttachment(previewAttachment.fileUrl, previewAttachment.fileName);
              }}
            >
              <IconSymbol name="arrow.down.circle.fill" size={20} color="#ffffff" />
              <Text style={styles.previewDownloadText}>{t('communication:download_file', { defaultValue: 'Download / Save File' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function shouldShowDateSeparator(prevMsg: MessageItem, currentMsg: MessageItem) {
  if (!prevMsg) return true;
  const d1 = new Date(prevMsg.createdAt).toDateString();
  const d2 = new Date(currentMsg.createdAt).toDateString();
  return d1 !== d2;
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getAttachmentIcon(fileType?: string) {
  switch (fileType) {
    case 'IMAGE': return 'photo.fill';
    case 'EXCEL': return 'tablecells.fill';
    case 'WORD': return 'doc.text.fill';
    case 'ZIP': return 'archivebox.fill';
    default: return 'doc.fill';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
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
    marginRight: 10,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerAvatarText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  headerOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  headerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerSub: {
    fontSize: 12,
    color: '#10b981',
  },
  typingSubText: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 13,
  },
  dateSeparator: {
    alignSelf: 'center',
    backgroundColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginVertical: 10,
  },
  dateText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  messageContainer: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  messageMineContainer: {
    alignSelf: 'flex-end',
  },
  messageOtherContainer: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    padding: 12,
  },
  bubbleMine: {
    backgroundColor: '#0F172A',
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 2,
  },
  bubbleOtherDark: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 2,
  },
  replyContextBox: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  replyContextMine: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderLeftColor: '#ffffff',
  },
  replyContextOther: {
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderLeftColor: '#10b981',
  },
  replyContextTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#10b981',
  },
  replyContextText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  textMine: {
    color: '#ffffff',
  },
  textOther: {
    color: '#0f172a',
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  editedTag: {
    fontSize: 10,
    color: '#cbd5e1',
    fontStyle: 'italic',
  },
  timeText: {
    fontSize: 10,
  },
  timeMine: {
    color: '#e0e7ff',
  },
  timeOther: {
    color: '#94a3b8',
  },
  typingBubble: {
    alignSelf: 'flex-start',
    marginLeft: 12,
    marginBottom: 8,
    borderRadius: 16,
    borderBottomLeftRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typingBubbleLight: {
    backgroundColor: '#e2e8f0',
  },
  typingBubbleDark: {
    backgroundColor: '#1e293b',
  },
  typingDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingBubbleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    padding: 8,
    paddingHorizontal: 16,
  },
  uploadingText: {
    fontSize: 12,
    color: '#0284c7',
    marginLeft: 8,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    padding: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
  },
  replyBarDark: {
    backgroundColor: '#334155',
    borderTopColor: '#475569',
  },
  replyTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  replyText: {
    fontSize: 12,
    color: '#475569',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  inputBarDark: {
    backgroundColor: '#1e293b',
    borderTopColor: '#334155',
  },
  attachBtn: {
    padding: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingHorizontal: 12,
    color: '#0f172a',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  attachmentMenuBox: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuOptionText: {
    fontSize: 15,
    marginLeft: 14,
    color: '#0f172a',
  },
  menuIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentCard: {
    marginVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  attachmentImagePreview: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  docAttachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    borderRadius: 8,
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  attachmentSub: {
    fontSize: 11,
    color: '#64748b',
  },
  previewModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  fullPreviewImage: {
    width: '100%',
    height: '80%',
  },
  docPreviewBox: {
    alignItems: 'center',
    padding: 20,
  },
  docPreviewTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  docPreviewSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
  },
  cardDark: {
    backgroundColor: '#1e293b',
  },
  textDark: {
    color: '#ffffff',
  },
  textDarkSub: {
    color: '#94a3b8',
  },
  stageModalContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  stageCloseBtn: {
    padding: 8,
  },
  stageFileName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stageFileType: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  stageBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  stageImagePreview: {
    width: '100%',
    height: '100%',
  },
  stageDocCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    width: '85%',
  },
  stageDocTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  stageDocBadge: {
    backgroundColor: '#334155',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  stageDocBadgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stageCaptionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  stageCaptionInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    maxHeight: 90,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stageSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  previewFooterRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
  },
  previewDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  previewDownloadText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 8,
  },
  reactionBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#f1f5f9',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  reactionEmojiBtn: {
    padding: 6,
  },
  reactionEmojiText: {
    fontSize: 22,
  },
  reactionBadgeBox: {
    position: 'absolute',
    bottom: -11,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2.5,
    elevation: 3,
    zIndex: 10,
  },
  reactionBadgeMine: {
    right: 8,
  },
  reactionBadgeOther: {
    left: 8,
  },
  reactionBadgeBoxDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  reactionBadgeText: {
    fontSize: 12,
    lineHeight: 15,
  },
});
