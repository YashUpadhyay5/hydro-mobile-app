import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCleanLanguageCode, DEFAULT_LANGUAGE_CODE, isLanguageSupported } from './index';

export const LANGUAGE_STORAGE_KEY = 'user_language_preference';

/**
 * Detect device language using expo-localization or navigator
 */
export const detectDeviceLanguage = (): string => {
  try {
    // Expo localization check
    let expoLocalization: any;
    try {
      expoLocalization = require('expo-localization');
    } catch {
      // module not found or web fallback
    }

    if (expoLocalization?.getLocales) {
      const locales = expoLocalization.getLocales();
      if (locales && locales.length > 0) {
        const primaryCode = locales[0].languageCode;
        if (primaryCode && isLanguageSupported(primaryCode)) {
          return getCleanLanguageCode(primaryCode);
        }
      }
    } else if (expoLocalization?.locale) {
      const primaryCode = expoLocalization.locale;
      if (primaryCode && isLanguageSupported(primaryCode)) {
        return getCleanLanguageCode(primaryCode);
      }
    }

    // Web browser fallback
    if (typeof navigator !== 'undefined' && navigator.language) {
      const browserLang = navigator.language;
      if (browserLang && isLanguageSupported(browserLang)) {
        return getCleanLanguageCode(browserLang);
      }
    }
  } catch (err) {
    console.warn('[i18n Detector] Failed to detect device language:', err);
  }

  return DEFAULT_LANGUAGE_CODE;
};

/**
 * Get stored language or fallback to device language
 */
export const getInitialLanguage = async (): Promise<string> => {
  try {
    const storedLang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLang && isLanguageSupported(storedLang)) {
      return getCleanLanguageCode(storedLang);
    }
  } catch (err) {
    console.warn('[i18n Detector] Error reading stored language preference:', err);
  }

  return detectDeviceLanguage();
};
