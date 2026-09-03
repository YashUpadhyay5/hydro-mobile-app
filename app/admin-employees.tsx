import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, ActivityIndicator, Alert, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

export default function AdminEmployeesScreen() {
  const router = useRouter();
  const { t } = useTranslationSafe(['employee', 'common']);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [designation, setDesignation] = useState<'OFFICE' | 'FIELD'>('OFFICE');
  const [location, setLocation] = useState('Chennai');
  const [allowedLeaves, setAllowedLeaves] = useState('15');
  const [consumedLeaves, setConsumedLeaves] = useState('0');

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await api.get('/employees');
      setEmployees(res.data);
    } catch (err: any) {
      console.error("Failed to fetch employees:", err.message);
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        Alert.alert(t('common:warning', { defaultValue: 'Timeout' }), t('employee:timeout_msg', { defaultValue: 'Request timed out after 60 seconds.' }));
      } else {
        Alert.alert(t('common:error', { defaultValue: 'Error' }), t('employee:load_error', { defaultValue: 'Could not load employee records.' }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditingId(null);
    setName('');
    setEmail('');
    setPassword('password123');
    setDesignation('OFFICE');
    setLocation('Chennai');
    setAllowedLeaves('15');
    setConsumedLeaves('0');
    setModalVisible(true);
  };

  const handleOpenEdit = (emp: any) => {
    setIsEditing(true);
    setEditingId(emp.id);
    setName(emp.name);
    setEmail(emp.email);
    setPassword(emp.password);
    setDesignation(emp.designation || 'OFFICE');
    setLocation(emp.location || 'Chennai');
    setAllowedLeaves(String(emp.allowedLeaves ?? 15));
    setConsumedLeaves(String(emp.consumedLeaves ?? 0));
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert(t('common:error', { defaultValue: 'Validation Error' }), t('employee:val_req', { defaultValue: 'Name, Email and Password are required.' }));
      return;
    }

    try {
      const payload = {
        name,
        email: email.toLowerCase().trim(),
        password,
        designation,
        location: location.trim() || 'Chennai',
        allowedLeaves: Number(allowedLeaves) || 15,
        consumedLeaves: Number(consumedLeaves) || 0
      };

      if (isEditing && editingId) {
        await api.put(`/employees/${editingId}`, payload);
        Alert.alert(t('common:success', { defaultValue: 'Success' }), t('employee:update_success', { defaultValue: 'Employee profile updated successfully.' }));
      } else {
        await api.post('/employees', payload);
        Alert.alert(t('common:success', { defaultValue: 'Success' }), t('employee:create_success', { defaultValue: 'Employee profile created successfully.' }));
      }
      setModalVisible(false);
      fetchEmployees();
    } catch (err: any) {
      console.error("Save employee error:", err.message);
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        Alert.alert(t('common:warning', { defaultValue: 'Timeout' }), t('employee:timeout_msg', { defaultValue: 'Request timed out after 60 seconds.' }));
      } else {
        Alert.alert(t('common:error', { defaultValue: 'Save Error' }), err.response?.data?.error || t('employee:save_failed', { defaultValue: 'Could not save employee details.' }));
      }
    }
  };

  const handleDelete = async (id: string, empName: string) => {
    if (id === 'admin') {
      Alert.alert(t('common:warning', { defaultValue: 'Restricted Action' }), t('employee:admin_delete_restricted', { defaultValue: 'The system Admin account cannot be deleted.' }));
      return;
    }

    Alert.alert(
      t('common:confirm', { defaultValue: 'Confirm Delete' }),
      t('employee:confirm_delete_msg', { defaultValue: `Are you sure you want to delete employee "${empName}"? This action cannot be undone.` }),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: "cancel" },
        { 
          text: t('common:delete', { defaultValue: 'Delete' }), 
          style: "destructive", 
          onPress: async () => {
            try {
              await api.delete(`/employees/${id}`);
              Alert.alert(t('common:success', { defaultValue: 'Success' }), t('employee:delete_success', { defaultValue: 'Employee deleted successfully.' }));
              fetchEmployees();
            } catch (err: any) {
              console.error("Delete employee error:", err.message);
              if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                Alert.alert(t('common:warning', { defaultValue: 'Timeout' }), t('employee:timeout_msg', { defaultValue: 'Request timed out after 60 seconds.' }));
              } else {
                Alert.alert(t('common:error', { defaultValue: 'Delete Error' }), t('employee:delete_failed', { defaultValue: 'Could not delete employee record.' }));
              }
            }
          }
        }
      ]
    );
  };

  const getAvatarInitials = (fullName: string) => {
    if (!fullName) return '?';
    const parts = fullName.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return fullName[0].toUpperCase();
  };

  const renderEmpItem = ({ item }: { item: any }) => {
    return (
      <Card className="mb-4">
        <View className="flex-row items-center mb-4">
          <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center mr-3">
            <Text className="text-primary font-black text-sm">
              {getAvatarInitials(item.name)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-black text-text-main tracking-tight">{item.name}</Text>
            <Text className="text-xs text-text-muted font-medium">{item.email}</Text>
            <Text className="text-[11px] text-primary font-bold mt-0.5">ID: {item.empCode || item.employeeCode || item.id} • 📍 {item.location || 'Chennai'}</Text>
          </View>
          <View className={`flex-row items-center py-1 px-2.5 rounded-full border ${item.designation === 'FIELD' ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
            <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${item.designation === 'FIELD' ? 'bg-orange-500' : 'bg-blue-500'}`} />
            <Text className={`text-[10px] font-black uppercase tracking-wider ${item.designation === 'FIELD' ? 'text-orange-700' : 'text-blue-700'}`}>
              {item.designation === 'FIELD' ? t('employee:field', { defaultValue: 'Field' }) : t('employee:office', { defaultValue: 'Office' })}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center justify-around bg-background/50 py-3 rounded-xl border border-border mb-4">
          <View className="items-center flex-1">
            <Text className="text-lg font-black text-text-main tracking-tight">{item.allowedLeaves ?? 15}</Text>
            <Text className="text-[10px] text-text-muted font-bold mt-1 uppercase tracking-wider">{t('employee:allowed', { defaultValue: 'Allowed' })}</Text>
          </View>
          <View className="w-px h-6 bg-border" />
          <View className="items-center flex-1">
            <Text className="text-lg font-black text-amber-500 tracking-tight">{item.consumedLeaves ?? 0}</Text>
            <Text className="text-[10px] text-text-muted font-bold mt-1 uppercase tracking-wider">{t('employee:consumed', { defaultValue: 'Consumed' })}</Text>
          </View>
          <View className="w-px h-6 bg-border" />
          <View className="items-center flex-1">
            <Text className="text-lg font-black text-emerald-500 tracking-tight">
              {Math.max(0, (item.allowedLeaves ?? 15) - (item.consumedLeaves ?? 0))}
            </Text>
            <Text className="text-[10px] text-text-muted font-bold mt-1 uppercase tracking-wider">{t('employee:remaining', { defaultValue: 'Remaining' })}</Text>
          </View>
        </View>

        {item.id !== 'admin' && (
          <View className="flex-row justify-end gap-2.5 pt-3.5 border-t border-border">
            <TouchableOpacity className="py-2 px-4 rounded-lg items-center justify-center border border-indigo-200 bg-indigo-50/50" onPress={() => handleOpenEdit(item)}>
              <Text className="text-xs font-bold text-indigo-600">✏️ {t('common:update', { defaultValue: 'Edit' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity className="py-2 px-4 rounded-lg items-center justify-center border border-red-200 bg-red-50/50" onPress={() => handleDelete(item.id, item.name)}>
              <Text className="text-xs font-bold text-red-600">🗑️ {t('common:delete', { defaultValue: 'Delete' })}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: Platform.OS === 'ios' ? 50 : 20 }}>
      <View className="flex-row items-center px-6 py-4.5 bg-white border-b border-border">
        <TouchableOpacity className="w-10 h-10 rounded-xl bg-background items-center justify-center mr-4" onPress={() => router.back()}>
          <IconSymbol name="chevron.left" color="#0f172a" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-text-main tracking-tight">{t('employee:manage_title', { defaultValue: 'Manage Employees' })}</Text>
          <Text className="text-xs text-text-muted font-medium mt-0.5">{t('employee:manage_subtitle', { defaultValue: 'Add or edit designations & leaves' })}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0052CC" className="flex-1 justify-center items-center" />
      ) : (
        <FlatList
          data={employees}
          keyExtractor={(item) => item.id}
          renderItem={renderEmpItem}
          contentContainerClassName="p-5 pb-32"
          onRefresh={fetchEmployees}
          refreshing={loading}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <IconSymbol name="person.fill.badge.plus" color="#94a3b8" size={60} />
              <Text className="text-text-muted font-semibold mt-3 text-sm">{t('employee:no_employees', { defaultValue: 'No employees registered yet.' })}</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity className="absolute bottom-8 right-6 w-[60px] h-[60px] rounded-full bg-primary justify-center items-center shadow-lg shadow-primary/30 border-2 border-white/20" onPress={handleOpenAdd} activeOpacity={0.85}>
        <IconSymbol name="plus" color="#ffffff" size={30} />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 bg-slate-900/40 justify-end">
          <View className="bg-white rounded-t-[30px] px-6 pb-10 pt-3 shadow-2xl max-h-[90%]">
            <View className="w-10 h-1 rounded-full bg-border self-center mb-5" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-2">
              <Text className="text-xl font-black text-text-main mb-6 tracking-tight">
                {isEditing ? t('employee:modal_update', { defaultValue: 'Update Employee Settings' }) : t('employee:modal_create', { defaultValue: 'Create Employee Profile' })}
              </Text>

              <Text className="text-[11px] font-black text-text-secondary mb-1.5 uppercase tracking-wider">{t('employee:full_name', { defaultValue: 'Full Name' })}</Text>
              <Input 
                className="mb-4.5"
                value={name} 
                onChangeText={setName} 
                placeholder="John Doe" 
              />

              <Text className="text-[11px] font-black text-text-secondary mb-1.5 uppercase tracking-wider">{t('employee:email_addr', { defaultValue: 'Email Address' })}</Text>
              <Input 
                className="mb-4.5"
                value={email} 
                onChangeText={setEmail} 
                placeholder="john.doe@company.com" 
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text className="text-[11px] font-black text-text-secondary mb-1.5 uppercase tracking-wider">{t('employee:password', { defaultValue: 'Password' })}</Text>
              <Input 
                className="mb-4.5"
                value={password} 
                onChangeText={setPassword} 
                placeholder="Enter password" 
                autoCapitalize="none"
                secureTextEntry={false}
              />

              <Text className="text-[11px] font-black text-text-secondary mb-1.5 uppercase tracking-wider">{t('employee:work_designation', { defaultValue: 'Work Designation' })}</Text>
              <View className="flex-row gap-3 mb-4.5">
                <TouchableOpacity 
                  className={`flex-1 border py-3 rounded-xl items-center ${designation === 'OFFICE' ? 'bg-primary border-primary' : 'bg-background/50 border-border'}`}
                  onPress={() => setDesignation('OFFICE')}
                  activeOpacity={0.9}
                >
                  <Text className={`text-[13px] font-bold ${designation === 'OFFICE' ? 'text-white' : 'text-text-muted'}`}>
                    🏢 {t('employee:office_worker', { defaultValue: 'Office Worker' })}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  className={`flex-1 border py-3 rounded-xl items-center ${designation === 'FIELD' ? 'bg-primary border-primary' : 'bg-background/50 border-border'}`}
                  onPress={() => setDesignation('FIELD')}
                  activeOpacity={0.9}
                >
                  <Text className={`text-[13px] font-bold ${designation === 'FIELD' ? 'text-white' : 'text-text-muted'}`}>
                    🏃 {t('employee:field_worker', { defaultValue: 'Field Worker' })}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text className="text-[11px] font-black text-text-secondary mb-1.5 uppercase tracking-wider">Assigned Location (Holiday Calendar)</Text>
              <Input 
                className="mb-2"
                value={location} 
                onChangeText={setLocation} 
                placeholder="e.g. Chennai, Noida, Mumbai, Delhi / NCR" 
              />
              <View className="flex-row flex-wrap gap-1.5 mb-4.5">
                {['Chennai', 'Noida', 'Mumbai', 'Delhi / NCR', 'Bengaluru'].map((loc) => (
                  <TouchableOpacity
                    key={loc}
                    onPress={() => setLocation(loc)}
                    className={`px-2.5 py-1 rounded-lg border ${location === loc ? 'bg-primary/10 border-primary' : 'bg-background/50 border-border'}`}
                  >
                    <Text className={`text-[11px] font-bold ${location === loc ? 'text-primary' : 'text-text-muted'}`}>
                      {loc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[11px] font-black text-text-secondary mb-1.5 uppercase tracking-wider">{t('employee:allowed_leaves', { defaultValue: 'Allowed Leaves' })}</Text>
                  <Input 
                    value={allowedLeaves} 
                    onChangeText={setAllowedLeaves} 
                    placeholder="15" 
                    keyboardType="numeric"
                  />
                </View>
                {isEditing && (
                  <View className="flex-1">
                    <Text className="text-[11px] font-black text-text-secondary mb-1.5 uppercase tracking-wider">{t('employee:consumed_leaves', { defaultValue: 'Consumed Leaves' })}</Text>
                    <Input 
                      value={consumedLeaves} 
                      onChangeText={setConsumedLeaves} 
                      placeholder="0" 
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>

              <View className="flex-row gap-3 mt-4 pt-4.5 border-t border-border">
                <Button 
                  variant="outline"
                  className="flex-1 py-3.5"
                  onPress={() => setModalVisible(false)}
                >
                  {t('common:cancel', { defaultValue: 'Discard' })}
                </Button>
                <Button 
                  variant="primary"
                  className="flex-1 py-3.5"
                  onPress={handleSubmit}
                >
                  <Text className="text-white font-bold text-[13px]">{isEditing ? t('common:save', { defaultValue: 'Save Changes' }) : t('common:submit', { defaultValue: 'Create Profile' })}</Text>
                </Button>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
