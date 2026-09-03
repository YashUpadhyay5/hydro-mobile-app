import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGE_STORAGE_KEY } from './detector';
import { getCleanLanguageCode, isLanguageSupported, DEFAULT_LANGUAGE_CODE } from './index';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';

export class LanguageService {
  /**
   * Save selected language preference to local storage and sync to backend user record if authenticated
   */
  static async setLanguage(languageCode: string, userId?: string): Promise<string> {
    const cleanCode = getCleanLanguageCode(languageCode);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, cleanCode);

      // Sync user language preference with backend database
      if (userId) {
        try {
          await api.patch(`${API_BASE_URL}/employees/${userId}/language`, { language: cleanCode });
          console.log(`[LanguageService] Successfully synced language '${cleanCode}' to user profile`);
        } catch (apiErr: any) {
          console.warn('[LanguageService] Syncing language to backend profile skipped/failed:', apiErr.message);
        }
      }
    } catch (err) {
      console.error('[LanguageService] Error persisting language preference:', err);
    }
    return cleanCode;
  }

  /**
   * Get current persisted language
   */
  static async getStoredLanguage(): Promise<string> {
    try {
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored && isLanguageSupported(stored)) {
        return getCleanLanguageCode(stored);
      }
    } catch (err) {
      console.error('[LanguageService] Error reading language preference:', err);
    }
    return DEFAULT_LANGUAGE_CODE;
  }

  /**
   * Reset language preference to default
   */
  static async resetLanguage(): Promise<string> {
    try {
      await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
    } catch (err) {
      console.error('[LanguageService] Error resetting language preference:', err);
    }
    return DEFAULT_LANGUAGE_CODE;
  }
}

export default LanguageService;
