import React from 'react';
import { TouchableOpacity, Text, TouchableOpacityProps, ActivityIndicator } from 'react-native';
import { cn } from './Card'; // reuse utility
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface ButtonProps extends TouchableOpacityProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  textClassName?: string;
  children: React.ReactNode;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  isLoading,
  textClassName,
  children,
  ...props
}: ButtonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const baseStyles = 'flex-row items-center justify-center rounded-xl font-medium';
  
  const variants = {
    primary: isDark ? 'bg-blue-600' : 'bg-primary',
    secondary: isDark ? 'bg-slate-800 border border-slate-700' : 'bg-surface border border-border',
    outline: isDark ? 'bg-transparent border border-blue-500' : 'bg-transparent border border-primary',
    ghost: 'bg-transparent',
  };

  const textVariants = {
    primary: 'text-white font-semibold',
    secondary: isDark ? 'text-slate-100 font-medium' : 'text-text-main font-medium',
    outline: isDark ? 'text-blue-400 font-medium' : 'text-primary font-medium',
    ghost: isDark ? 'text-slate-400 font-medium' : 'text-text-muted font-medium',
  };

  const sizes = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-6 py-4',
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      className={cn(baseStyles, variants[variant], sizes[size], props.disabled ? 'opacity-50' : '', className)}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#0052CC'} />
      ) : (
        <Text className={cn(textVariants[variant], 'text-base', textClassName)}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}
