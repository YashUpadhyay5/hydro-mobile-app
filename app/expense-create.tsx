import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Image, 
  Alert, 
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { Picker } from '@react-native-picker/picker';
import { API_BASE_URL } from '@/constants/API';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ExpenseCreateScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['expense', 'common']);
  const [category, setCategory] = useState('Courier expense');
  const [amount, setAmount] = useState('');
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [merchantName, setMerchantName] = useState('');
  const [siteName, setSiteName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const notify = (title: string, message: string, onPressAction?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
      if (onPressAction) onPressAction();
    } else {
      Alert.alert(title, message, onPressAction ? [{ text: t('common:ok', { defaultValue: 'OK' }), onPress: onPressAction }] : undefined);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== ImagePicker.PermissionStatus.GRANTED) {
      notify(t('common:warning', { defaultValue: 'Permission Denied' }), t('expense:gallery_perm_needed', { defaultValue: 'Gallery access is required to attach slips.' }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.2,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
      notify(t('common:success', { defaultValue: 'Success' }), t('expense:doc_attached', { defaultValue: 'Document is attached successfully' }));
    }
  };

  const handleSubmit = async () => {
    if (!category.trim() || !amount || !billNo.trim() || !billDate.trim() || !siteName.trim()) {
      notify(t('common:error', { defaultValue: 'Validation Error' }), t('expense:fill_required', { defaultValue: 'Please fill in all required fields (Category, Amount, Bill No, Bill Date, and Site Name).' }));
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      notify(t('common:error', { defaultValue: 'Validation Error' }), t('expense:valid_amount', { defaultValue: 'Please enter a valid numeric amount greater than 0.' }));
      return;
    }

    const formData = new FormData();
    formData.append('category', category.trim());
    formData.append('amount', String(parsedAmount));
    formData.append('billNo', billNo.trim());
    formData.append('billDate', billDate.trim());
    formData.append('merchantName', merchantName.trim());
    formData.append('siteName', siteName.trim());
    formData.append('description', description.trim());
    const empCode = user?.empCode || user?.employeeCode || user?.id;
    if (empCode) {
      formData.append('userId', empCode);
      formData.append('empCode', empCode);
    }
    if (user?.id) {
      formData.append('employeeId', user.id);
    }
    if (user?.name) {
      formData.append('userName', user.name);
    }

    if (imageUri) {
      if (Platform.OS === 'web') {
        try {
          const response = await fetch(imageUri);
          const blob = await response.blob();
          formData.append('file', blob, 'invoice.jpg');
        } catch (blobError) {
          console.error("Web file resolution failed: ", blobError);
          notify(t('common:error', { defaultValue: 'File Error' }), t('expense:file_resolve_error', { defaultValue: 'Failed to resolve chosen image object on web.' }));
          return;
        }
      } else {
        const filename = imageUri.split('/').pop() || 'invoice.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1].toLowerCase()}` : `image/jpeg`;
        
        const decodedUri = Platform.OS === 'ios' || Platform.OS === 'android' ? decodeURIComponent(imageUri) : imageUri;
        
        formData.append('file', {
          uri: decodedUri,
          name: filename,
          type,
        } as any);
      }
    } else {
      notify(t('common:error', { defaultValue: 'Validation Error' }), t('expense:attach_invoice', { defaultValue: 'Please attach an invoice slip image before submitting.' }));
      return;
    }

    try {
      setIsLoading(true);
      
      await api.post(`${API_BASE_URL}/expenses`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data' 
        },
        withCredentials: true
      });

      notify(t('common:success', { defaultValue: 'Success' }), t('expense:submit_success', { defaultValue: 'Expense is submitted successfully' }), () => {
        router.back();
      });
    } catch (err: any) {
      console.error("Network upload exception recorded: ", err?.response?.data || err.message);
      notify(t('common:error', { defaultValue: 'Submission Error' }), `${t('expense:submit_error', { defaultValue: 'Failed to connect to the HRMS Backend API' })}: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

    const pickerBg = isDark ? '#1E293B' : '#FFFFFF';
    const pickerBorder = isDark ? '#334155' : '#CBD5E1';
    const pickerTextColor = isDark ? '#F8FAFC' : '#0F172A';

    return (
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView 
          style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}
          contentContainerStyle={{ flexGrow: 1, paddingVertical: 24, paddingHorizontal: 20, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <Card className={`w-full ${isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-surface border-border'}`}>
            <CardContent>
              <Text className={`text-2xl font-black text-center mb-6 tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>
                {t('expense:create_expense', { defaultValue: 'Add Expense' })}
              </Text>
              
              <View className="mb-5">
                <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                  {t('expense:category', { defaultValue: 'Category' })} *
                </Text>
                <View 
                  style={{
                    borderWidth: 1,
                    borderColor: pickerBorder,
                    borderRadius: 12,
                    backgroundColor: pickerBg,
                    overflow: 'hidden',
                    justifyContent: 'center',
                  }}
                >
                  <Picker
                    selectedValue={category}
                    onValueChange={(itemValue) => setCategory(itemValue)}
                    dropdownIconColor={pickerTextColor}
                    style={{
                      height: 52,
                      width: '100%',
                      color: pickerTextColor,
                      backgroundColor: pickerBg,
                    }}
                  >
                    <Picker.Item label={t('expense:cat_courier', { defaultValue: 'Courier expense' })} value="Courier expense" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                    <Picker.Item label={t('expense:cat_food', { defaultValue: 'Food expense' })} value="Food expense" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                    <Picker.Item label={t('expense:cat_goods', { defaultValue: 'Goods transport' })} value="Goods transport" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                    <Picker.Item label={t('expense:cat_office', { defaultValue: 'Office expense' })} value="Office expense" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                    <Picker.Item label={t('expense:cat_other', { defaultValue: 'Other expense' })} value="Other expense" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                    <Picker.Item label={t('expense:cat_petrol', { defaultValue: 'Petrol and diesel expense' })} value="Petrol and diesel expense" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                    <Picker.Item label={t('expense:cat_raw', { defaultValue: 'Raw material expense' })} value="Raw material expense" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                    <Picker.Item label={t('expense:cat_travel', { defaultValue: 'Travel expense' })} value="Travel expense" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                  </Picker>
                </View>
              </View>

              <View className="mb-5">
                <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                  {t('expense:amount', { defaultValue: 'Amount' })} (₹) *
                </Text>
                <Input 
                  value={amount} 
                  onChangeText={setAmount} 
                  placeholder="0.00" 
                  keyboardType="decimal-pad" 
                  className="py-3"
                />
              </View>

              <View className="mb-5">
                <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                  {t('expense:bill_no', { defaultValue: 'Bill / Invoice No.' })} *
                </Text>
                <Input 
                  value={billNo} 
                  onChangeText={setBillNo} 
                  placeholder={t('expense:bill_no_placeholder', { defaultValue: 'e.g. INV-10045' })}
                  className="py-3"
                />
              </View>

              <View className="mb-5">
                <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                  {t('expense:bill_date', { defaultValue: 'Bill Date' })} *
                </Text>
                <Input 
                  value={billDate} 
                  onChangeText={setBillDate} 
                  placeholder="YYYY-MM-DD" 
                  className="py-3"
                />
              </View>

              <View className="mb-5">
                <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                  {t('expense:merchant_name', { defaultValue: 'Merchant Name' })} ({t('common:optional', { defaultValue: 'Optional' })})
                </Text>
                <Input 
                  value={merchantName} 
                  onChangeText={setMerchantName} 
                  placeholder={t('expense:merchant_placeholder', { defaultValue: 'e.g. Amazon, Fuel Station...' })}
                  className="py-3"
                />
              </View>

              <View className="mb-5">
                <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                  {t('expense:site_name', { defaultValue: 'Site Name' })} *
                </Text>
                <Input 
                  value={siteName} 
                  onChangeText={setSiteName} 
                  placeholder={t('expense:site_placeholder', { defaultValue: 'e.g. Project Site A, HQ Office...' })}
                  className="py-3"
                />
              </View>

              <View className="mb-5">
                <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                  {t('expense:description', { defaultValue: 'Description' })}
                </Text>
                <Input 
                  value={description} 
                  onChangeText={setDescription} 
                  placeholder={t('expense:memo_placeholder', { defaultValue: 'Optional memo...' })}
                  multiline 
                  numberOfLines={3} 
                  textAlignVertical="top"
                  className="min-h-[80px] py-3"
                />
              </View>

              <View className="mb-8">
                <Text className={`text-sm font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                  {t('expense:receipt', { defaultValue: 'Invoice Documentation' })} *
                </Text>
                {imageUri ? (
                  <View className={`relative rounded-xl overflow-hidden border ${isDark ? 'border-slate-700' : 'border-border'}`}>
                    <Image source={{ uri: imageUri }} className="w-full h-[200px]" resizeMode="cover" />
                    <TouchableOpacity 
                      className="absolute top-2 right-2 bg-black/60 px-3 py-1.5 rounded-full" 
                      onPress={() => setImageUri(null)}
                    >
                      <Text className="text-white text-xs font-bold">✕ {t('common:delete', { defaultValue: 'Remove' })}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    className={`border-2 border-dashed rounded-xl p-6 items-center justify-center min-h-[120px] ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-primary/5 border-primary/30'}`} 
                    onPress={pickImage}
                  >
                    <Text className="text-2xl mb-2">📸</Text>
                    <Text className={`text-sm font-bold ${isDark ? 'text-sky-400' : 'text-primary'}`}>{t('expense:upload_receipt', { defaultValue: 'Tap to Upload Invoice Slip' })}</Text>
                    <Text className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-primary/70'}`}>{t('expense:from_gallery', { defaultValue: 'From Gallery or Camera' })}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Button 
                onPress={handleSubmit} 
                disabled={isLoading || !amount || !category || !billNo || !billDate || !siteName || !imageUri}
                className="mb-3"
              >
                <Text className="text-white font-bold text-base">
                  {isLoading ? t('common:loading', { defaultValue: 'Submitting...' }) : t('common:submit', { defaultValue: 'Submit Expense' })}
                </Text>
              </Button>
              
              <Button 
                variant="ghost" 
                onPress={() => router.back()} 
                disabled={isLoading}
              >
                <Text className={`font-bold text-sm ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{t('common:cancel', { defaultValue: 'Cancel' })}</Text>
              </Button>
            </CardContent>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    );
}