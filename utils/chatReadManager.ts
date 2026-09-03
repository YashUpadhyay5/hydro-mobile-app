import AsyncStorage from '@react-native-async-storage/async-storage';

const inMemoryReadTimestamps = new Map<string, number>();
let isLoadedFromStorage = false;

const STORAGE_KEY = '@hrms_chat_read_timestamps_v2';

async function initReadManager() {
  if (isLoadedFromStorage) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        inMemoryReadTimestamps.set(String(k), Number(v));
      }
    }
  } catch (err) {
    console.warn('[initReadManager Error]', err);
  } finally {
    isLoadedFromStorage = true;
  }
}

// Initialize on app load
initReadManager();

export const ChatReadManager = {
  async markRead(chatIdOrUserId?: any) {
    if (chatIdOrUserId === undefined || chatIdOrUserId === null || chatIdOrUserId === '') return;
    const key = String(chatIdOrUserId);
    const now = Date.now();
    inMemoryReadTimestamps.set(key, now);
    try {
      const obj: Record<string, number> = {};
      inMemoryReadTimestamps.forEach((v, k) => {
        obj[k] = v;
      });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (err) {
      console.warn('[markRead save error]', err);
    }
  },

  isRead(chatId?: any, userId?: any, lastMessageAt?: any): boolean {
    const readTimeChat = (chatId !== undefined && chatId !== null && chatId !== '') ? (inMemoryReadTimestamps.get(String(chatId)) || 0) : 0;
    const readTimeUser = (userId !== undefined && userId !== null && userId !== '') ? (inMemoryReadTimestamps.get(String(userId)) || 0) : 0;
    const maxReadTime = Math.max(readTimeChat, readTimeUser);

    if (maxReadTime === 0) return false;

    if (!lastMessageAt) return true;

    const msgTime = new Date(lastMessageAt).getTime();
    if (isNaN(msgTime) || msgTime <= 0) return true;

    // If marked read within or after message timestamp, treat as READ
    return maxReadTime >= (msgTime - 5000);
  },

  getLastReadTime(chatIdOrUserId: string): number {
    return inMemoryReadTimestamps.get(String(chatIdOrUserId)) || 0;
  }
};
