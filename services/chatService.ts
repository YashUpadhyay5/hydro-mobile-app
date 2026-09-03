import api from './api';

export interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string;
  department: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen: string;
  lastMessageText?: string | null;
  lastMessageAt?: string | number | null;
  lastSenderId?: string | null;
  unreadCount?: number;
  chatId?: string;
}

export interface Conversation {
  chatId: string;
  type: string;
  title: string;
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  otherUser?: EmployeeProfile;
}

export interface AttachmentItem {
  id?: string;
  fileName: string;
  fileUrl: string;
  fileType: 'IMAGE' | 'PDF' | 'EXCEL' | 'WORD' | 'ZIP' | 'VOICE';
  fileSize?: number;
  mimeType?: string;
}

export interface MessageItem {
  id: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  parentMessageId?: string | null;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'PDF' | 'EXCEL' | 'WORD' | 'ZIP' | 'VOICE';
  status: 'SENT' | 'DELIVERED' | 'READ';
  isEdited?: boolean;
  deletedForAll?: boolean;
  createdAt: string;
  attachments?: AttachmentItem[];
  parentMessage?: MessageItem;
  tempId?: string;
}

function getMimeType(fileName: string): string {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv';
    case 'zip':
      return 'application/zip';
    case 'rar':
      return 'application/x-rar-compressed';
    case 'txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

export const chatService = {
  // Get directory of employees
  async getEmployees(params?: { search?: string; department?: string; currentUserId?: string }): Promise<EmployeeProfile[]> {
    const res = await api.get('/chat/employees', { params });
    return res.data.employees || [];
  },

  // Get active conversations list
  async getConversations(employeeId: string): Promise<Conversation[]> {
    const res = await api.get('/chat/conversations', { params: { employeeId } });
    return res.data.conversations || [];
  },

  // Initialize or fetch direct chat
  async getOrCreateDirectChat(currentUserId: string, targetEmployeeId: string): Promise<{ chatId: string; otherUser: EmployeeProfile }> {
    const res = await api.post('/chat/direct', { currentUserId, targetEmployeeId });
    return res.data;
  },

  // Get message history for chat room
  async getMessages(chatId: string, limit = 50, offset = 0): Promise<MessageItem[]> {
    const res = await api.get(`/chat/messages/${chatId}`, { params: { limit, offset } });
    return res.data.messages || [];
  },

  // Upload attachment file to company server
  async uploadAttachment(fileUri: string, fileName: string, fileTypeStr: string): Promise<AttachmentItem> {
    const formData = new FormData();
    const mimeType = getMimeType(fileName);
    const cleanFileName = fileName || `file_${Date.now()}`;

    formData.append('file', {
      uri: fileUri,
      name: cleanFileName,
      type: mimeType,
    } as any);

    const res = await api.post('/chat/upload', formData, {
      headers: {
        'Accept': 'application/json',
      },
      transformRequest: [(data) => data],
    });

    return res.data.attachment;
  },

  // Delete message
  async deleteMessage(messageId: string, deleteForAll: boolean, employeeId: string) {
    const res = await api.post(`/chat/messages/${messageId}/delete`, { deleteForAll, employeeId });
    return res.data;
  },

  // Edit message
  async editMessage(messageId: string, content: string) {
    const res = await api.put(`/chat/messages/${messageId}`, { content });
    return res.data;
  },

  // Mark all messages in a chat as read
  async markChatAsRead(chatId: string, employeeId?: string) {
    try {
      const res = await api.post(`/chat/messages/${chatId}/read`, { employeeId });
      return res.data;
    } catch (err) {
      // Fallback endpoint if needed
      try {
        const res2 = await api.post('/chat/mark-read', { chatId, employeeId });
        return res2.data;
      } catch (err2) {
        return { success: false };
      }
    }
  },

  // Toggle Pin chat
  async togglePinChat(chatId: string, employeeId: string) {
    const res = await api.post('/chat/pin', { chatId, employeeId });
    return res.data;
  },

  // Toggle Archive chat
  async toggleArchiveChat(chatId: string, employeeId: string) {
    const res = await api.post('/chat/archive', { chatId, employeeId });
    return res.data;
  },
};

export default chatService;
