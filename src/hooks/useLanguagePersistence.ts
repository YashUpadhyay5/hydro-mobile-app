import { useEffect } from 'react';
import { getInitialLanguage } from '@/src/i18n/detector';
import LanguageService from '@/src/i18n/languageService';
import { useLanguage } from './useLanguage';
import { useAuth } from '@/context/AuthContext';

export const useLanguagePersistence = () => {
  const { changeLanguage, currentLanguage } = useLanguage();
  const { user } = useAuth();

  useEffect(() => {
    const initPersistence = async () => {
      // If user profile contains language from backend, prioritize it
      if (user?.language && user.language !== currentLanguage) {
        await changeLanguage(user.language);
        return;
      }

      // Otherwise detect or load from local storage
      const initialLang = await getInitialLanguage();
      if (initialLang && initialLang !== currentLanguage) {
        await changeLanguage(initialLang);
      }
    };

    initPersistence();
  }, [user?.id, user?.language]);
};

export default useLanguagePersistence;
