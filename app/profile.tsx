import React, { useState, useCallback, useEffect } from 'react';
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
import { getLeaveSummary, formatLeaveDays } from '@/utils/leaveBalance';
import { getCachedAppSettings } from '@/services/settingsService';
import { PrivacyPolicyConsentModal } from '@/components/PrivacyPolicyConsentModal';
import useAttendance from '@/hooks/useAttendance';
import api from '@/services/api';
import { resolveAvatarUrl } from '@/utils/avatar';
import { setSecureItem } from '@/utils/storage';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { getDateLocale } from '@/src/i18n/dateLocale';


export default function ProfileScreen() {
  const { t } = useTranslationSafe(['employee', 'common']);
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
  const [phone, setPhone] = useState(user?.phone || '');
  const [emergencyName, setEmergencyName] = useState(user?.emergencyContactName || '');
  const [emergencyPhone, setEmergencyPhone] = useState(user?.emergencyContactPhone || '');
  const [imageLoadError, setImageLoadError] = useState(false);

  // Safely resolve permanent URL (remote or optimistic preview)
  const resolvedAvatar = resolveAvatarUrl(user?.avatar);
  const avatarUri = imageLoadError ? null : resolvedAvatar;

  // Reset image error state whenever user avatar changes
  useEffect(() => {
    setImageLoadError(false);
  }, [user?.avatar]);

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'EM';

  // Leave figures for this login, as the server reports them (refreshed from GET /employees/:id each
  // time this screen gains focus); "–" where the server sent none, never an invented default.
  const leaveSummary = getLeaveSummary(user);

  // Shift window from the server-configured settings (the same source the Home screen uses).
  const [shiftWindow, setShiftWindow] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getCachedAppSettings()
      .then((s) => { if (alive && s?.punch_in_start && s?.punch_out_time) setShiftWindow(`${s.punch_in_start} - ${s.punch_out_time}`); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  // Shown only if the server sends one for this employee (no placeholder name).
  const managerName: string | undefined = typeof user?.reportingManager === 'string' ? user.reportingManager : user?.reportingManager?.name;

  // Pick image from gallery
  const handlePickFromGallery = async () => {
    try {
      setIsPhotoModalVisible(false);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('employee:permission_denied', { defaultValue: 'Permission Denied' }), t('employee:please_allow_gallery_access_to_upload', { defaultValue: 'Please allow gallery access to upload your profile photo.' }));
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
      Alert.alert(t('employee:upload_error', { defaultValue: 'Upload Error' }), t('employee:failed_to_pick_photo_from_gallery', { defaultValue: 'Failed to pick photo from gallery.' }));
    }
  };

  // Take photo with camera
  const handleTakePhoto = async () => {
    try {
      setIsPhotoModalVisible(false);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('employee:permission_denied', { defaultValue: 'Permission Denied' }), t('employee:please_allow_camera_access_to_take', { defaultValue: 'Please allow camera access to take a profile photo.' }));
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
      Alert.alert(t('employee:camera_error', { defaultValue: 'Camera Error' }), t('employee:failed_to_capture_photo', { defaultValue: 'Failed to capture photo.' }));
    }
  };

  // Remove photo
  const handleRemovePhoto = async () => {
    setIsPhotoModalVisible(false);
    await saveProfileAvatar(null);
  };

  // Persist avatar permanently to backend server and SecureStore
  const saveProfileAvatar = async (newUri: string | null) => {
    setIsUploadingPhoto(true);
    setImageLoadError(false);

    try {
      if (!newUri) {
        // User requested removing avatar
        if (user?.id) {
          try {
            await api.delete(`/employees/${user.id}/avatar`);
          } catch (deleteErr) {
            console.warn('[Profile] Remote DELETE avatar fallback to PUT:', deleteErr);
            await api.put(`/employees/${user.id}`, { avatar: null });
          }
        }

        const updatedUser = {
          ...user,
          avatar: null,
        };
        setUser(updatedUser);
        await setSecureItem('userProfile', JSON.stringify(updatedUser));
        if (refreshUserProfile && user?.id) {
          refreshUserProfile(user.id).catch(() => {});
        }

        Alert.alert(t('employee:photo_removed', { defaultValue: 'Photo Removed' }), t('employee:your_profile_photo_has_been_removed', { defaultValue: 'Your profile photo has been removed and reset to initials.' }));
        return;
      }

      // Optimistic local preview immediately
      setUser((prev: any) => ({
        ...(prev || {}),
        avatar: newUri,
      }));

      let serverAvatarUrl = newUri;
      let remoteSaveSucceeded = false;

      if (user?.id) {
        try {
          const rawFilename = newUri.split('/').pop() || `avatar_${Date.now()}.jpg`;
          const extMatch = /\.(\w+)$/.exec(rawFilename);
          const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
          const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          const cleanFilename = rawFilename.includes('.') ? rawFilename : `${rawFilename}.jpg`;

          const formData = new FormData();
          // @ts-ignore - React Native FormData expects { uri, name, type }
          formData.append('avatar', {
            uri: newUri,
            name: cleanFilename,
            type: mimeType,
          });

          const uploadRes = await api.post(`/employees/${user.id}/avatar`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });

          if (uploadRes.data?.avatar) {
            serverAvatarUrl = uploadRes.data.avatar;
            remoteSaveSucceeded = true;
          } else if (uploadRes.data?.employee?.avatar) {
            serverAvatarUrl = uploadRes.data.employee.avatar;
            remoteSaveSucceeded = true;
          }
        } catch (apiErr: any) {
          console.warn('[Profile] Multipart avatar upload error, trying fallback PUT:', apiErr?.message);
          try {
            await api.put(`/employees/${user.id}`, {
              avatar: newUri,
            });
            remoteSaveSucceeded = true;
          } catch (fallbackErr) {
            console.warn('[Profile] Fallback PUT also failed:', fallbackErr);
          }
        }
      }

      const persistentUser = {
        ...user,
        avatar: serverAvatarUrl,
      };
      setUser(persistentUser);
      await setSecureItem('userProfile', JSON.stringify(persistentUser));
      if (refreshUserProfile && user?.id) {
        refreshUserProfile(user.id).catch(() => {});
      }

      if (remoteSaveSucceeded) {
        Alert.alert(
          t('employee:photo_saved_permanently', { defaultValue: 'Photo Saved Permanently' }),
          t('employee:your_profile_photo_has_been_uploaded', { defaultValue: 'Your profile photo has been uploaded and saved! It will now show everywhere across all devices and in team chats.' })
        );
      } else {
        Alert.alert(
          t('employee:saved_on_this_device_only', { defaultValue: 'Saved on This Device Only' }),
          t('employee:your_profile_photo_could_not_be', { defaultValue: 'Your profile photo could not be uploaded to the server, so it will only show on this device until you try again with a connection.' })
        );
      }
    } catch (err: any) {
      console.error('[Profile Avatar Error]', err);
      Alert.alert(t('employee:update_failed', { defaultValue: 'Update Failed' }), err?.message || 'Could not update profile photo.');
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

      const updatedUser = {
        ...user,
        phone,
        emergencyContactName: emergencyName,
        emergencyContactPhone: emergencyPhone
      };
      setUser(updatedUser);
      await setSecureItem('userProfile', JSON.stringify(updatedUser));

      setIsEditModalVisible(false);
      Alert.alert(t('employee:profile_updated', { defaultValue: 'Profile Updated' }), t('employee:your_profile_details_have_been_saved', { defaultValue: 'Your profile details have been saved successfully.' }));
    } catch (err: any) {
      Alert.alert(t('employee:save_failed_2', { defaultValue: 'Save Failed' }), err?.message || 'Could not update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const { status, clockOut } = useAttendance();

  const handleLogout = async () => {
    if (status === 'Checked In') {
      Alert.alert(
        t('employee:active_shift_warning', { defaultValue: 'Active Shift Warning' }),
        'You are currently Clocked In. Logging out will automatically Clock Out your active shift and end your working hours for today.\n\nDo you want to proceed?',
        [
          { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('employee:proceed', { defaultValue: 'Proceed' }),
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
        t('employee:logout_confirmation', { defaultValue: 'Logout Confirmation' }),
        t('employee:are_you_sure_you_want_to', { defaultValue: 'Are you sure you want to log out of your corporate account?' }),
        [
          { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('employee:logout', { defaultValue: 'Logout' }),
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
        <Text style={[styles.navTitle, isDark && styles.textWhite]}>{t('employee:my_profile', { defaultValue: 'My Profile' })}</Text>
        <TouchableOpacity 
          style={[styles.editHeaderBtn, isDark && styles.editHeaderBtnDark]}
          onPress={() => setIsEditModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={18} color="#2563EB" />
          <Text style={styles.editHeaderText}>{t('common:edit', { defaultValue: 'Edit' })}</Text>
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
                <Image 
                  source={{ uri: avatarUri }} 
                  style={styles.avatarLargeImg} 
                  onError={() => setImageLoadError(true)} 
                />
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
              {avatarUri ? t('employee:change_profile_photo', { defaultValue: 'Change Profile Photo' }) : t('employee:attach_profile_photo', { defaultValue: '📷 Attach Profile Photo' })}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.heroName, isDark && styles.textWhite]}>{user?.name || 'Enterprise Employee'}</Text>
          <Text style={styles.heroDesignation}>
            {user?.designation || '–'} • <Text style={{ fontWeight: '700', color: isDark ? '#93C5FD' : '#2563EB' }}>{user?.department || '–'}</Text>
          </Text>

          <View style={styles.heroBadgeRow}>
            <View style={styles.badgeDark}>
              <Ionicons name="id-card-outline" size={13} color="#94A3B8" style={{ marginRight: 4 }} />
              <Text style={styles.badgeDarkText}>ID: {user?.empCode || user?.employeeCode || user?.employeeId || user?.id || '–'}</Text>
            </View>
            <View style={styles.badgeActive}>
              <Ionicons name="shield-checkmark" size={13} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.badgeActiveText}>{t('employee:active_staff', { defaultValue: 'Active Staff' })}</Text>
            </View>
            <View style={[styles.badgeDark, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.badgeDarkText, { color: '#2563EB' }]}>{user?.role || 'EMPLOYEE'}</Text>
            </View>
          </View>
        </View>

        {/* Section 1: Contact & Personal Details */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, isDark && styles.textWhite]}>{t('employee:personal_and_contact_info', { defaultValue: 'Personal & Contact Info' })}</Text>
          <TouchableOpacity onPress={() => setIsEditModalVisible(true)}>
            <Text style={styles.sectionActionText}>{t('employee:edit_info', { defaultValue: 'Edit Info' })}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, isDark && styles.cardDark]}>
          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="id-card-outline" size={18} color="#6366F1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:employee_code_id', { defaultValue: 'Employee Code / ID' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.empCode || user?.employeeCode || user?.employeeId || user?.id || 'N/A'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-outline" size={18} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:work_email', { defaultValue: 'Work Email' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.email || '–'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="call-outline" size={18} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:mobile_number', { defaultValue: 'Mobile Number' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.phoneNo || user?.phone || phone || '+91 98765 43210'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="heart-outline" size={18} color="#E11D48" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:emergency_contact', { defaultValue: 'Emergency Contact' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{emergencyName} ({emergencyPhone})</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="location-outline" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:office_base_location', { defaultValue: 'Office Base / Location' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.location || '–'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="calendar-outline" size={18} color="#9333EA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:joiningDate', { defaultValue: 'Joining Date' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>
                {user?.joiningDate && !isNaN(new Date(user.joiningDate).getTime()) ? new Date(user.joiningDate).toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric', year: 'numeric' }) : '–'}
              </Text>
            </View>
          </View>
        </View>

        {/* Section 2: Employment & Shift Configuration */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>{t('employee:employment_and_work_shift', { defaultValue: 'Employment & Work Shift' })}</Text>
        
        <View style={[styles.infoCard, isDark && styles.cardDark]}>
          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="time-outline" size={18} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:shift_schedule', { defaultValue: 'Shift Schedule' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{shiftWindow ? `General Shift (${shiftWindow})` : '–'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="briefcase-outline" size={18} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:work_mode_assigned', { defaultValue: 'Work Mode Assigned' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{user?.designation === 'FIELD' ? 'Field Duty Specialist' : 'Office Shift / Hybrid'}</Text>
            </View>
          </View>

          {managerName ? (
            <>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name="people-outline" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>{t('employee:reporting_manager', { defaultValue: 'Reporting Manager' })}</Text>
                  <Text style={[styles.infoVal, isDark && styles.textWhite]}>{managerName}</Text>
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* Section 3: Leave Entitlements */}
        <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
          <Text style={[styles.sectionHeading, isDark && styles.textWhite]}>{t('employee:leave_entitlements', { defaultValue: 'Leave Entitlements' })}</Text>
          <TouchableOpacity onPress={() => router.push('/leaves' as any)}>
            <Text style={styles.sectionActionText}>{t('employee:manage_leaves', { defaultValue: 'Manage Leaves →' })}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.leaveGrid, isDark && styles.cardDark]}>
          <View style={styles.leaveBox}>
            <Text style={styles.leaveBoxNumber}>{formatLeaveDays(leaveSummary.totalEarned)}</Text>
            <Text style={styles.leaveBoxLabel}>{t('employee:total_earned', { defaultValue: 'Total Earned' })}</Text>
          </View>
          <View style={[styles.leaveBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#E2E8F0' }]}>
            <Text style={[styles.leaveBoxNumber, { color: '#E11D48' }]}>{formatLeaveDays(leaveSummary.consumed)}</Text>
            <Text style={styles.leaveBoxLabel}>{t('employee:consumed', { defaultValue: 'Consumed' })}</Text>
          </View>
          <View style={styles.leaveBox}>
            <Text style={[styles.leaveBoxNumber, { color: '#059669' }]}>{formatLeaveDays(leaveSummary.available)}</Text>
            <Text style={styles.leaveBoxLabel}>{t('employee:remaining', { defaultValue: 'Remaining' })}</Text>
          </View>
        </View>

        {/* Section 4: Privacy & Compliance Consent */}
        <Text style={[styles.sectionHeading, isDark && styles.textWhite, { marginTop: 22 }]}>{t('employee:privacy_and_compliance', { defaultValue: 'Privacy & Compliance' })}</Text>
        
        <View style={[styles.infoCard, isDark && styles.cardDark]}>
          <View style={styles.infoRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="shield-checkmark" size={18} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('employee:privacy_policy_agreement', { defaultValue: 'Privacy Policy Agreement' })}</Text>
              <Text style={[styles.infoVal, isDark && styles.textWhite]}>{t('employee:accepted_and_verified_v1_0', { defaultValue: 'Accepted & Verified (v1.0)' })}</Text>
            </View>
            <TouchableOpacity 
              style={styles.viewPolicyBtn}
              onPress={() => setIsPrivacyModalVisible(true)}
            >
              <Text style={styles.viewPolicyBtnText}>{t('employee:review', { defaultValue: 'Review' })}</Text>
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
          <Text style={styles.logoutButtonText}>{t('employee:logout_account', { defaultValue: 'Logout Account' })}</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Photo Picker Action Sheet Modal */}
      <Modal visible={isPhotoModalVisible} animationType="slide" transparent={true}>
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsPhotoModalVisible(false)} />
          <View style={[styles.photoModalSheet, isDark && styles.modalCardDark]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.photoModalTitle, isDark && styles.textWhite]}>{t('employee:update_profile_photo', { defaultValue: 'Update Profile Photo' })}</Text>
            <Text style={styles.photoModalSub}>{t('employee:select_how_you_would_like_to', { defaultValue: 'Select how you would like to attach your profile picture' })}</Text>

            <View style={{ gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={styles.photoActionBtn} onPress={handleTakePhoto} activeOpacity={0.8}>
                <View style={[styles.photoActionIconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="camera" size={20} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.photoActionText, isDark && styles.textWhite]}>{t('employee:take_photo_with_camera', { defaultValue: 'Take Photo with Camera' })}</Text>
                  <Text style={styles.photoActionSub}>{t('employee:capture_a_new_selfie_or_portrait', { defaultValue: 'Capture a new selfie or portrait' })}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.photoActionBtn} onPress={handlePickFromGallery} activeOpacity={0.8}>
                <View style={[styles.photoActionIconCircle, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="images" size={20} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.photoActionText, isDark && styles.textWhite]}>{t('employee:choose_from_gallery', { defaultValue: 'Choose from Gallery' })}</Text>
                  <Text style={styles.photoActionSub}>{t('employee:select_an_existing_image_from_phone', { defaultValue: 'Select an existing image from phone' })}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </TouchableOpacity>

              {avatarUri && (
                <TouchableOpacity style={styles.photoActionBtn} onPress={handleRemovePhoto} activeOpacity={0.8}>
                  <View style={[styles.photoActionIconCircle, { backgroundColor: '#FFE4E6' }]}>
                    <Ionicons name="trash" size={20} color="#E11D48" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.photoActionText, { color: '#E11D48' }]}>{t('employee:remove_photo', { defaultValue: 'Remove Photo' })}</Text>
                    <Text style={styles.photoActionSub}>{t('employee:reset_to_default_initials_avatar', { defaultValue: 'Reset to default initials avatar' })}</Text>
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
              <Text style={styles.photoCancelBtnText}>{t('common:cancel', { defaultValue: 'Cancel' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={isEditModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDark && styles.modalCardDark]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark && styles.textWhite]}>{t('employee:edit_contact_information', { defaultValue: 'Edit Contact Information' })}</Text>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
                <Ionicons name="close-circle-outline" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 14, marginVertical: 14 }}>
              <View>
                <Text style={styles.inputLabel}>{t('employee:mobile_phone_number', { defaultValue: 'Mobile Phone Number' })}</Text>
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
                <Text style={styles.inputLabel}>{t('employee:emergency_contact_name_relation', { defaultValue: 'Emergency Contact Name / Relation' })}</Text>
                <TextInput
                  style={[styles.textInput, isDark && styles.textInputDark]}
                  value={emergencyName}
                  onChangeText={setEmergencyName}
                  placeholder={t('employee:e_g_spouse_parent', { defaultValue: 'e.g. Spouse / Parent' })}
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>{t('employee:emergency_contact_phone', { defaultValue: 'Emergency Contact Phone' })}</Text>
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
                <Text style={styles.modalCancelText}>{t('common:cancel', { defaultValue: 'Cancel' })}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSaveBtn} 
                onPress={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>{t('employee:save_changes', { defaultValue: 'Save Changes' })}</Text>
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
