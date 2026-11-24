import React, { useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  Image,
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  ScrollView, 
  Alert 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { logoutUser } from '@/services/authService';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '@/src/hooks/useLanguage';
import { LanguageModal } from '@/src/components/i18n/LanguageModal';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveAvatarUrl } from '@/utils/avatar';
import { getDateLocale } from '@/src/i18n/dateLocale';

export default function Header() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { currentLanguage } = useLanguage();
  const { t } = useTranslationSafe(['dashboard', 'common', 'auth']);

  const [langModalVisible, setLangModalVisible] = useState(false);
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [hasUnreadNotif, setHasUnreadNotif] = useState(false);
  // Built at render (not stored in state) so the text follows the app language.
  const notificationsList = [
    {
      id: '1',
      title: t('nav:welcome_to_enterprise_hrms', { defaultValue: 'Welcome to Enterprise HRMS' }),
      body: t('nav:welcome_body', { defaultValue: 'Explore your shift logs, leave management, and team chat.' }),
      time: t('nav:today', { defaultValue: 'Today' }),
    },
  ];

  // Dynamic time-of-day greeting string
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return t('nav:good_morning', { defaultValue: 'Good Morning' });
    if (hour >= 12 && hour < 17) return t('nav:good_afternoon', { defaultValue: 'Good Afternoon' });
    return t('nav:good_evening', { defaultValue: 'Good Evening' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLanguage]);

  const formattedDate = new Date().toLocaleDateString(getDateLocale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const [imgError, setImgError] = useState(false);
  const avatarUri = imgError ? null : resolveAvatarUrl(user?.avatar);

  React.useEffect(() => {
    setImgError(false);
  }, [user?.avatar]);

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'EM';

  const handleLogout = async () => {
    setProfileSheetVisible(false);
    
    let isCheckedIn = false;
    if (user?.id) {
      try {
        const stateStr = await AsyncStorage.getItem(`attendanceState_${user.id}`);
        if (stateStr) {
          const parsed = JSON.parse(stateStr);
          isCheckedIn = parsed.status === 'Checked In';
        }
      } catch (_) {}
    }

    if (isCheckedIn) {
      Alert.alert(
        t('nav:active_shift_warning', { defaultValue: 'Active Shift Warning' }),
        'You have an active shift in progress. Logging out will clear your local session.\n\nDo you want to proceed with logout?',
        [
          { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { 
            text: t('nav:proceed', { defaultValue: 'Proceed' }), 
            style: 'destructive',
            onPress: async () => {
              await logoutUser();
              setUser(null);
            }
          }
        ]
      );
    } else {
      Alert.alert(
        t('nav:confirm_logout', { defaultValue: 'Confirm Logout' }),
        t('nav:are_you_sure_you_want_to', { defaultValue: 'Are you sure you want to log out of your corporate account?' }),
        [
          { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { 
            text: t('nav:logout', { defaultValue: 'Logout' }), 
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


  const menuItems = [
    { key: 'profile', title: t('nav:my_profile', { defaultValue: 'My Profile' }), icon: 'person-outline', action: () => { setProfileSheetVisible(false); router.push('/profile' as any); } },
    { key: 'attendance', title: t('nav:shift_logs_and_history', { defaultValue: 'Shift Logs & History' }), icon: 'time-outline', action: () => { setProfileSheetVisible(false); router.push('/attendance-today' as any); } },
    { key: 'leave', title: t('nav:leave_management', { defaultValue: 'Leave Management' }), icon: 'calendar-outline', action: () => { setProfileSheetVisible(false); router.push('/leaves' as any); } },
    { key: 'documents', title: t('nav:documents_vault', { defaultValue: 'Documents Vault' }), icon: 'folder-open-outline', action: () => { setProfileSheetVisible(false); router.push('/documents' as any); } },
    { key: 'expenses', title: t('nav:expense_claims', { defaultValue: 'Expense Claims' }), icon: 'card-outline', action: () => { setProfileSheetVisible(false); router.push('/expenses' as any); } },
    { key: 'language', title: `${t('nav:language', { defaultValue: 'Language' })} (${currentLanguage.toUpperCase()})`, icon: 'globe-outline', action: () => { setProfileSheetVisible(false); setLangModalVisible(true); } },
  ];

  return (
    <View 
      style={[
        styles.container, 
        isDark && styles.containerDark,
        { paddingTop: Math.max(insets.top + 6, 14) }
      ]}
    >
      {/* Clickable Profile Header Row */}
      <TouchableOpacity 
        style={styles.profileRow} 
        onPress={() => setProfileSheetVisible(true)}
        activeOpacity={0.85}
      >
        <View style={styles.avatarCircle}>
          {avatarUri ? (
            <Image 
              source={{ uri: avatarUri }} 
              style={styles.avatarImg} 
              onError={() => setImgError(true)} 
            />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
          <View style={styles.onlineBadge} />
        </View>

        <View style={styles.userInfo}>
          <Text style={[styles.welcomeText, isDark && styles.textSecondaryDark]}>
            {greetingText} • {formattedDate}
          </Text>
          <Text style={[styles.userName, isDark && styles.textDark]} numberOfLines={1}>
            {user?.name || t('nav:enterprise_employee', { defaultValue: 'Enterprise Employee' })}
          </Text>
          <Text style={[styles.userRole, isDark && styles.textSecondaryDark]} numberOfLines={1}>
            {user?.designation || '–'} • <Text style={{ color: isDark ? '#38BDF8' : '#0F172A', fontWeight: '700' }}>{user?.department || '–'}</Text>
          </Text>
        </View>
      </TouchableOpacity>

      {/* Right Action Bar: Notification Bell & Language Selector */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionIconBtn, isDark && styles.actionIconBtnDark]}
          onPress={() => {
            setHasUnreadNotif(false);
            setNotifModalVisible(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="notifications-outline" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          {hasUnreadNotif && <View style={styles.notifDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.langBtn, isDark && styles.langBtnDark]}
          onPress={() => setLangModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="globe-outline" size={15} color={isDark ? '#94A3B8' : '#0F172A'} />
          <Text style={[styles.langCodeText, isDark && styles.langCodeTextDark]}>
            {currentLanguage.toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Notifications Center Modal */}
      <Modal visible={notifModalVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setNotifModalVisible(false)} />
          <View style={[styles.sheetContainer, isDark && styles.sheetContainerDark, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.notifHeaderRow}>
              <Text style={[styles.notifTitle, isDark && styles.textDark]}>{t('nav:system_notifications', { defaultValue: 'System Notifications' })}</Text>
              <TouchableOpacity onPress={() => setNotifModalVisible(false)}>
                <Ionicons name="close-circle-outline" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300, marginTop: 12 }}>
              {notificationsList.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#94a3b8', marginVertical: 20 }}>{t('nav:no_new_notifications', { defaultValue: 'No new notifications.' })}</Text>
              ) : (
                notificationsList.map(n => (
                  <View key={n.id} style={[styles.notifCard, isDark && styles.cardDark]}>
                    <Ionicons name="information-circle-outline" size={24} color="#007AFF" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.notifItemTitle, isDark && styles.textDark]}>{n.title}</Text>
                      <Text style={[styles.notifItemBody, isDark && { color: '#94A3B8' }]}>{n.body}</Text>
                      <Text style={[styles.notifItemTime, isDark && { color: '#64748B' }]}>{n.time}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Language Selection Modal */}
      <LanguageModal
        visible={langModalVisible}
        onClose={() => setLangModalVisible(false)}
      />

      {/* Interactive Profile Bottom Sheet Modal */}
      <Modal visible={profileSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <TouchableOpacity 
            style={{ flex: 1 }} 
            activeOpacity={1} 
            onPress={() => setProfileSheetVisible(false)} 
          />

          <View style={[styles.sheetContainer, isDark && styles.sheetContainerDark, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            {/* Sheet Handle Bar */}
            <View style={styles.sheetHandle} />

            {/* Profile Info Card inside Sheet */}
            <View style={[styles.sheetProfileCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
              <View style={[styles.sheetAvatarLarge, isDark && { backgroundColor: '#334155' }]}>
                {avatarUri ? (
                  <Image 
                    source={{ uri: avatarUri }} 
                    style={styles.sheetAvatarImg} 
                    onError={() => setImgError(true)} 
                  />
                ) : (
                  <Text style={styles.sheetAvatarText}>{initials}</Text>
                )}
              </View>

              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[styles.sheetName, isDark && styles.textDark]}>{user?.name || t('nav:enterprise_employee', { defaultValue: 'Enterprise Employee' })}</Text>
                <Text style={[styles.sheetRoleText, isDark && { color: '#94A3B8' }]}>{user?.designation || '–'} • {user?.department || '–'}</Text>
                <View style={styles.sheetBadgeRow}>
                  <View style={[styles.idBadge, isDark && { backgroundColor: '#0F172A' }]}>
                    <Text style={[styles.idBadgeText, isDark && { color: '#F8FAFC' }]}>ID: {user?.empCode || user?.employeeCode || user?.id || 'EMP-1002'}</Text>
                  </View>
                  <View style={[styles.idBadge, isDark ? { backgroundColor: '#064E3B' } : { backgroundColor: '#D1FAE5' }]}>
                    <Text style={[styles.idBadgeText, isDark ? { color: '#34D399' } : { color: '#059669' }]}>{t('nav:active_staff', { defaultValue: 'Active Staff' })}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity onPress={() => setProfileSheetVisible(false)}>
                <Ionicons name="close-circle-outline" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Detailed Metadata Grid */}
            <View style={styles.metaGrid}>
              <View style={[styles.metaBox, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                <Text style={[styles.metaLabel, isDark && { color: '#94A3B8' }]}>{t('nav:work_email', { defaultValue: 'Work Email' })}</Text>
                <Text style={[styles.metaVal, isDark && { color: '#F8FAFC' }]} numberOfLines={1}>{user?.email || '–'}</Text>
              </View>
              <View style={[styles.metaBox, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                <Text style={[styles.metaLabel, isDark && { color: '#94A3B8' }]}>{t('nav:joining_date', { defaultValue: 'Joining Date' })}</Text>
                <Text style={[styles.metaVal, isDark && { color: '#F8FAFC' }]}>
                  {user?.joiningDate && !isNaN(new Date(user.joiningDate).getTime()) ? new Date(user.joiningDate).toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric', year: 'numeric' }) : '–'}
                </Text>
              </View>
            </View>

            {/* Scrollable Settings Menu List */}
            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              {menuItems.map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.menuRow, isDark && styles.menuRowDark]}
                  onPress={item.action}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconCircle, isDark && { backgroundColor: '#1E293B' }]}>
                    <Ionicons name={item.icon as any} size={18} color={isDark ? '#38BDF8' : '#0F172A'} />
                  </View>
                  <Text style={[styles.menuTitle, isDark && styles.textDark]}>{item.title}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Fixed Logout Button at Bottom */}
            <TouchableOpacity 
              style={styles.fixedLogoutBtn} 
              onPress={handleLogout}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
              <Text style={styles.fixedLogoutText}>{t('nav:logout_account', { defaultValue: 'Logout Account' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 100,
  },
  containerDark: {
    backgroundColor: '#0F172A',
    borderBottomColor: '#1E293B',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  sheetAvatarImg: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userInfo: {
    flexDirection: 'column',
    flex: 1,
  },
  welcomeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  textSecondaryDark: {
    color: '#94A3B8',
  },
  userName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  userRole: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  textDark: {
    color: '#F8FAFC',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  actionIconBtnDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F43F5E',
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langBtnDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  langCodeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  langCodeTextDark: {
    color: '#F8FAFC',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetContainerDark: {
    backgroundColor: '#0F172A',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sheetAvatarLarge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  sheetName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetRoleText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sheetBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  idBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  idBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metaBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  metaVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  menuRowDark: {
    borderBottomColor: '#1E293B',
  },
  menuIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  fixedLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F43F5E',
    paddingVertical: 14,
    borderRadius: 18,
    marginTop: 16,
    shadowColor: '#F43F5E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  fixedLogoutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 8,
  },
  notifHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  notifTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  notifItemTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  notifItemBody: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  notifItemTime: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
});
