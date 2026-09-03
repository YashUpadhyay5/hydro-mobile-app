import { useLanguage } from './useLanguage';
import { SupportedLanguage } from '@/src/i18n';

export const useCurrentLanguage = (): { code: string; language: SupportedLanguage; nativeName: string } => {
  const { currentLanguage, language } = useLanguage();
  return {
    code: currentLanguage,
    language,
    nativeName: language.nativeName,
  };
};

export default useCurrentLanguage;
