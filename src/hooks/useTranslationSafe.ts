import { useTranslation } from 'react-i18next';
import { Namespace } from '@/src/i18n/namespaces';

export const useTranslationSafe = (ns?: Namespace | Namespace[]) => {
  const { t, i18n } = useTranslation();

  const tSafe = (key: string, options?: any): string => {
    try {
      if (!key) return '';
      // If a default namespace is provided and the key doesn't have a colon prefix, support fallback lookup
      if (ns && typeof key === 'string' && !key.includes(':')) {
        const primaryNs = Array.isArray(ns) ? ns[0] : ns;
        const prefixedKey = `${primaryNs}:${key}`;
        const translatedPrefixed = t(prefixedKey, options);
        if (typeof translatedPrefixed === 'string' && translatedPrefixed !== prefixedKey) {
          return translatedPrefixed;
        }
      }
      const translated = t(key, options);
      if (typeof translated === 'string') return translated;
      return (options && typeof options.defaultValue === 'string') ? options.defaultValue : key;
    } catch (err) {
      console.warn(`[useTranslationSafe] Error translating key '${key}':`, err);
      return (options && typeof options.defaultValue === 'string') ? options.defaultValue : key;
    }
  };

  return { t: tSafe, i18n, currentLanguage: i18n?.language || 'en' };
};

export default useTranslationSafe;

