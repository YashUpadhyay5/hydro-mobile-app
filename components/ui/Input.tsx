import React from 'react';
import { TextInput, TextInputProps, View, Text } from 'react-native';
import { cn } from './Card';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerClassName?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, label, error, containerClassName, placeholderTextColor, style, ...props }, ref) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
      <View className={cn('flex-col gap-1.5', containerClassName)}>
        {label && (
          <Text className={cn('text-sm font-medium ml-1', isDark ? 'text-slate-200' : 'text-text-main')}>
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          placeholderTextColor={placeholderTextColor || (isDark ? '#64748B' : '#9CA3AF')}
          className={cn(
            'px-4 py-3 rounded-xl text-base',
            isDark 
              ? 'bg-slate-800 text-white border border-slate-700 focus:border-blue-500' 
              : 'bg-surface text-text-main border border-border focus:border-primary',
            error ? 'border-red-500 focus:border-red-500' : '',
            className
          )}
          style={[{ color: isDark ? '#F8FAFC' : '#0F172A' }, style]}
          {...props}
        />
        {error && (
          <Text className="text-sm text-red-500 ml-1 mt-0.5">{error}</Text>
        )}
      </View>
    );
  }
);

Input.displayName = 'Input';
