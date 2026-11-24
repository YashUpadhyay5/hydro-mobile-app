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
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';
import { Picker } from '@react-native-picker/picker';
import { API_BASE_URL } from '@/constants/API';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import AttachmentPreview from '@/components/AttachmentPreview';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_EXPENSE_ATTACHMENT_BYTES, attachmentFileName } from '@/utils/attachment';

type AttachmentItem = 
  | { id: string; type: 'image'; uri: string; name?: string }
  | { id: string; type: 'pdf'; uri: string; name: string; size?: number }
  | { id: string; type: 'existing'; url: string; name?: string };

export default function ExpenseCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    expenseId?: string;
    category?: string;
    amount?: string;
    billNo?: string;
    billDate?: string;
    merchantName?: string;
    siteName?: string;
    description?: string;
    invoiceUrl?: string;
    invoiceUrls?: string;
    suspiciousReason?: string;
  }>();
  const isEditing = Boolean(params.expenseId);

  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['expense', 'common']);
  const [category, setCategory] = useState(params.category || 'Courier expense');
  const [amount, setAmount] = useState(params.amount || '');
  const [billNo, setBillNo] = useState(params.billNo || '');
  const [billDate, setBillDate] = useState(params.billDate || new Date().toISOString().slice(0, 10));
  const [merchantName, setMerchantName] = useState(params.merchantName || '');
  const [siteName, setSiteName] = useState(params.siteName || '');
  const [description, setDescription] = useState(params.description || '');

  const [attachments, setAttachments] = useState<AttachmentItem[]>(() => {
    const list: AttachmentItem[] = [];
    if (params.invoiceUrls) {
      try {
        const parsed = JSON.parse(params.invoiceUrls);
        if (Array.isArray(parsed)) {
          parsed.forEach((url, idx) => {
            if (url) list.push({ id: `existing-${idx}-${url}`, type: 'existing', url, name: attachmentFileName(url, `Invoice ${idx + 1}`) });
          });
        }
      } catch {
        params.invoiceUrls.split(',').forEach((url, idx) => {
          const clean = url.trim();
          if (clean) list.push({ id: `existing-${idx}-${clean}`, type: 'existing', url: clean, name: attachmentFileName(clean, `Invoice ${idx + 1}`) });
        });
      }
    } else if (params.invoiceUrl) {
      list.push({ id: `existing-0`, type: 'existing', url: params.invoiceUrl, name: attachmentFileName(params.invoiceUrl, 'Invoice 1') });
    }
    return list;
  });

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
      allowsMultipleSelection: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newItems: AttachmentItem[] = result.assets.map((asset, idx) => ({
        id: `img-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'image',
        uri: asset.uri,
        name: asset.fileName || `slip_${Date.now()}_${idx + 1}.jpg`
      }));
      setAttachments((prev) => [...prev, ...newItems]);
      notify(t('common:success', { defaultValue: 'Success' }), `${newItems.length} ${t('expense:docs_attached', { defaultValue: 'photo(s) attached successfully' })}`);
    }
  };

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true
      });
      if (result.canceled || !result.assets?.length) return;

      const validFiles: AttachmentItem[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        const file = result.assets[i];
        if (file.size && file.size > MAX_EXPENSE_ATTACHMENT_BYTES) {
          notify(t('common:error', { defaultValue: 'Error' }), `${file.name || 'PDF'}: ${t('expense:pdf_too_large', { defaultValue: 'This PDF is larger than 10 MB. Choose a smaller file.' })}`);
          continue;
        }
        validFiles.push({
          id: `pdf-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'pdf',
          uri: file.uri,
          name: file.name || `invoice_${Date.now()}_${i + 1}.pdf`,
          size: file.size
        });
      }

      if (validFiles.length > 0) {
        setAttachments((prev) => [...prev, ...validFiles]);
        notify(t('common:success', { defaultValue: 'Success' }), `${validFiles.length} ${t('expense:docs_attached', { defaultValue: 'PDF(s) attached successfully' })}`);
      }
    } catch {
      notify(t('common:error', { defaultValue: 'Error' }), t('expense:pdf_pick_failed', { defaultValue: 'Could not select the PDF.' }));
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
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

    if (attachments.length === 0) {
      notify(t('common:error', { defaultValue: 'Validation Error' }), t('expense:attach_invoice', { defaultValue: 'Please attach at least one invoice slip image or PDF before submitting.' }));
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

    const existingUrls: string[] = [];
    const newFilesToUpload: (AttachmentItem & { type: 'image' | 'pdf' })[] = [];

    for (const item of attachments) {
      if (item.type === 'existing') {
        existingUrls.push(item.url);
      } else {
        newFilesToUpload.push(item);
      }
    }

    if (existingUrls.length > 0) {
      formData.append('existingInvoiceUrls', JSON.stringify(existingUrls));
      formData.append('existingInvoiceUrl', existingUrls[0]);
    }

    for (let i = 0; i < newFilesToUpload.length; i++) {
      const item = newFilesToUpload[i];
      const isSingleNew = newFilesToUpload.length === 1 && existingUrls.length === 0;

      if (item.type === 'pdf') {
        if (Platform.OS === 'web') {
          try {
            const blob = await (await fetch(item.uri)).blob();
            formData.append('files', blob, item.name);
            if (isSingleNew) formData.append('file', blob, item.name);
          } catch {
            notify(t('common:error', { defaultValue: 'File Error' }), t('expense:file_resolve_error', { defaultValue: 'Failed to resolve chosen PDF on web.' }));
            return;
          }
        } else {
          const fileObj = { uri: item.uri, name: item.name, type: 'application/pdf' } as any;
          formData.append('files', fileObj);
          if (isSingleNew) formData.append('file', fileObj);
        }
      } else if (item.type === 'image') {
        if (Platform.OS === 'web') {
          try {
            const response = await fetch(item.uri);
            const blob = await response.blob();
            formData.append('files', blob, item.name || `invoice_${i}.jpg`);
            if (isSingleNew) formData.append('file', blob, item.name || `invoice_${i}.jpg`);
          } catch (blobError) {
            console.error("Web file resolution failed: ", blobError);
            notify(t('common:error', { defaultValue: 'File Error' }), t('expense:file_resolve_error', { defaultValue: 'Failed to resolve chosen image object on web.' }));
            return;
          }
        } else {
          const filename = item.uri.split('/').pop() || `invoice_${i}.jpg`;
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1].toLowerCase()}` : `image/jpeg`;
          const decodedUri = Platform.OS === 'ios' || Platform.OS === 'android' ? decodeURIComponent(item.uri) : item.uri;
          const fileObj = { uri: decodedUri, name: filename, type } as any;
          formData.append('files', fileObj);
          if (isSingleNew) formData.append('file', fileObj);
        }
      }
    }

    try {
      setIsLoading(true);
      
      if (isEditing) {
        await api.put(`${API_BASE_URL}/expenses/${params.expenseId}`, formData, {
          headers: { 
            'Content-Type': 'multipart/form-data' 
          },
          withCredentials: true
        });

        notify(t('common:success', { defaultValue: 'Success' }), t('expense:resend_success', { defaultValue: 'Expense updated and resent successfully!' }), () => {
          router.back();
        });
      } else {
        await api.post(`${API_BASE_URL}/expenses`, formData, {
          headers: { 
            'Content-Type': 'multipart/form-data' 
          },
          withCredentials: true
        });

        notify(t('common:success', { defaultValue: 'Success' }), t('expense:submit_success', { defaultValue: 'Expense is submitted successfully' }), () => {
          router.back();
        });
      }
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
          contentContainerStyle={{ flexGrow: 1, paddingTop: Math.max(insets.top + 12, 24), paddingBottom: Math.max(insets.bottom + 20, 24), paddingHorizontal: 20, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <Card className={`w-full ${isDark ? 'bg-slate-800/95 border-slate-700' : 'bg-surface border-border'}`}>
            <CardContent>
              <Text className={`text-2xl font-black text-center mb-4 tracking-tight ${isDark ? 'text-white' : 'text-text-main'}`}>
                {isEditing ? t('expense:edit_resend_title', { defaultValue: 'Edit & Resend Expense' }) : t('expense:create_expense', { defaultValue: 'Add Expense' })}
              </Text>

              {isEditing && params.suspiciousReason ? (
                <View className="mb-6 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4">
                  <View className="flex-row items-center mb-1">
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <Text className="ml-1.5 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                      {t('expense:mismatch_flagged', { defaultValue: 'Mismatch Flagged by Admin' })}
                    </Text>
                  </View>
                  <Text className="text-sm font-medium text-red-700 dark:text-red-300">
                    {params.suspiciousReason}
                  </Text>
                  <Text className="text-xs text-red-500 dark:text-red-400/80 mt-1.5">
                    {t('expense:edit_resend_hint', { defaultValue: 'Please review and correct the mismatched details below and tap Resend.' })}
                  </Text>
                </View>
              ) : null}
              
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
                  {t('expense:bill_no_v2', { defaultValue: 'Bill / Invoice No.' })} *
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
                  {t('expense:bill_date_v2', { defaultValue: 'Bill Date' })} *
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
                  {t('expense:merchant_name_v2', { defaultValue: 'Merchant Name' })} ({t('common:optional', { defaultValue: 'Optional' })})
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
                  {t('expense:site_name_v2', { defaultValue: 'Site Name' })} *
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
                <View className="flex-row items-center justify-between mb-2">
                  <Text className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-text-muted'}`}>
                    {t('expense:receipt', { defaultValue: 'Invoice Documentation' })} *
                  </Text>
                  {attachments.length > 0 && (
                    <Text className={`text-xs font-semibold ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
                      {attachments.length} {attachments.length === 1 ? t('expense:file_attached', { defaultValue: 'file attached' }) : t('expense:files_attached', { defaultValue: 'files attached' })}
                    </Text>
                  )}
                </View>

                {/* List of Attached Files */}
                {attachments.length > 0 && (
                  <View className="mb-4 gap-3">
                    {attachments.map((item, index) => (
                      <View 
                        key={item.id}
                        className={`rounded-xl border overflow-hidden p-3 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
                      >
                        <View className="flex-row items-center">
                          {item.type === 'pdf' ? (
                            <View className="flex-row items-center flex-1 mr-3">
                              <Ionicons name="document-text" size={32} color={isDark ? '#F87171' : '#DC2626'} />
                              <View className="ml-2.5 flex-1">
                                <Text className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-800'}`} numberOfLines={1}>
                                  {item.name}
                                </Text>
                                {item.size ? (
                                  <Text className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    PDF · {(item.size / 1024 / 1024).toFixed(2)} MB
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          ) : item.type === 'image' ? (
                            <View className="flex-row items-center flex-1 mr-3">
                              <Image source={{ uri: item.uri }} className="w-12 h-12 rounded-lg" resizeMode="cover" />
                              <View className="ml-2.5 flex-1">
                                <Text className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-800'}`} numberOfLines={1}>
                                  {item.name || `Image ${index + 1}`}
                                </Text>
                                <Text className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {t('expense:photo_image', { defaultValue: 'Photo / Receipt Image' })}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View className="flex-1 mr-3">
                              <View className="flex-row items-center mb-1.5">
                                <Ionicons name="document-attach" size={18} color={isDark ? '#38BDF8' : '#0284C7'} />
                                <Text className={`text-xs font-bold ml-1.5 ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                                  {t('expense:existing_slip', { defaultValue: 'Existing Attached Slip' })} #{index + 1}
                                </Text>
                              </View>
                              <AttachmentPreview source={item.url} isDark={isDark} variant="full" />
                            </View>
                          )}

                          <TouchableOpacity 
                            onPress={() => removeAttachment(item.id)}
                            className="bg-red-100 dark:bg-red-950/60 p-2 rounded-full self-start"
                            accessibilityRole="button"
                            accessibilityLabel={t('common:delete', { defaultValue: 'Remove' })}
                          >
                            <Ionicons name="trash-outline" size={18} color={isDark ? '#F87171' : '#DC2626'} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Add Multiple Buttons */}
                <View className="flex-row gap-3">
                  <TouchableOpacity 
                    className={`flex-1 border-2 border-dashed rounded-xl p-4 items-center justify-center min-h-[96px] ${isDark ? 'bg-slate-900 border-slate-700 active:bg-slate-800' : 'bg-primary/5 border-primary/30 active:bg-primary/10'}`} 
                    onPress={pickImage}
                  >
                    <Text className="text-xl mb-1">📸</Text>
                    <Text className={`text-xs font-bold text-center ${isDark ? 'text-sky-400' : 'text-primary'}`}>
                      {attachments.length > 0 ? t('expense:add_more_photos', { defaultValue: '+ Add Photos' }) : t('expense:upload_receipt', { defaultValue: 'Upload Photos / Slips' })}
                    </Text>
                    <Text className={`text-[10px] mt-0.5 text-center ${isDark ? 'text-slate-400' : 'text-primary/70'}`}>
                      {t('expense:multi_select_hint', { defaultValue: 'Select one or more from gallery' })}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    className={`flex-1 border-2 border-dashed rounded-xl p-4 items-center justify-center min-h-[96px] ${isDark ? 'bg-slate-900 border-slate-700 active:bg-slate-800' : 'bg-red-50 border-red-200 active:bg-red-100'}`} 
                    onPress={pickPdf}
                  >
                    <Ionicons name="document-text" size={24} color={isDark ? '#F87171' : '#DC2626'} />
                    <Text className={`text-xs font-bold mt-1 text-center ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                      {attachments.length > 0 ? t('expense:add_more_pdfs', { defaultValue: '+ Add PDFs' }) : t('expense:attach_pdf', { defaultValue: 'Attach PDF Invoices' })}
                    </Text>
                    <Text className={`text-[10px] mt-0.5 text-center ${isDark ? 'text-slate-400' : 'text-red-500/80'}`}>
                      {t('expense:pdf_hint', { defaultValue: 'PDF up to 10 MB' })}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Button 
                onPress={handleSubmit} 
                disabled={isLoading || !amount || !category || !billNo || !billDate || !siteName || attachments.length === 0}
                className="mb-3"
              >
                <Text className="text-white font-bold text-base">
                  {isLoading 
                    ? t('common:loading', { defaultValue: 'Submitting...' }) 
                    : isEditing 
                      ? t('expense:resend_action', { defaultValue: 'Resend Expense' }) 
                      : t('common:submit', { defaultValue: 'Submit Expense' })}
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