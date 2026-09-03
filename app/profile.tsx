import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logoutUser } from '@/services/authService';
import { PrivacyPolicyConsentModal } from '@/components/PrivacyPolicyConsentModal';
import useAttendance from '@/hooks/useAttendance';
import api from '@/services/api';


export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser, refreshUserProfile } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useFocusEffect(
    useCallback(() => {
      if (refreshUserProfile) {
        refreshUserProfile().catch(() => {});
      }
    }, [refreshUserProfile])
  );

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPhotoModalVisible, setIsPhotoModalVisible] = useState(false);
  const [isPrivacyModalVisible, setIsPrivacyModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Editable Profile fields
  const [phone, setPhone] = useState(user?.phone || '+91 98765 43210');
  const [emergencyName, setEmergencyName] = useState(user?.emergencyContactName || 'Family / Guardian');
  const [emergencyPhone, setEmergencyPhone] = useState(user?.emergencyContactPhone || '+91 91234 56789');

  const avatarUri = user?.avatar || null;

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'EM';

  const allowedLeaves = user?.allowedLeaves !== undefined ? user.allowedLeaves : 15;
  const consumedLeaves = user?.consumedLeaves !== undefined ? user.consumedLeaves : 0;
  const remainingLeaves = Math.max(0, allowedLeaves - consumedLeaves);

  // Pick image from gallery
  const handlePickFromGallery = async () => {
    try {
      setIsPhotoModalVisible(false);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Please allow gallery access to upload your profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await saveProfileAvatar(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('[Profile Photo Picker Error]:', err);
      Alert.alert('Upload Error', 'Failed to pick photo from gallery.');
    }
  };

  // Take photo with camera
  const handleTakePhoto = async () => {
    try {
      setIsPhotoModalVisible(false);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Please allow camera access to take a profile photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await saveProfileAvatar(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('[Profile Camera Error]:', err);
      Alert.alert('Camera Error', 'Failed to capture photo.');
    }
  };

  // Remove photo
  const handleRemovePhoto = async () => {
    setIsPhotoModalVisible(false);
    await saveProfileAvatar(null);
  };

  // Persist avatar locally and on backend
  const saveProfileAvatar = async (newUri: string | null) => {
    setIsUploadingPhoto(true);
    try {
      if (user?.id) {
        try {
          await api.put(`/employees/${user.id}`, {
            avatar: newUri || ''
          });
        } catch (apiErr) {
          console.warn('[Profile] Remote avatar update notice:', apiErr);
        }
      }

      setUser({
        ...user,
        avatar: newUri || undefined
      });

      Alert.alert(
        'Photo Updated',
        newUri ? 'Your profile photo has been attached and updated successfully!' : 'Profile photo has been removed.'
      );
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update profile photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      if (user?.id) {
        try {
          await api.put(`/employees/${user.id}`, {
            phone,
            emergencyContactName: emergencyName,
            emergencyContactPhone: emergencyPhone
          });
        } catch (apiErr) {
          console.warn('[Profile] Remote save notice, saving to local context:', apiErr);
        }
      }

      setUser({
        ...user,
        phone,
        emergencyContactName: emergencyName,
        emergencyContactPhone: emergencyPhone
      });

      setIsEditModalVisible(false);
      Alert.alert('Profile Updated', 'Your profile details have been saved successfully.');
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Could not update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const { status, clockOut } = useAttendance();

  const handleLogout = async () => {
    if (status === 'Checked In') {
      Alert.alert(
        'Active Shift Warning',
        'You are currently Clocked In. Logging out will automatically Clock Out your active shift and end your working hours for today.\n\nDo you want to proceed?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Proceed',
            style: 'destructive',
            onPress: async () => {
              try {
                await clockOut();
              } catch (clockErr) {
                console.warn('[Profile Logout Auto Clock-Out Warning]:', clockErr);
              }
              await logoutUser();
              setUser(null);
            }
          }
        ]
      );
    } else {
      Alert.alert(
        'Logout Confirmation',
        'Are you sure you want to log out of your corporate account?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              await logoutUser();
              setUser(null);
            }
          }
        ]
      );
    }
  };


  return (
    <View style={[styles.screen, isDark && styles.screenDark]}>
      {/* Top Header Bar */}
      <View style={[styles.navBar, isDark && styles.navBarDark, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <TouchableOpacity 
          style={[styles.backBtn, isDark && styles.backBtnDark]} 
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, isDark && styles.textWhite]}>My Profile</Text>
        <TouchableOpacity 
          style={[styles.editHeaderBtn, isDark && styles.editHeaderBtnDark]}
          onPress={() => setIsEditModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={18} color="#2563EB" />
          <Text style={styles.editHeaderText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Hero Card */}
        <View style={[styles.heroCard, isDark && styles.cardDark]}>
          {/* Avatar with Camera Badge */}
          <TouchableOpacity 
            style={styles.avatarContainer} 
            onPress={() => setIsPhotoModalVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.avatarLargeCircle}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarLargeImg} />
              ) : (
                <Text style={styles.avatarLargeText}>{initials}</Text>
              )}
              {isUploadingPhoto && (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                </View>
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.onlineBadge} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsPhotoModalVisible(true)} activeOpacity={0.7}>
            <Text style={styles.changePhotoPromptText}>
              {avatarUri ? 'Change Profile Photo' : '📷 Attach Profile Photo'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.heroName, isDark && styles.textWhite]}>{user?.name || 'Enterprise Employee'}</Text>
          <Text style={styles.heroDesignation}>
            {user?.designation || 'Specialist'} • <Text style={{ fontWeight: '700', color: isDark ? '#93C5FD' : '#2563EB' }}>{user?.department || 'Operations'}</Text>
          </Text>

          <View style={styles.heroBadgeRow}>
            <View style={styles.badgeDark}>
              <Ionicons name="id-card-outline" size={13} color="#94A3B8" style={{ marginRight: 4 }} />
              <Text style={styles.badgeDarkText}>ID: {user?.empCode || user?.employeeCode || user?.employeeId || user?.id || 'HMPL101'}</Text>
            </View>
            <View style={styles.badgeActive}>
              <Ionicons name="shield-checkmark" size={13} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.badgeActiveText}>Active Staff</Text>
            </View>
            <View style={[styles.badgeDark, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.badgeDarkText, { color: '#2563EB' }]}>{user?.role || 'EMPLOYEE'}</Text>
            </View>
          </View>
        </View>

        {/* Section 1: Contact & Personal Details */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, isDark && styles.textWhite]}>Personal & Contact Info</Text>
          <TouchableOpacity onPress={() => setIsEditModalVisible(true)}>
            <Text style={styles.sectionActionText}>Edit Info</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, isDark && styles.cardDark]}>
          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="id-card-outline" size={18} color="#6366F1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Employee Code / ID</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.empCode || user?.employeeCode || user?.employeeId || user?.id || 'N/A'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-outline" size={18} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Work Email</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.email || 'employee@hrms.com'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="call-outline" size={18} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Mobile Number</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.phoneNo || user?.phone || phone || '+91 98765 43210'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="heart-outline" size={18} color="#E11D48" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Emergency Contact</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{emergencyName} ({emergencyPhone})</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="location-outline" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Office Base / Location</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.location || 'Noida HQ'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="calendar-outline" size={18} color="#9333EA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Joining Date</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>
                {user?.joiningDate ? new Date(user.joiningDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jan 15, 2024'}
              </Text>
            </View>
          </View>
        </View>

        {/* Section 2: Employment & Shift Configuration */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>Employment & Work Shift</Text>
        
        <View style={[styles.infoCard, isDark && styles.cardDark]}>
          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="time-outline" size={18} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Shift Schedule</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>General Shift (09:30 AM - 05:30 PM)</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="briefcase-outline" size={18} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Work Mode Assigned</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.designation === 'FIELD' ? 'Field Duty Specialist' : 'Office Shift / Hybrid'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="people-outline" size={18} color="#4F46E5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Reporting Manager</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>Operations Lead (HR Department)</Text>
            </View>
          </View>
        </View>

        {/* Section 3: Leave Entitlements */}
        <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
          <Text style={[styles.sectionHeading, isDark && styles.textWhite]}>Leave Entitlements</Text>
          <TouchableOpacity onPress={() => router.push('/leaves' as any)}>
            <Text style={styles.sectionActionText}>Manage Leaves →</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.leaveGrid, isDark && styles.cardDark]}>
          <View style={styles.leaveBox}>
            <Text style={styles.leaveBoxNumber}>{allowedLeaves}</Text>
            <Text style={styles.leaveBoxLabel}>Total Annual</Text>
          </View>
          <View style={[styles.leaveBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#E2E8F0' }]}>
            <Text style={[styles.leaveBoxNumber, { color: '#E11D48' }]}>{consumedLeaves}</Text>
            <Text style={styles.leaveBoxLabel}>Consumed</Text>
          </View>
          <View style={styles.leaveBox}>
            <Text style={[styles.leaveBoxNumber, { color: '#059669' }]}>{remainingLeaves}</Text>
            <Text style={styles.leaveBoxLabel}>Remaining</Text>
          </View>
        </View>

        {/* Section 4: Privacy & Compliance Consent */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>Privacy & Compliance</Text>
        
        <View style={[styles.infoCard, isDark && styles.cardDark]}>
          <View style={styles.infoRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="shield-checkmark" size={18} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Privacy Policy Agreement</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>Accepted & Verified (v1.0)</Text>
            </View>
            <TouchableOpacity 
              style={styles.viewPolicyBtn}
              onPress={() => setIsPrivacyModalVisible(true)}
            >
              <Text style={styles.viewPolicyBtnText}>Review</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Account Button */}
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.logoutButtonText}>Logout Account</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Photo Picker Action Sheet Modal */}
      <Modal visible={isPhotoModalVisible} animationType="slide" transparent={true}>
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsPhotoModalVisible(false)} />
          <View style={[styles.photoModalSheet, isDark && styles.modalCardDark]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.photoModalTitle, isDark && styles.textWhite]}>Update Profile Photo</Text>
            <Text style={styles.photoModalSub}>Select how you would like to attach your profile picture</Text>

            <View style={{ gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={styles.photoActionBtn} onPress={handleTakePhoto} activeOpacity={0.8}>
                <View style={[styles.photoActionIconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="camera" size={20} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.photoActionText, isDark && styles.textWhite]}>Take Photo with Camera</Text>
                  <Text style={styles.photoActionSub}>Capture a new selfie or portrait</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.photoActionBtn} onPress={handlePickFromGallery} activeOpacity={0.8}>
                <View style={[styles.photoActionIconCircle, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="images" size={20} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.photoActionText, isDark && styles.textWhite]}>Choose from Gallery</Text>
                  <Text style={styles.photoActionSub}>Select an existing image from phone</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </TouchableOpacity>

              {avatarUri && (
                <TouchableOpacity style={styles.photoActionBtn} onPress={handleRemovePhoto} activeOpacity={0.8}>
                  <View style={[styles.photoActionIconCircle, { backgroundColor: '#FFE4E6' }]}>
                    <Ionicons name="trash" size={20} color="#E11D48" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.photoActionText, { color: '#E11D48' }]}>Remove Photo</Text>
                    <Text style={styles.photoActionSub}>Reset to default initials avatar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity 
              style={styles.photoCancelBtn} 
              onPress={() => setIsPhotoModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.photoCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={isEditModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDark && styles.modalCardDark]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark && styles.textWhite]}>Edit Contact Information</Text>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
                <Ionicons name="close-circle-outline" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 14, marginVertical: 14 }}>
              <View>
                <Text style={styles.inputLabel}>Mobile Phone Number</Text>
                <TextInput
                  style={[styles.textInput, isDark && styles.textInputDark]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>Emergency Contact Name / Relation</Text>
                <TextInput
                  style={[styles.textInput, isDark && styles.textInputDark]}
                  value={emergencyName}
                  onChangeText={setEmergencyName}
                  placeholder="e.g. Spouse / Parent"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>Emergency Contact Phone</Text>
                <TextInput
                  style={[styles.textInput, isDark && styles.textInputDark]}
                  value={emergencyPhone}
                  onChangeText={setEmergencyPhone}
                  placeholder="+91 91234 56789"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSaveBtn} 
                onPress={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Review Modal */}
      <PrivacyPolicyConsentModal
        visible={isPrivacyModalVisible}
        onAccept={() => setIsPrivacyModalVisible(false)}
        user={user}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  screenDark: {
    backgroundColor: '#0F172A',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navBarDark: {
    backgroundColor: '#0F172A',
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnDark: {
    backgroundColor: '#1E293B',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  editHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
  },
  editHeaderBtnDark: {
    backgroundColor: '#1E293B',
  },
  editHeaderText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
  },
  cardDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  avatarLargeCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  avatarLargeImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarLargeText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 40,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 3,
  },
  onlineBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  changePhotoPromptText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 10,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  heroDesignation: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badgeDark: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeDarkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  badgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeActiveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  leaveGrid: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  leaveBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveBoxNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  leaveBoxLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  viewPolicyBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  viewPolicyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F43F5E',
    paddingVertical: 15,
    borderRadius: 18,
    marginTop: 24,
    shadowColor: '#F43F5E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  textWhite: {
    color: '#F8FAFC',
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  photoModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  photoModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  photoModalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  photoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  photoActionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  photoActionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  photoCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
  },
  photoCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
  },
  modalCardDark: {
    backgroundColor: '#1E293B',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  textInputDark: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    color: '#F8FAFC',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
