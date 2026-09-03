import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/src/hooks/useLanguage';
import { SupportedLanguage } from '@/src/i18n';
import { useColorScheme } from '@/hooks/use-color-scheme';
import LanguageSearch from './LanguageSearch';

export interface LanguageModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LanguageModal: React.FC<LanguageModalProps> = ({ visible, onClose }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation(['settings', 'common']);
  const { currentLanguage, supportedLanguages, changeLanguage, resetLanguage } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [previewLangCode, setPreviewLangCode] = useState<string | null>(null);

  const filteredLanguages = supportedLanguages.filter((lang) => {
    const q = searchQuery.toLowerCase();
    return (
      lang.name.toLowerCase().includes(q) ||
      lang.nativeName.toLowerCase().includes(q) ||
      lang.code.toLowerCase().includes(q)
    );
  });

  const activeCode = previewLangCode || currentLanguage;

  const handleSelectLanguage = async (code: string) => {
    setPreviewLangCode(code);
  };

  const handleSave = async () => {
    if (previewLangCode) {
      await changeLanguage(previewLangCode);
    }
    setPreviewLangCode(null);
    onClose();
  };

  const handleReset = async () => {
    await resetLanguage();
    setPreviewLangCode(null);
    onClose();
  };

  const renderItem = ({ item }: { item: SupportedLanguage }) => {
    const isSelected = activeCode === item.code;
    return (
      <TouchableOpacity
        style={[
          styles.languageItem, 
          isDark && { backgroundColor: '#1E293B', borderColor: '#334155' },
          isSelected && (isDark ? { backgroundColor: '#1E3A8A', borderColor: '#3B82F6' } : styles.languageItemSelected)
        ]}
        onPress={() => handleSelectLanguage(item.code)}
        activeOpacity={0.7}
      >
        <View style={styles.languageInfo}>
          <Text style={[styles.nativeName, isDark && { color: '#F8FAFC' }, isSelected && (isDark ? { color: '#93C5FD' } : styles.selectedText)]}>{item.nativeName}</Text>
          <Text style={[styles.englishName, isDark && { color: '#94A3B8' }]}>{item.name}</Text>
        </View>
        {isSelected && <Ionicons name="checkmark-circle" size={24} color={isDark ? "#38BDF8" : "#2563EB"} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, isDark && { backgroundColor: '#0F172A' }]}>
        {/* Header */}
        <View style={[styles.header, isDark && { backgroundColor: '#1E293B', borderBottomColor: '#334155' }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={isDark ? "#F8FAFC" : "#0F172A"} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isDark && { color: '#F8FAFC' }]}>{t('languageSettings', { defaultValue: 'Language Settings' })}</Text>
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Text style={styles.resetText}>{t('resetToDefault', { defaultValue: 'Reset' })}</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <LanguageSearch query={searchQuery} onQueryChange={setSearchQuery} />

          <FlatList
            data={filteredLanguages}
            keyExtractor={(item) => item.code}
            renderItem={renderItem}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Footer Actions */}
        <View style={[styles.footer, isDark && { backgroundColor: '#1E293B', borderTopColor: '#334155' }]}>
          <TouchableOpacity 
            style={[styles.btn, styles.btnCancel, isDark && { backgroundColor: '#334155' }]} 
            onPress={onClose}
          >
            <Text style={[styles.btnCancelText, isDark && { color: '#F8FAFC' }]}>{t('common:cancel', { defaultValue: 'Cancel' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.btn, styles.btnSave, isDark && { backgroundColor: '#2563EB' }]} 
            onPress={handleSave}
          >
            <Text style={styles.btnSaveText}>{t('common:save', { defaultValue: 'Save Language' })}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  iconBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  resetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  resetText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContainer: {
    paddingBottom: 20,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  languageItemSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  languageInfo: {
    flexDirection: 'column',
  },
  nativeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  selectedText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  englishName: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: '#F1F5F9',
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  btnSave: {
    backgroundColor: '#2563EB',
  },
  btnSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default LanguageModal;
