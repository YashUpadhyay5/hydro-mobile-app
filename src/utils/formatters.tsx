import React from 'react';
import { Text, TextProps } from 'react-native';
import { useLocale } from '@/src/hooks/useLocale';

export const formatDate = (date: Date | string | number, locale: string = 'en-IN', options?: Intl.DateTimeFormatOptions): string => {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return String(date);

    const defaultOptions: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...options,
    };

    return new Intl.DateTimeFormat(locale, defaultOptions).format(d);
  } catch (err) {
    console.warn('[Formatters] Error formatting date:', err);
    return String(date);
  }
};

export const formatTime = (date: Date | string | number, locale: string = 'en-IN', options?: Intl.DateTimeFormatOptions): string => {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return String(date);

    const defaultOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      ...options,
    };

    return new Intl.DateTimeFormat(locale, defaultOptions).format(d);
  } catch (err) {
    return String(date);
  }
};

export const formatCurrency = (amount: number, locale: string = 'en-IN', currency: string = 'INR'): string => {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (err) {
    return `₹${amount}`;
  }
};

export const formatNumber = (num: number, locale: string = 'en-IN', options?: Intl.NumberFormatOptions): string => {
  try {
    return new Intl.NumberFormat(locale, options).format(num);
  } catch (err) {
    return String(num);
  }
};

// React Component Formatters
export interface DateFormatterProps extends TextProps {
  date: Date | string | number;
  options?: Intl.DateTimeFormatOptions;
}

export const DateFormatter: React.FC<DateFormatterProps> = ({ date, options, style, ...rest }) => {
  const { locale } = useLocale();
  return <Text style={style} {...rest}>{formatDate(date, locale, options)}</Text>;
};

export interface CurrencyFormatterProps extends TextProps {
  amount: number;
  currency?: string;
}

export const CurrencyFormatter: React.FC<CurrencyFormatterProps> = ({ amount, currency = 'INR', style, ...rest }) => {
  const { locale } = useLocale();
  return <Text style={style} {...rest}>{formatCurrency(amount, locale, currency)}</Text>;
};

export interface NumberFormatterProps extends TextProps {
  value: number;
  options?: Intl.NumberFormatOptions;
}

export const NumberFormatter: React.FC<NumberFormatterProps> = ({ value, options, style, ...rest }) => {
  const { locale } = useLocale();
  return <Text style={style} {...rest}>{formatNumber(value, locale, options)}</Text>;
};
