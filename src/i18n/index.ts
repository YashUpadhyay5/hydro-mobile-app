import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES, DEFAULT_NAMESPACE } from './namespaces';
import { resources } from './config';

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  script?: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', script: 'Devanagari' },
  { code: 'bho', name: 'Bhojpuri', nativeName: 'भोजपुरी', dir: 'ltr', script: 'Devanagari' },
  { code: 'awadhi', name: 'Awadhi', nativeName: 'अवधी', dir: 'ltr', script: 'Devanagari' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', dir: 'ltr', script: 'Devanagari' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', dir: 'ltr', script: 'Gujarati' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr', script: 'Tamil' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr', script: 'Telugu' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', dir: 'ltr', script: 'Kannada' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', dir: 'ltr', script: 'Malayalam' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', dir: 'ltr', script: 'Gurmukhi' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', dir: 'ltr', script: 'Bengali' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', dir: 'ltr', script: 'Odia' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', dir: 'ltr', script: 'Bengali-Assamese' },
];

export const DEFAULT_LANGUAGE_CODE = 'en';

export const isLanguageSupported = (code: string): boolean => {
  if (!code) return false;
  const cleanCode = code.toLowerCase().split('-')[0].split('_')[0];
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === cleanCode);
};

export const getCleanLanguageCode = (code: string): string => {
  if (!code) return DEFAULT_LANGUAGE_CODE;
  const cleanCode = code.toLowerCase().split('-')[0].split('_')[0];
  return isLanguageSupported(cleanCode) ? cleanCode : DEFAULT_LANGUAGE_CODE;
};

export const getLanguageByCode = (code: string): SupportedLanguage => {
  const cleanCode = getCleanLanguageCode(code);
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === cleanCode) || SUPPORTED_LANGUAGES[0];
};

// Synchronous initialization at import time to prevent startup race conditions
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LANGUAGE_CODE,
    fallbackLng: DEFAULT_LANGUAGE_CODE,
    ns: NAMESPACES,
    defaultNS: DEFAULT_NAMESPACE,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });
}

export { i18n };
export default i18n;
