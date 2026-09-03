import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface WorkTypeSelectorModalProps {
  visible: boolean;
  workTypes: string[];
  onSelect: (workType: string) => void;
  onClose: () => void;
}

export function WorkTypeSelectorModal({
  visible,
  workTypes,
  onSelect,
  onClose,
}: WorkTypeSelectorModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['attendance', 'common']);
  
  const categories = [
    { type: 'Office', label: t('attendance:work_office', { defaultValue: 'Office' }), icon: '🏢', desc: t('attendance:work_office_desc', { defaultValue: 'Work inside corporate headquarters' }) },
    { type: 'Field', label: t('attendance:work_field', { defaultValue: 'Field' }), icon: '📍', desc: t('attendance:work_field_desc', { defaultValue: 'Outside meetings or on-site visits' }) },
    { type: 'Remote', label: t('attendance:work_remote', { defaultValue: 'Remote' }), icon: '🏠', desc: t('attendance:work_remote_desc', { defaultValue: 'Work from home or co-working space' }) },
    { type: 'Warehouse', label: t('attendance:work_warehouse', { defaultValue: 'Warehouse' }), icon: '📦', desc: t('attendance:work_warehouse_desc', { defaultValue: 'Inventory handling & logistics' }) },
    { type: 'Factory', label: t('attendance:work_factory', { defaultValue: 'Factory' }), icon: '🏭', desc: t('attendance:work_factory_desc', { defaultValue: 'Manufacturing & assembly duty' }) },
  ];

  const filteredCategories = categories.filter(cat => 
    workTypes.some(wt => wt.toLowerCase() === cat.type.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={[styles.container, !isDark && { backgroundColor: '#FFFFFF' }]}>
          
          <Text style={[styles.title, !isDark && { color: '#0F172A' }]}>{t('attendance:work_selector_title', { defaultValue: 'Where are you working today?' })}</Text>
          <Text style={[styles.subtitle, !isDark && { color: '#64748B' }]}>
            {t('attendance:work_selector_subtitle', { defaultValue: 'Please select your work location for this shift. Attendance policies differ per work type.' })}
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {filteredCategories.map((cat) => (
              <TouchableOpacity 
                key={cat.type}
                style={[styles.card, !isDark && { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}
                onPress={() => onSelect(cat.type)}
              >
                <Text style={styles.cardIcon}>{cat.icon}</Text>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardLabel, !isDark && { color: '#0F172A' }]}>{cat.label}</Text>
                  <Text style={[styles.cardDesc, !isDark && { color: '#64748B' }]}>{cat.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity 
            style={[styles.cancelButton, !isDark && { borderColor: '#E2E8F0', backgroundColor: '#F1F5F9' }]} 
            onPress={onClose}
          >
            <Text style={[styles.cancelButtonText, !isDark && { color: '#475569' }]}>{t('common:cancel', { defaultValue: 'Cancel' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '85%',
    padding: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#A1A1AA',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  scroll: {
    marginBottom: 16,
  },
  scrollContent: {
    gap: 12,
  },
  card: {
    backgroundColor: '#27272A',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  cardIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  cardDesc: {
    color: '#A1A1AA',
    fontSize: 12,
    lineHeight: 16,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  cancelButtonText: {
    color: '#D4D4D8',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
