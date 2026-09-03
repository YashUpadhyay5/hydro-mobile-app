import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/src/hooks/useLanguage';
import { SupportedLanguage } from '@/src/i18n';
import { useColorScheme } from '@/hooks/use-color-scheme';
import LanguageSearch from './LanguageSearch';

export const LanguageDropdown: React.FC = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { currentLanguage, language, supportedLanguages, changeLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = supportedLanguages.filter(
    (l) => l.name.toLowerCase().includes(search.toLowerCase()) || l.nativeName.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = async (code: string) => {
    await changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[
          styles.dropdownBtn,
          isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }
        ]} 
        onPress={() => setIsOpen(true)} 
        activeOpacity={0.7}
      >
        <View style={styles.selectedRow}>
          <Ionicons name="language" size={20} color={isDark ? "#38BDF8" : "#2563EB"} />
          <View style={styles.labelGroup}>
            <Text style={[styles.nativeLabel, isDark && { color: '#F8FAFC' }]}>{language.nativeName}</Text>
            <Text style={[styles.subLabel, isDark && { color: '#94A3B8' }]}>{language.name}</Text>
          </View>
        </View>
        <Ionicons name="chevron-down-outline" size={18} color={isDark ? "#94A3B8" : "#64748B"} />
      </TouchableOpacity>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setIsOpen(false)}>
          <View 
            style={[
              styles.dropdownMenu,
              isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }
            ]} 
            onStartShouldSetResponder={() => true}
          >
            <LanguageSearch query={search} onQueryChange={setSearch} />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.code}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem, 
                    isDark && { borderBottomColor: '#334155' },
                    item.code === currentLanguage && (isDark ? { backgroundColor: '#0F172A' } : styles.optionSelected)
                  ]}
                  onPress={() => handleSelect(item.code)}
                >
                  <Text style={[styles.optionText, isDark && { color: '#F8FAFC' }]}>{item.nativeName} ({item.name})</Text>
                  {item.code === currentLanguage && <Ionicons name="checkmark" size={18} color={isDark ? "#38BDF8" : "#2563EB"} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  labelGroup: {
    flexDirection: 'column',
  },
  nativeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  subLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  optionSelected: {
    backgroundColor: '#EFF6FF',
  },
  optionText: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
  },
});

export default LanguageDropdown;
