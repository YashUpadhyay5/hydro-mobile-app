export function getDocTypeInfo(fileName?: string, fileType?: string) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  const type = (fileType || '').toUpperCase();

  if (type === 'IMAGE' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'].includes(ext)) {
    return { icon: '📷', label: 'Photo' };
  }
  if (type === 'VIDEO' || ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'].includes(ext)) {
    return { icon: '🎥', label: 'Video' };
  }
  if (type === 'VOICE' || type === 'AUDIO' || ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'opus'].includes(ext)) {
    return { icon: '🎤', label: 'Voice message' };
  }
  if (type === 'PDF' || ext === 'pdf') {
    return { icon: '📄', label: 'PDF' };
  }
  if (type === 'WORD' || ['doc', 'docx', 'rtf'].includes(ext)) {
    return { icon: '📄', label: 'Word' };
  }
  if (type === 'EXCEL' || ['xls', 'xlsx', 'csv'].includes(ext)) {
    return { icon: '📊', label: 'Excel' };
  }
  if (type === 'PPT' || ['ppt', 'pptx'].includes(ext)) {
    return { icon: '📊', label: 'PowerPoint' };
  }
  if (type === 'ZIP' || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return { icon: '📦', label: 'Archive' };
  }
  if (type === 'TXT' || ['txt', 'log', 'md', 'json', 'xml'].includes(ext)) {
    return { icon: '📄', label: 'Document' };
  }
  return { icon: '📄', label: 'Document' };
}

export function formatDocOrMessageSnippet(msg: any): string {
  if (!msg) return '';

  let content = '';
  let type = '';
  let fileName = '';
  let firstAtt: any = null;

  if (typeof msg === 'string') {
    content = msg.trim();
    if (!content) return '';

    // Ignore placeholder non-messages
    if (
      content === 'Chat initialized' ||
      content === 'No messages yet' ||
      content === '[DIRECT]' ||
      content.toLowerCase() === 'chat initialized' ||
      content.toLowerCase() === 'no messages yet'
    ) {
      return '';
    }

    // Check if it already has rich formatting
    if (
      content.startsWith('📷') ||
      content.startsWith('🎥') ||
      content.startsWith('🎤') ||
      content.startsWith('📄') ||
      content.startsWith('📊') ||
      content.startsWith('📦')
    ) {
      return content;
    }

    const cleaned = content
      .replace(/^📄\s*/, '')
      .replace(/^📊\s*/, '')
      .replace(/^📦\s*/, '')
      .replace(/^📷\s*/, '')
      .trim();
    const extMatch = cleaned.match(/\.([a-zA-Z0-9]{2,5})(?:\?.*)?$/i);
    if (extMatch) {
      fileName = cleaned.split('/').pop() || cleaned;
      const ext = extMatch[1].toLowerCase();
      const docInfo = getDocTypeInfo(fileName, ext);
      return `${docInfo.icon} ${docInfo.label} • ${fileName}`;
    }

    if (content.toLowerCase().startsWith('[pdf]') || content.toLowerCase().endsWith('.pdf')) {
      return '📄 PDF';
    }
    if (
      content.toLowerCase().startsWith('[image]') ||
      content.toLowerCase().startsWith('photo') ||
      content.toLowerCase() === 'photo'
    ) {
      return '📷 Photo';
    }
    if (
      content.toLowerCase().startsWith('[excel]') ||
      content.toLowerCase().endsWith('.xlsx') ||
      content.toLowerCase().endsWith('.xls')
    ) {
      return '📊 Excel';
    }
    if (
      content.toLowerCase().startsWith('[word]') ||
      content.toLowerCase().endsWith('.docx') ||
      content.toLowerCase().endsWith('.doc')
    ) {
      return '📄 Word';
    }
    if (content.toLowerCase().startsWith('[voice]') || content.toLowerCase().startsWith('[audio]')) {
      return '🎤 Voice message';
    }
    return content;
  }

  content = (msg.content || '').trim();
  type = (msg.type || '').toUpperCase();
  firstAtt = msg.attachments && msg.attachments.length > 0 ? msg.attachments[0] : null;

  if (firstAtt || ['IMAGE', 'VIDEO', 'VOICE', 'AUDIO', 'PDF', 'WORD', 'EXCEL', 'ZIP', 'DOCUMENT'].includes(type)) {
    const docInfo = getDocTypeInfo(firstAtt?.fileName || content || '', firstAtt?.fileType || type);
    fileName = firstAtt?.fileName || '';

    if (docInfo.label === 'Photo') {
      return content && content !== '📷 Photo' && !content.startsWith('http') ? `📷 Photo: ${content}` : '📷 Photo';
    }
    if (docInfo.label === 'Video') {
      return content && content !== '🎥 Video' && !content.startsWith('http') ? `🎥 Video: ${content}` : '🎥 Video';
    }
    if (docInfo.label === 'Voice message') {
      return '🎤 Voice message';
    }

    if (
      content &&
      !content.startsWith('📄') &&
      !content.startsWith('📊') &&
      !content.startsWith('📦') &&
      !content.startsWith('http') &&
      content !== docInfo.label &&
      !content.match(/\.[a-zA-Z0-9]{2,5}$/)
    ) {
      return `${docInfo.icon} ${docInfo.label}: ${content}`;
    }
    if (fileName) {
      return `${docInfo.icon} ${docInfo.label} • ${fileName}`;
    }
    return `${docInfo.icon} ${docInfo.label}`;
  }

  // Check if content itself is a file url/name
  const extMatch = content.match(/\.([a-zA-Z0-9]{2,5})(?:\?.*)?$/i);
  if (extMatch) {
    const fn = content.split('/').pop() || content;
    const docInfo = getDocTypeInfo(fn, extMatch[1]);
    return `${docInfo.icon} ${docInfo.label} • ${fn}`;
  }

  return content;
}

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

