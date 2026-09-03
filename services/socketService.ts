import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@/constants/API';

class SocketService {
  private socket: Socket | null = null;
  private currentUserId: string | null = null;

  public async connect(userId: string): Promise<Socket> {
    if (this.socket && this.socket.connected && this.currentUserId === userId) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.currentUserId = userId;
    const token = await SecureStore.getItemAsync('userToken');
    const socketUrl = API_BASE_URL.replace('/api', '');

    this.socket = io(socketUrl, {
      auth: {
        token,
        employeeId: userId,
      },
      query: {
        employeeId: userId,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket Connected] Connected to server, socketId:', this.socket?.id);
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[Socket Connection Error]', error.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket Disconnected]', reason);
    });

    return this.socket;
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public joinChat(chatId: string) {
    if (this.socket) {
      this.socket.emit('join_chat', chatId);
    }
  }

  public leaveChat(chatId: string) {
    if (this.socket) {
      this.socket.emit('leave_chat', chatId);
    }
  }

  public sendTyping(chatId: string, isTyping: boolean) {
    if (this.socket) {
      this.socket.emit(isTyping ? 'typing_start' : 'typing_stop', { chatId });
    }
  }

  public sendMessage(payload: {
    chatId: string;
    content: string;
    type?: string;
    parentMessageId?: string | null;
    tempId?: string;
    attachments?: any[];
  }) {
    if (this.socket) {
      this.socket.emit('send_message', payload);
    }
  }

  public markRead(chatId: string, messageId: string) {
    if (this.socket) {
      this.socket.emit('mark_read', { chatId, messageId });
    }
  }

  public markAllRead(chatId: string) {
    if (this.socket) {
      this.socket.emit('mark_read', { chatId });
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentUserId = null;
    }
  }
}

export const socketService = new SocketService();
export default socketService;
