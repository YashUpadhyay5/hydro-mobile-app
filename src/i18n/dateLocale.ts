import i18n from 'i18next';

const LOCALE_TAGS: Record<string, string> = {
  hi: 'hi-IN',
  bho: 'hi-IN',
  awadhi: 'hi-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  bn: 'bn-IN',
  or: 'or-IN',
  as: 'as-IN',
  es: 'es-ES',
};

/** Locale tag for dates, times and numbers, following the language chosen in the app (not the phone's). */
export const getDateLocale = (): string => {
  const code = (i18n.language || 'en').toLowerCase().split('-')[0];
  return LOCALE_TAGS[code] || 'en-IN';
};

export default getDateLocale;