class ChatNotificationManager {
  private notifiedIds = new Set<string>();
  private activeChatId: string | null = null;

  public setActiveChatId(chatId: string | null) {
    this.activeChatId = chatId;
  }

  public getActiveChatId(): string | null {
    return this.activeChatId;
  }

  public async notifyIfNew(newMsg: any, currentUserId: string | null | undefined) {
    if (!newMsg || Platform.OS === 'web') return;

    const senderId = String(newMsg.senderId || '');
    if (senderId && senderId === String(currentUserId)) {
      return; // Do not notify about own messages
    }

    const msgChatId = String(newMsg.chatId || '');
    // If the user is actively viewing this specific chat room, do not fire local popup notification
    if (this.activeChatId && msgChatId === this.activeChatId) {
      return;
    }

    const uniqueMsgId = String(newMsg.id || newMsg.tempId || `${msgChatId}_${newMsg.createdAt}`);
    if (this.notifiedIds.has(uniqueMsgId)) {
      return; // Deduplicated: already notified
    }

    this.notifiedIds.add(uniqueMsgId);
    if (this.notifiedIds.size > 200) {
      const first = this.notifiedIds.values().next().value;
      if (first) this.notifiedIds.delete(first);
    }

    try {
      const senderName = newMsg.senderName || 'Team Member';
      const textPreview = formatDocOrMessageSnippet(newMsg);

      await Notifications.scheduleNotificationAsync({
        identifier: `chat_${uniqueMsgId}`,
        content: {
          title: `💬 ${senderName}`,
          body: textPreview || 'New message',
          data: {
            chatId: msgChatId,
            senderId: senderId,
            senderName: senderName,
            type: 'CHAT',
          },
          sound: true,
          vibrate: [0, 250, 250, 250],
        },
        trigger: null,
      });
    } catch (err: any) {
      console.warn('[ChatNotificationManager Error]', err?.message);
    }
  }
}

export const chatNotificationManager = new ChatNotificationManager();

