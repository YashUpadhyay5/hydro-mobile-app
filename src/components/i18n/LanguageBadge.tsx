import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLanguage } from '@/src/hooks/useLanguage';

export interface LanguageBadgeProps {
  showNativeName?: boolean;
}

export const LanguageBadge: React.FC<LanguageBadgeProps> = ({ showNativeName = true }) => {
  const { language } = useLanguage();

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        🌍 {showNativeName ? language.nativeName : language.name} ({language.code.toUpperCase()})
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
});

export default LanguageBadge;
