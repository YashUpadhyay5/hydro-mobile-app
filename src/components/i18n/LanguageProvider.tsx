import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '@/src/i18n';
import initI18n from '@/src/i18n/config';
import { getInitialLanguage } from '@/src/i18n/detector';

interface LanguageContextType {
  isInitialized: boolean;
  currentLanguage: string;
  languages: SupportedLanguage[];
}

const LanguageContext = createContext<LanguageContextType>({
  isInitialized: false,
  currentLanguage: 'en',
  languages: SUPPORTED_LANGUAGES,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState('en');

  useEffect(() => {
    let isMounted = true;
    const setup = async () => {
      try {
        const initialLang = await getInitialLanguage();
        await initI18n(initialLang);
        if (isMounted) {
          setCurrentLanguage(initialLang);
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('[LanguageProvider] Failed to initialize i18n:', err);
        await initI18n('en');
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    };
    setup();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <LanguageContext.Provider value={{ isInitialized, currentLanguage, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguageContext = () => useContext(LanguageContext);
export default LanguageProvider;
