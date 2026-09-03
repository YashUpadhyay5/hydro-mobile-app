import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/src/hooks/useLanguage';
import LanguageModal from './LanguageModal';

export interface LanguageSwitcherProps {
  style?: ViewStyle;
  variant?: 'compact' | 'full';
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ style, variant = 'compact' }) => {
  const { language } = useLanguage();
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.button, variant === 'full' && styles.buttonFull, style]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="globe-outline" size={18} color="#2563EB" style={styles.icon} />
        <Text style={styles.text}>{language.nativeName}</Text>
        <Ionicons name="chevron-down" size={14} color="#64748B" />
      </TouchableOpacity>

      <LanguageModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  buttonFull: {
    width: '100%',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginRight: 4,
  },
});

export default LanguageSwitcher;
