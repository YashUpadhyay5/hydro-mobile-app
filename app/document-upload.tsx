import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  Image
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';
import { Picker } from '@react-native-picker/picker';
import { API_BASE_URL } from '@/constants/API';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

interface Employee {
  id: string;
  name: string;
  email: string;
}

export default function DocumentUploadScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['documents', 'common', 'employee']);
  const isAdmin = user?.role === 'ADMIN';

  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('Aadhar card');
  const [markSheetType, setMarkSheetType] = useState('10');
  const [otherDocName, setOtherDocName] = useState('');
  
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
  } | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  const [shareType, setShareType] = useState<'ALL' | 'INDIVIDUAL'>('ALL');
  const [searchEmployee, setSearchEmployee] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [uploading, setUploading] = useState(false);

  const employees: Employee[] = [
    { id: 'emp1', name: 'Aman', email: 'employee1@hrms.com' },
    { id: 'emp2', name: 'Yash', email: 'employee2@hrms.com' },
    { id: 'emp3', name: 'Rahul', email: 'employee3@hrms.com' },
    { id: 'emp4', name: 'Pooja', email: 'employee4@hrms.com' },
    { id: 'emp5', name: 'Sneha', email: 'employee5@hrms.com' },
    { id: 'HMPL02', name: 'Yash Material', email: 'yashhydromaterial@gmail.com' }
  ];

  // 1. Take photo using device camera
  const handleTakePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Camera Permission Required',
            'Please allow camera access in your phone settings to click and upload document photos.',
            [
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileName = asset.fileName || `document_photo_${Date.now()}.jpg`;
        setSelectedFile({
          uri: asset.uri,
          name: fileName,
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
        });
        setSelectedImagePreview(asset.uri);
      }
    } catch (err: any) {
      console.error('Take photo error:', err.message);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), 'Failed to capture photo with camera.');
    }
  };

  // 2. Pick photo from gallery
  const handlePickGallery = async () => {
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Gallery Permission Required',
            'Please allow gallery access to select photos of your documents.',
            [
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileName = asset.fileName || `document_image_${Date.now()}.jpg`;
        setSelectedFile({
          uri: asset.uri,
          name: fileName,
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
        });
        setSelectedImagePreview(asset.uri);
      }
    } catch (err: any) {
      console.error('Pick gallery error:', err.message);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), 'Failed to select image from gallery.');
    }
  };

  // 3. Pick PDF / Document file from storage
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile({
          uri: file.uri,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType
        });
        const isImg = file.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
        setSelectedImagePreview(isImg ? file.uri : null);
      }
    } catch (err: any) {
      console.error('Pick document error:', err.message);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:err_pick', { defaultValue: 'Failed to pick a document.' }));
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setSelectedImagePreview(null);
  };


  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:err_select_file', { defaultValue: 'Please select a file to upload.' }));
      return;
    }

    let finalTitle = docType;
    if (docType === 'Marksheet') {
      finalTitle = `Marksheet - ${markSheetType}`;
    } else if (docType === 'Other') {
      if (!otherDocName.trim()) {
        Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:err_doc_title', { defaultValue: 'Please provide a name/title for the document.' }));
        return;
      }
      finalTitle = otherDocName.trim();
    }

    if (isAdmin && shareType === 'INDIVIDUAL' && !selectedEmployee) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('documents:err_recipient', { defaultValue: 'Please select a recipient employee.' }));
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();

      const filename = selectedFile.name || `document_${Date.now()}.pdf`;
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1].toLowerCase() : 'pdf';
      let mimeType = selectedFile.mimeType;
      if (!mimeType) {
        if (ext === 'pdf') mimeType = 'application/pdf';
        else if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === 'png') mimeType = 'image/png';
        else mimeType = 'application/octet-stream';
      }

      if (Platform.OS === 'web') {
        const fileRes = await fetch(selectedFile.uri);
        const blob = await fileRes.blob();
        formData.append('file', blob, filename);
      } else {
        const decodedUri = Platform.OS === 'ios' || Platform.OS === 'android'
          ? decodeURIComponent(selectedFile.uri)
          : selectedFile.uri;

        formData.append('file', {
          uri: decodedUri,
          name: filename,
          type: mimeType
        } as any);
      }

      const empCode = user?.empCode || user?.employeeCode || user?.id;
      formData.append('title', finalTitle);
      formData.append('uploaderId', empCode || user?.email || 'admin');
      formData.append('uploaderEmpCode', empCode || '');
      formData.append('uploaderEmployeeId', user?.id || '');
      formData.append('uploaderName', user?.name || user?.email || 'Admin');
      formData.append('targetType', isAdmin ? shareType : 'ADMIN');

      if (isAdmin && shareType === 'INDIVIDUAL' && selectedEmployee) {
        formData.append('targetUserId', selectedEmployee.id);
        formData.append('targetUserName', selectedEmployee.name);
      }

      const baseUrl = API_BASE_URL.replace(/\/$/, '');
      const endpointsToTry = [
        `${baseUrl}/hrms-documents`,
        `${baseUrl}/v1/hrms-documents`,
        `${baseUrl}/hrms-documents/`,
        `${baseUrl}/v1/hrms-documents/`,
        `${baseUrl}/documents`,
        `${baseUrl}/documents/`,
        `${baseUrl}/upload`
      ];

      let response: Response | null = null;
      let lastErrText = '';

      for (const endpoint of endpointsToTry) {
        try {
          console.log(`[Document Upload] Attempting upload to: ${endpoint}`);
          const attempt = await fetch(endpoint, {
            method: 'POST',
            body: formData,
            headers: {
              'Accept': 'application/json',
              ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {})
            }
          });

          if (attempt.ok) {
            response = attempt;
            break;
          } else if (attempt.status !== 405 && attempt.status !== 404) {
            // Reached server endpoint, but got 400/401/500 validation response
            response = attempt;
            break;
          }
          lastErrText = await attempt.text().catch(() => '');
          console.warn(`[Document Upload] Endpoint ${endpoint} returned ${attempt.status}:`, lastErrText);
        } catch (netErr: any) {
          console.warn(`[Document Upload] Network error trying ${endpoint}:`, netErr.message);
        }
      }

      if (!response) {
        throw new Error(t('documents:err_upload_failed', { defaultValue: 'Failed to connect to document upload endpoint.' }));
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.warn(`[Document Upload] Server returned status ${response.status}:`, errText);
        let parsedErr = t('documents:err_upload_failed', { defaultValue: 'Failed to upload document.' });
        try {
          const parsed = JSON.parse(errText);
          parsedErr = parsed.error || parsed.message || parsed.detail || parsedErr;
        } catch {
          parsedErr = errText.substring(0, 100) || parsedErr;
        }
        throw new Error(parsedErr);
      }

      Alert.alert(
        t('common:success', { defaultValue: 'Success' }),
        isAdmin 
          ? t('documents:share_success', { defaultValue: 'Document shared successfully.' })
          : t('documents:upload_admin_success', { defaultValue: 'Document uploaded and sent to Admin successfully.' }),
        [{ text: t('common:ok', { defaultValue: 'OK' }), onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Document upload error:', error.message);
      Alert.alert(t('common:error', { defaultValue: 'Upload Failed' }), error.message || t('documents:err_upload_failed', { defaultValue: 'Failed to upload document.' }));
    } finally {
      setUploading(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchEmployee.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchEmployee.toLowerCase())
  );

  const pickerBg = isDark ? '#1E293B' : '#FFFFFF';
  const pickerBorder = isDark ? '#334155' : '#CBD5E1';
  const pickerTextColor = isDark ? '#F8FAFC' : '#0F172A';

  return (
    <ScrollView 
      style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Top Header Bar with Back Button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
            borderWidth: 1,
            borderColor: isDark ? '#334155' : '#E2E8F0',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
          {isAdmin ? t('documents:share_doc', { defaultValue: 'Share Document' }) : t('documents:upload_doc', { defaultValue: 'Upload Document' })}
        </Text>
      </View>

      {/* Main Upload Card */}
      <View
        style={{
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 20,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          padding: 22,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.3 : 0.05,
          shadowRadius: 10,
          elevation: 3,
        }}
      >
        {/* Document Type Dropdown */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569', marginBottom: 6, marginTop: 4 }}>
          {t('documents:doc_type', { defaultValue: 'Document Type' })} *
        </Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: pickerBorder,
            borderRadius: 12,
            backgroundColor: pickerBg,
            overflow: 'hidden',
            marginBottom: 16,
            justifyContent: 'center',
          }}
        >
          <Picker
            selectedValue={docType}
            onValueChange={(itemValue) => setDocType(itemValue)}
            dropdownIconColor={pickerTextColor}
            style={{
              height: 52,
              width: '100%',
              color: pickerTextColor,
              backgroundColor: pickerBg,
            }}
          >
            <Picker.Item label={t('documents:aadhar', { defaultValue: 'Aadhar card' })} value="Aadhar card" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
            <Picker.Item label={t('documents:pan', { defaultValue: 'PAN card' })} value="PAN card" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
            <Picker.Item label={t('documents:voter', { defaultValue: 'Voter card' })} value="Voter card" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
            <Picker.Item label={t('documents:passbook', { defaultValue: 'Bank passbook' })} value="Bank passbook" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
            <Picker.Item label={t('documents:marksheet', { defaultValue: 'Marksheet' })} value="Marksheet" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
            <Picker.Item label={t('common:other', { defaultValue: 'Other' })} value="Other" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
          </Picker>
        </View>

        {/* Secondary Dropdown for Marksheet */}
        {docType === 'Marksheet' && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569', marginBottom: 6 }}>
              {t('documents:marksheet_type', { defaultValue: 'Marksheet Type' })} *
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
                selectedValue={markSheetType}
                onValueChange={(itemValue) => setMarkSheetType(itemValue)}
                dropdownIconColor={pickerTextColor}
                style={{
                  height: 52,
                  width: '100%',
                  color: pickerTextColor,
                  backgroundColor: pickerBg,
                }}
              >
                <Picker.Item label="10th" value="10" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                <Picker.Item label="12th" value="12" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                <Picker.Item label="Graduation" value="Graduation" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
                <Picker.Item label="Post Graduation" value="Post Graduation" color={pickerTextColor} style={{ backgroundColor: pickerBg }} />
              </Picker>
            </View>
          </View>
        )}

        {/* Custom Document Name if "Other" */}
        {docType === 'Other' && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569', marginBottom: 6 }}>
              {t('documents:doc_title', { defaultValue: 'Document Name/Title' })} *
            </Text>
            <Input
              placeholder={t('documents:title_placeholder', { defaultValue: 'Enter a descriptive name...' })}
              value={otherDocName}
              onChangeText={setOtherDocName}
            />
          </View>
        )}

        {/* File / Camera / Gallery Selection Section */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569', marginBottom: 8, marginTop: 4 }}>
          {t('documents:select_file', { defaultValue: 'Attach Document or Photo' })} *
        </Text>

        {/* 3 Action Buttons: Camera Photo, Gallery, PDF File */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {/* Camera Button */}
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: isDark ? '#0F172A' : '#EFF6FF',
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#BFDBFE',
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={handleTakePhoto}
            activeOpacity={0.8}
          >
            <Ionicons name="camera" size={22} color="#2563EB" style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#F8FAFC' : '#1E40AF', textAlign: 'center' }}>
              Take Photo
            </Text>
          </TouchableOpacity>

          {/* Gallery Button */}
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: isDark ? '#0F172A' : '#F0FDF4',
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#BBF7D0',
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={handlePickGallery}
            activeOpacity={0.8}
          >
            <Ionicons name="images" size={22} color="#16A34A" style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#F8FAFC' : '#15803D', textAlign: 'center' }}>
              From Gallery
            </Text>
          </TouchableOpacity>

          {/* PDF / File Button */}
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: isDark ? '#0F172A' : '#FAF5FF',
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#E9D5FF',
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={handlePickDocument}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text" size={22} color="#9333EA" style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#F8FAFC' : '#6B21A8', textAlign: 'center' }}>
              PDF / Storage
            </Text>
          </TouchableOpacity>
        </View>

        {/* Selected File / Image Preview Container */}
        {selectedFile ? (
          <View
            style={{
              backgroundColor: isDark ? '#0F172A' : '#F0FDF4',
              borderWidth: 1.5,
              borderColor: '#10B981',
              borderRadius: 14,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            {/* Image Thumbnail Preview or Doc Icon */}
            {selectedImagePreview ? (
              <Image
                source={{ uri: selectedImagePreview }}
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 8,
                  backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
                  marginRight: 12,
                }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 8,
                  backgroundColor: '#D1FAE5',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <IconSymbol name="doc.text.fill" color="#059669" size={26} />
              </View>
            )}

            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: isDark ? '#F8FAFC' : '#065F46',
                }}
                numberOfLines={1}
              >
                {selectedFile.name}
              </Text>
              <Text style={{ fontSize: 11, color: '#10B981', marginTop: 2, fontWeight: '600' }}>
                {selectedFile.size ? (selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB' : 'Ready to upload'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleClearFile}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: isDark ? '#334155' : '#DCFCE7',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={18} color={isDark ? '#F8FAFC' : '#059669'} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={{
              backgroundColor: isDark ? '#0F172A' : '#FAFAFA',
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: isDark ? '#334155' : '#CBD5E1',
              borderRadius: 14,
              padding: 16,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
            onPress={handlePickDocument}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-upload-outline" size={28} color={isDark ? '#64748B' : '#94A3B8'} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>
              {t('documents:file_hint', { defaultValue: 'Click Photo, Choose Gallery, or Browse PDF' })}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8', marginBottom: 16 }}>
          ℹ️ Supported: Camera Photos, JPG, PNG, PDF, DOCX • Max size: 50MB
        </Text>

        {/* Admin Specific Sharing Options */}
        {isAdmin && (
          <View style={{ borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#E2E8F0', paddingTop: 16, marginTop: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569', marginBottom: 8 }}>
              {t('documents:share_options', { defaultValue: 'Sharing Options' })}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  alignItems: 'center',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: shareType === 'ALL' ? '#3B82F6' : (isDark ? '#334155' : '#E2E8F0'),
                  backgroundColor: shareType === 'ALL' ? (isDark ? '#1E3A8A' : '#EFF6FF') : (isDark ? '#0F172A' : '#FFFFFF'),
                }}
                onPress={() => {
                  setShareType('ALL');
                  setSelectedEmployee(null);
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: shareType === 'ALL' ? (isDark ? '#93C5FD' : '#2563EB') : (isDark ? '#94A3B8' : '#64748B') }}>
                  {t('documents:all_employees', { defaultValue: 'All Employees' })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  alignItems: 'center',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: shareType === 'INDIVIDUAL' ? '#3B82F6' : (isDark ? '#334155' : '#E2E8F0'),
                  backgroundColor: shareType === 'INDIVIDUAL' ? (isDark ? '#1E3A8A' : '#EFF6FF') : (isDark ? '#0F172A' : '#FFFFFF'),
                }}
                onPress={() => setShareType('INDIVIDUAL')}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: shareType === 'INDIVIDUAL' ? (isDark ? '#93C5FD' : '#2563EB') : (isDark ? '#94A3B8' : '#64748B') }}>
                  {t('documents:specific_employee', { defaultValue: 'Specific Employee' })}
                </Text>
              </TouchableOpacity>
            </View>

            {shareType === 'INDIVIDUAL' && (
              <View style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569', marginBottom: 8 }}>
                  {t('documents:select_recipient', { defaultValue: 'Select Recipient Employee' })}
                </Text>
                
                {selectedEmployee && (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF',
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: isDark ? '#3B82F6' : '#BFDBFE',
                  }}>
                    <Text style={{ color: isDark ? '#93C5FD' : '#1E40AF', fontSize: 13, fontWeight: '700', flex: 1 }}>
                      {t('documents:recipient', { defaultValue: 'Recipient:' })} {selectedEmployee.name} ({selectedEmployee.email})
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedEmployee(null)}>
                      <Text style={{ color: isDark ? '#93C5FD' : '#1E40AF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Input
                  containerClassName="mb-3"
                  placeholder={t('common:search_placeholder', { defaultValue: 'Search employee by name or email...' })}
                  value={searchEmployee}
                  onChangeText={setSearchEmployee}
                />

                <ScrollView
                  style={{
                    maxHeight: 180,
                    borderWidth: 1,
                    borderColor: isDark ? '#334155' : '#E2E8F0',
                    borderRadius: 12,
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  }}
                  nestedScrollEnabled={true}
                >
                  {filteredEmployees.map((emp, index) => (
                    <TouchableOpacity
                      key={emp.id}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderBottomWidth: index !== filteredEmployees.length - 1 ? 1 : 0,
                        borderBottomColor: isDark ? '#334155' : '#E2E8F0',
                        backgroundColor: selectedEmployee?.id === emp.id ? (isDark ? '#1E3A8A' : '#EFF6FF') : 'transparent',
                      }}
                      onPress={() => {
                        setSelectedEmployee(emp);
                        setSearchEmployee('');
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: selectedEmployee?.id === emp.id ? '#38BDF8' : (isDark ? '#F8FAFC' : '#0F172A') }}>
                        {emp.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>{emp.email}</Text>
                    </TouchableOpacity>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <Text style={{ padding: 16, fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>
                      {t('common:no_results', { defaultValue: 'No matching employees found.' })}
                    </Text>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* Upload Action Button */}
        <Button
          variant="primary"
          className={`mt-6 py-4 ${uploading ? 'opacity-60' : ''}`}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? t('common:loading', { defaultValue: 'Uploading...' }) : (isAdmin ? t('documents:share_doc', { defaultValue: 'Share Document' }) : t('documents:upload_doc', { defaultValue: 'Upload Document' }))}
        </Button>

        {/* Cancel Button */}
        <TouchableOpacity
          style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}
          onPress={() => router.back()}
          disabled={uploading}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B' }}>
            {t('common:cancel', { defaultValue: 'Cancel' })}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
