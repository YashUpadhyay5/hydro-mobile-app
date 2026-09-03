import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CommunicationTabSvgIcon } from '@/components/ui/SvgIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useTranslationSafe(['dashboard', 'common']);

  const activeColor = isDark ? '#38BDF8' : '#0F172A';
  const inactiveColor = isDark ? '#9CA3AF' : '#64748B';

  const navContentHeight = 56;
  const navTotalHeight = navContentHeight + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: navTotalHeight,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: isDark ? '#334155' : '#E2E8F0',
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.2 : 0.04,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('dashboard:title', { defaultValue: 'Home' }),
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={22}
              name="house.fill"
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: t('common:chat', { defaultValue: 'Chat' }),
          tabBarIcon: ({ color, focused }) => (
            <CommunicationTabSvgIcon
              size={22}
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="expenses"
        options={{
          title: t('common:expenses', { defaultValue: 'Expenses' }),
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={22}
              name="creditcard.fill"
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="leaves"
        options={{
          title: t('common:leaves', { defaultValue: 'Leaves' }),
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={22}
              name="calendar.badge.plus"
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="documents"
        options={{
          title: t('common:docs', { defaultValue: 'Docs' }),
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={22}
              name="doc.text.fill"
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />
    </Tabs>
  );
}