import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface LanguageSearchProps {
  query: string;
  onQueryChange: (text: string) => void;
  placeholder?: string;
}

export const LanguageSearch: React.FC<LanguageSearchProps> = ({ query, onQueryChange, placeholder }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation('settings');
  const searchPlaceholder = placeholder || t('languageSearch', { defaultValue: 'Search languages...' });

  return (
    <View style={[
      styles.container,
      isDark && { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' }
    ]}>
      <Ionicons name="search-outline" size={20} color={isDark ? "#94A3B8" : "#64748B"} style={styles.icon} />
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        placeholder={searchPlaceholder}
        placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
        style={[styles.input, isDark && { color: '#F8FAFC' }]}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 10,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
  },
});

export default LanguageSearch;
