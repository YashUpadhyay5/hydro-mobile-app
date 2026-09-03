import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, SupportedLanguage, getLanguageByCode } from '@/src/i18n';
import LanguageService from '@/src/i18n/languageService';
import { useAuth } from '@/context/AuthContext';

export interface UseLanguageResult {
  currentLanguage: string;
  language: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
  changeLanguage: (code: string) => Promise<void>;
  resetLanguage: () => Promise<void>;
  isRTL: boolean;
  isLoading: boolean;
}

export const useLanguage = (): UseLanguageResult => {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [currentLangCode, setCurrentLangCode] = useState<string>(i18n.language || 'en');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      setCurrentLangCode(lng);
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  const changeLanguage = useCallback(
    async (code: string) => {
      setIsLoading(true);
      try {
        const savedCode = await LanguageService.setLanguage(code, user?.id);
        await i18n.changeLanguage(savedCode);
        setCurrentLangCode(savedCode);
      } catch (err) {
        console.error('[useLanguage] Failed to change language:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [i18n, user?.id]
  );

  const resetLanguage = useCallback(async () => {
    setIsLoading(true);
    try {
      const defaultCode = await LanguageService.resetLanguage();
      await i18n.changeLanguage(defaultCode);
      setCurrentLangCode(defaultCode);
    } catch (err) {
      console.error('[useLanguage] Failed to reset language:', err);
    } finally {
      setIsLoading(false);
    }
  }, [i18n]);

  const language = getLanguageByCode(currentLangCode);

  return {
    currentLanguage: currentLangCode,
    language,
    supportedLanguages: SUPPORTED_LANGUAGES,
    changeLanguage,
    resetLanguage,
    isRTL: language.dir === 'rtl',
    isLoading,
  };
};

export default useLanguage;
