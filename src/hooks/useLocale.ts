import { useLanguage } from './useLanguage';

export interface UseLocaleResult {
  locale: string;
  isIndianLocale: boolean;
  currencyCode: string;
  timeZone: string;
}

export const useLocale = (): UseLocaleResult => {
  const { currentLanguage } = useLanguage();

  const getLocaleTag = (code: string): string => {
    switch (code) {
      case 'hi': return 'hi-IN';
      case 'mr': return 'mr-IN';
      case 'gu': return 'gu-IN';
      case 'ta': return 'ta-IN';
      case 'te': return 'te-IN';
      case 'kn': return 'kn-IN';
      case 'ml': return 'ml-IN';
      case 'pa': return 'pa-IN';
      case 'bn': return 'bn-IN';
      case 'or': return 'or-IN';
      case 'as': return 'as-IN';
      default: return 'en-IN';
    }
  };

  const locale = getLocaleTag(currentLanguage);

  return {
    locale,
    isIndianLocale: true,
    currencyCode: 'INR',
    timeZone: 'Asia/Kolkata',
  };
};

export default useLocale;
