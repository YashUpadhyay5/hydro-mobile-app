import React from 'react';
import { View, ViewProps } from 'react-native';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CardProps extends ViewProps {
  className?: string;
  elevated?: boolean;
}

export function Card({ className, elevated = true, children, style, ...props }: CardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View
      className={cn(
        'rounded-2xl overflow-hidden',
        isDark ? 'bg-slate-800/95 border border-slate-700' : 'bg-background border border-border',
        elevated ? (isDark ? 'shadow-sm shadow-black/40' : 'shadow-sm shadow-black/5') : '',
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ className, ...props }: ViewProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View
      className={cn('px-5 py-4 border-b', isDark ? 'border-slate-700/60' : 'border-border/50', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn('p-5', className)} {...props} />;
}
