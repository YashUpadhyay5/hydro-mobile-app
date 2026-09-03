import Header from "@/components/Header";
import { useTranslationSafe } from "@/src/hooks/useTranslationSafe";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Platform, 
  Alert, 
  Vibration,
  ActivityIndicator,
  Linking
} from "react-native";
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import useAttendance from "@/hooks/useAttendance";
import { WorkTypeSelectorModal } from "@/components/WorkTypeSelectorModal";
import { HolidayCalendarModal } from "@/components/HolidayCalendarModal";
import { AnnouncementsModal } from "@/components/AnnouncementsModal";
import { useAuth } from "@/context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import api from "@/services/api";

interface Holiday {
  id: string;
  title?: string;
  name?: string;
  date: string;
  dateFormatted?: string;
  day?: string;
  type: string;
  description?: string;
  diffDays?: number;
  countdown?: string;
}

interface CalendarInfo {
  id: string;
  name: string;
  location: string;
  year: number;
  totalHolidays: number;
}

interface Announcement {
  id: string;
  title: string;
  description: string;
  datePosted: string;
  priority: string;
  author?: string;
}

function parseHolidayDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  
  // 1. ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // 2. Format: DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split(/[-/]/).map(Number);
    return new Date(y, m - 1, d);
  }

  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  // 3. Format: "15 Aug 2026" or "15 August 2026"
  const dayMonthYearMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (dayMonthYearMatch) {
    const d = parseInt(dayMonthYearMatch[1], 10);
    const monthStr = dayMonthYearMatch[2].substring(0, 3).toLowerCase();
    const y = parseInt(dayMonthYearMatch[3], 10);
    if (monthMap[monthStr] !== undefined) {
      return new Date(y, monthMap[monthStr], d);
    }
  }

  // 4. Format: "Aug 15, 2026" or "August 15 2026"
  const monthDayYearMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthDayYearMatch) {
    const monthStr = monthDayYearMatch[1].substring(0, 3).toLowerCase();
    const d = parseInt(monthDayYearMatch[2], 10);
    const y = parseInt(monthDayYearMatch[3], 10);
    if (monthMap[monthStr] !== undefined) {
      return new Date(y, monthMap[monthStr], d);
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

export default function HomeScreen() {
  const { user, setUser, refreshUserProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useTranslationSafe(['dashboard', 'common', 'attendance']);
  const [isWorkTypeModalVisible, setIsWorkTypeModalVisible] = useState(false);
  const [isHolidayModalVisible, setIsHolidayModalVisible] = useState(false);
  const [isAnnouncementModalVisible, setIsAnnouncementModalVisible] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);

  // Dynamic API state for Holidays & Announcements
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarInfo, setCalendarInfo] = useState<CalendarInfo | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setLoadingData(true);
      
      // 1. Fetch Location-Isolated Holidays from Backend for this specific Employee
      let rawHolidays: any[] = [];
      const userLocation = user?.location || user?.holidayDetails || '';

      try {
        const resMyHolidays = await api.get('/v1/employees/my-holidays', {
          params: {
            ...(user?.id ? { employeeId: user.id } : {}),
            ...(userLocation ? { location: userLocation } : {})
          }
        });
        if (resMyHolidays.data?.success && Array.isArray(resMyHolidays.data.holidays) && resMyHolidays.data.holidays.length > 0) {
          rawHolidays = resMyHolidays.data.holidays;
          if (resMyHolidays.data.calendar) {
            setCalendarInfo(resMyHolidays.data.calendar);
          }
        }
      } catch (err: any) {
        console.warn("Backend /v1/employees/my-holidays notice:", err.message);
      }

      // If needed, check primary /api/holidays endpoint with location query
      if (rawHolidays.length === 0) {
        try {
          const resHolidays = await api.get('/holidays', {
            params: userLocation ? { location: userLocation } : {}
          });
          if (Array.isArray(resHolidays.data) && resHolidays.data.length > 0) {
            rawHolidays = resHolidays.data;
          }
        } catch (err: any) {
          console.warn("Backend /holidays notice:", err.message);
        }
      }

      // Process and normalize holidays with real-time date comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      const processedHolidays: Holiday[] = rawHolidays.map((h, idx) => {
        const targetDate = parseHolidayDate(h.date);
        let diffDays: number | undefined = undefined;
        let countdown = h.countdown || '';
        let dateFormatted = h.dateFormatted || h.date;
        let day = h.day || '';

        if (targetDate) {
          diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          dateFormatted = `${months[targetDate.getMonth()]} ${String(targetDate.getDate()).padStart(2, '0')}, ${targetDate.getFullYear()}`;
          day = daysOfWeek[targetDate.getDay()];

          if (diffDays === 0) countdown = 'Today 🎉';
          else if (diffDays === 1) countdown = 'Tomorrow 🎈';
          else if (diffDays === -1) countdown = 'Yesterday ⌛';
          else if (diffDays > 1) countdown = `In ${diffDays} days`;
          else countdown = `${Math.abs(diffDays)} days ago`;
        }

        return {
          id: h.id || `hol_${idx}`,
          title: h.title || h.name || 'Holiday',
          name: h.name || h.title || 'Holiday',
          date: h.date,
          dateFormatted,
          day,
          type: h.type || 'National',
          description: h.description || '',
          diffDays,
          countdown
        };
      });

      setHolidays(processedHolidays);

      // 2. Fetch Announcements directly from Backend (/api/v1/announcements, fallback /api/announcements)
      let fetchedAnnouncements: Announcement[] = [];
      try {
        let resAnnouncements: any = null;
        try {
          resAnnouncements = await api.get('/v1/announcements');
        } catch (e) {
          resAnnouncements = await api.get('/announcements');
        }

        let dataArray: any[] = [];
        if (Array.isArray(resAnnouncements?.data)) {
          dataArray = resAnnouncements.data;
        } else if (Array.isArray(resAnnouncements?.data?.announcements)) {
          dataArray = resAnnouncements.data.announcements;
        } else if (Array.isArray(resAnnouncements?.data?.data)) {
          dataArray = resAnnouncements.data.data;
        }

        if (dataArray.length > 0) {
          fetchedAnnouncements = dataArray.map((a: any, idx: number) => ({
            id: String(a.id || `ann_${idx}`),
            title: a.title || 'Company Announcement',
            description: a.description || a.message || a.content || a.body || '',
            datePosted: a.datePosted || (a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Recent'),
            priority: a.priority || 'General',
            author: a.author || (a.target_audience ? `Audience: ${a.target_audience}` : 'HR Management')
          }));
        }
      } catch (err: any) {
        console.warn("Backend /v1/announcements notice:", err.message);
      }

      setAnnouncements(fetchedAnnouncements);
    } catch (err: any) {
      console.warn("Dashboard feed error:", err.message);
    } finally {
      setLoadingData(false);
    }
  };

  // Real-time Dynamic Telemetry State (GPS & Network)
  const [gpsStatus, setGpsStatus] = useState<'VERIFIED' | 'DISABLED'>('VERIFIED');
  const [networkStatus, setNetworkStatus] = useState<'ACTIVE' | 'OFFLINE'>('ACTIVE');

  const checkTelemetryStatus = useCallback(async () => {
    try {
      // 1. GPS / Location Services check
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      const { status: locPerm } = await Location.getForegroundPermissionsAsync();
      if (servicesEnabled && locPerm === 'granted') {
        setGpsStatus('VERIFIED');
      } else {
        setGpsStatus('DISABLED');
      }

      // 2. Internet Connection check
      const netState = await Network.getNetworkStateAsync();
      if (netState.isConnected && netState.isInternetReachable !== false) {
        setNetworkStatus('ACTIVE');
      } else {
        setNetworkStatus('OFFLINE');
      }
    } catch (err) {
      console.warn('[Telemetry Check Error]', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
      if (refreshUserProfile) {
        refreshUserProfile().catch(() => {});
      }
      checkTelemetryStatus();
      const interval = setInterval(checkTelemetryStatus, 10000);
      return () => clearInterval(interval);
    }, [checkTelemetryStatus, refreshUserProfile])
  );

  const {
    status,
    clockIn,
    clockOut,
    liveTimer,
    selectedWorkType,
    setSelectedWorkType,
    accumulatedSeconds = 0,
    appSettings,
    switchWorkMode,
    isSetupWizardVisible,
    setIsSetupWizardVisible,
    deviceHealthReport,
    checkDeviceHealth,
    refreshData,
    isGpsOffWarning
  } = useAttendance();

  const isClockedIn = status === 'Checked In';

  // Only permanently designated field staff (e.g. FIELD_ONLY role) are restricted to Field without a toggle.
  // Standard office employees can freely toggle between Office Shift and Field Duty at any time.
  const isPermanentFieldPerson = (
    user?.role === 'FIELD_ONLY' || 
    user?.employeeType === 'FIELD' ||
    (Array.isArray(user?.workTypes) && user?.workTypes.length === 1 && user?.workTypes[0].toUpperCase() === 'FIELD')
  );

  const [selectedShift, setSelectedShift] = useState<'OFFICE' | 'FIELD'>('OFFICE');

  useFocusEffect(
    useCallback(() => {
      if (selectedWorkType) {
        setSelectedShift(selectedWorkType.toUpperCase() === 'FIELD' ? 'FIELD' : 'OFFICE');
      } else if (!isPermanentFieldPerson) {
        setSelectedShift('OFFICE');
        setSelectedWorkType('OFFICE');
      }
    }, [selectedWorkType, isPermanentFieldPerson])
  );

  const handleShiftSelect = async (shift: 'OFFICE' | 'FIELD') => {
    if (shift === selectedShift) return;
    Vibration.vibrate(50);
    setSelectedShift(shift);
    setSelectedWorkType(shift);

    try {
      await switchWorkMode(shift === 'FIELD' ? 'field' : 'office');
    } catch (err: any) {
      console.warn("Failed to synchronize shift change:", err.message);
    }
  };

  const currentWorkMode = selectedShift;

  const handleClockToggle = async () => {
    try {
      setClockLoading(true);
      if (isClockedIn) {
        // clockOut automatically removes geofence restrictions when in Field Duty
        await clockOut();
        setClockLoading(false);
      } else {
        if (Platform.OS !== 'web') {
          // 1. Check GPS enabled
          const hasGps = await Location.hasServicesEnabledAsync().catch(() => true);
          if (!hasGps) {
            setClockLoading(false);
            Alert.alert(
              "Enable GPS",
              "Please turn on Location / GPS services on your device to clock in.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Settings", onPress: () => Linking.openSettings() }
              ]
            );
            return;
          }

          // 2. Standard Foreground Permission Request
          let { status: fgStatus } = await Location.getForegroundPermissionsAsync();
          if (fgStatus !== 'granted') {
            const reqRes = await Location.requestForegroundPermissionsAsync();
            fgStatus = reqRes.status;
          }

          if (fgStatus !== 'granted') {
            setClockLoading(false);
            Alert.alert(
              "Location Permission Required",
              "Location permission is needed to record attendance. Please allow location access in settings.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() }
              ]
            );
            return;
          }

          // Request background location silently in background without blocking
          Location.getBackgroundPermissionsAsync().then(async bgRes => {
            if (bgRes.status !== 'granted') {
              await Location.requestBackgroundPermissionsAsync().catch(() => {});
            }
          }).catch(() => {});
        }

        const shiftToSet = currentWorkMode === 'FIELD' ? 'FIELD' : 'OFFICE';
        await clockIn(shiftToSet);
        setClockLoading(false);
      }
    } catch (err: any) {
      console.warn("[Clock Toggle Error]", err.message);
      setClockLoading(false);
    }
  };

  const shiftStartTime = appSettings?.punch_in_start || '09:00 AM';
  const shiftEndTime = appSettings?.punch_out_time || '05:30 PM';
  const shiftDurationSecs = 8.5 * 3600;
  const progressPercent = isClockedIn 
    ? Math.min(100, Math.round(((accumulatedSeconds || 0) / shiftDurationSecs) * 100)) 
    : 0;

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}>
      {/* Interactive Profile Header */}
      <Header />

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 56 + insets.bottom + 24 }]}
      >
        {/* GPS Off Warning Alert Banner */}
        {isClockedIn && isGpsOffWarning && (
          <View style={{
            backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
            borderColor: '#F87171',
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12
          }}>
            <Ionicons name="warning" size={24} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FCA5A5' : '#991B1B' }}>
                GPS / Location Turned OFF
              </Text>
              <Text style={{ fontSize: 11, color: isDark ? '#F87171' : '#B91C1C', marginTop: 2 }}>
                Shift attendance tracking is paused. Please enable your phone GPS immediately to avoid attendance loss.
              </Text>
            </View>
          </View>
        )}

        {/* Sleek Segmented Work Mode Control for Office Employees - Toggle Office vs Field Duty */}
        {!isPermanentFieldPerson && (
          <View style={[styles.segmentedControlContainer, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
            <TouchableOpacity
              style={[
                styles.segmentBtn, 
                currentWorkMode === 'OFFICE' && (isDark ? { backgroundColor: '#38BDF8' } : styles.segmentBtnActive)
              ]}
              onPress={() => handleShiftSelect('OFFICE')}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.segmentText,
                isDark && { color: '#94A3B8' },
                currentWorkMode === 'OFFICE' && (isDark ? { color: '#0F172A', fontWeight: '800' } : styles.segmentTextActive)
              ]}>
                🏢 Office Shift
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentBtn, 
                currentWorkMode === 'FIELD' && (isDark ? { backgroundColor: '#38BDF8' } : styles.segmentBtnActive)
              ]}
              onPress={() => handleShiftSelect('FIELD')}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.segmentText,
                isDark && { color: '#94A3B8' },
                currentWorkMode === 'FIELD' && (isDark ? { color: '#0F172A', fontWeight: '800' } : styles.segmentTextActive)
              ]}>
                📍 Field Duty
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Glossy Black Hero Shift Tracking Card with Pure White Font */}
        <View style={[styles.glossyBlackHeroCard, isClockedIn && styles.glossyBlackHeroCardClockedIn]}>
          {/* Card Header Row */}
          <View style={styles.heroHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroSubText}>
                {currentWorkMode === 'FIELD' ? 'Shift Schedule • Field Duty (Geofence Disabled)' : 'Shift Schedule • Office Geofenced'}
              </Text>
              <Text style={styles.heroTitleText}>General Shift • {shiftStartTime} - {shiftEndTime}</Text>
            </View>

            <View style={[styles.statusBadge, isClockedIn ? styles.statusBadgeEmerald : styles.statusBadgeDark]}>
              <View style={[styles.statusDot, isClockedIn && styles.statusDotEmerald]} />
              <Text style={[styles.statusBadgeText, isClockedIn ? { color: '#059669' } : { color: '#94A3B8' }]}>
                {isClockedIn ? (currentWorkMode === 'FIELD' ? 'FIELD IN' : 'CHECKED IN') : 'OFF DUTY'}
              </Text>
            </View>
          </View>

          {/* Worked Time & Estimated Checkout */}
          <View style={styles.timerContainer}>
            <View style={{ flex: 1 }}>
              <Text style={styles.timerLabel}>Worked Time Today</Text>
              <Text style={styles.timerDisplay}>
                {isClockedIn ? liveTimer : '00:00:00'}
              </Text>
            </View>

            <View style={styles.progressRingBadge}>
              <Text style={styles.progressRingText}>{progressPercent}%</Text>
            </View>
          </View>

          <Text style={styles.checkoutHintText}>
            Expected Shift Completion: <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{shiftEndTime}</Text>
          </Text>

          {/* Action Clock In / Clock Out Button */}
          <TouchableOpacity
            style={[styles.clockButton, isClockedIn ? styles.clockButtonRose : styles.clockButtonEmerald]}
            onPress={handleClockToggle}
            activeOpacity={0.85}
            disabled={clockLoading}
          >
            {clockLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name={isClockedIn ? "stop-circle-outline" : "play-circle-outline"} size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.clockButtonText}>
                  {isClockedIn ? 'Clock Out Shift' : 'Clock In Now'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Dynamic Telemetry Strip */}
        <View style={[styles.telemetryStrip, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
          <View style={styles.telemetryItem}>
            <Ionicons
              name="location-outline"
              size={14}
              color={gpsStatus === 'VERIFIED' ? "#10B981" : "#F43F5E"}
            />
            <Text style={[styles.telemetryText, isDark && { color: '#F8FAFC' }, gpsStatus !== 'VERIFIED' && { color: '#F43F5E' }]}>
              {gpsStatus === 'VERIFIED' ? 'GPS Verified' : 'GPS Disabled'}
            </Text>
          </View>
          <Text style={[styles.telemetryDot, isDark && { color: '#475569' }]}>•</Text>

          <View style={styles.telemetryItem}>
            <Ionicons
              name={networkStatus === 'ACTIVE' ? "wifi-outline" : "cloud-offline-outline"}
              size={14}
              color={networkStatus === 'ACTIVE' ? "#10B981" : "#F43F5E"}
            />
            <Text style={[styles.telemetryText, isDark && { color: '#F8FAFC' }, networkStatus !== 'ACTIVE' && { color: '#F43F5E' }]}>
              {networkStatus === 'ACTIVE' ? 'Internet Active' : 'No Internet'}
            </Text>
          </View>
          <Text style={[styles.telemetryDot, isDark && { color: '#475569' }]}>•</Text>

          <View style={styles.telemetryItem}>
            <Ionicons
              name={networkStatus === 'ACTIVE' && gpsStatus === 'VERIFIED' ? "sync-outline" : "warning-outline"}
              size={14}
              color={networkStatus === 'ACTIVE' && gpsStatus === 'VERIFIED' ? "#10B981" : "#F59E0B"}
            />
            <Text style={[styles.telemetryText, isDark && { color: '#F8FAFC' }, (networkStatus !== 'ACTIVE' || gpsStatus !== 'VERIFIED') && { color: '#F59E0B' }]}>
              {networkStatus === 'ACTIVE' && gpsStatus === 'VERIFIED' ? 'Auto Sync OK' : 'Sync Pending'}
            </Text>
          </View>
        </View>

        {/* DYNAMIC SECTION 1: UPCOMING HOLIDAYS */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={[styles.sectionTitle, isDark && { color: '#F8FAFC' }]}>Upcoming Holidays</Text>
            {calendarInfo ? (
              <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B', marginTop: 1 }}>
                📍 {calendarInfo.name}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => setIsHolidayModalVisible(true)} activeOpacity={0.7}>
            <Text style={[styles.sectionActionText, isDark && { color: '#38BDF8' }]}>View Calendar</Text>
          </TouchableOpacity>
        </View>

        {(() => {
          const upcomingHolidays = holidays
            .filter((h) => h.diffDays !== undefined && h.diffDays >= 0)
            .sort((a, b) => (a.diffDays ?? 0) - (b.diffDays ?? 0));

          if (loadingData) {
            return (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={isDark ? '#38BDF8' : '#0F172A'} />
              </View>
            );
          }

          if (upcomingHolidays.length === 0) {
            return (
              <View style={[styles.emptyCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                <Text style={[styles.emptyText, isDark && { color: '#94A3B8' }]}>No upcoming holidays scheduled.</Text>
              </View>
            );
          }

          return (
            <View style={styles.listStack}>
              {upcomingHolidays.slice(0, 3).map((holiday) => {
                const title = holiday.title || holiday.name || 'Holiday';
                const dateDisplay = holiday.dateFormatted || holiday.date;
                const typeUpper = (holiday.type || '').toUpperCase();
                const isNational = typeUpper.includes('NATIONAL');
                const isFestival = typeUpper.includes('FESTIVAL');
                const isState = typeUpper.includes('STATE') || typeUpper.includes('REGIONAL');

                return (
                  <View key={holiday.id} style={[styles.holidayCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                    <View style={[styles.holidayIconBox, isDark && { backgroundColor: '#0F172A' }]}>
                      <Ionicons name="calendar-clear-outline" size={20} color={isDark ? '#38BDF8' : '#0F172A'} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.holidayName, isDark && { color: '#F8FAFC' }]} numberOfLines={1}>{title}</Text>
                      <Text style={[styles.holidayDate, isDark && { color: '#94A3B8' }]}>
                        {dateDisplay}{holiday.day ? ` • ${holiday.day}` : ''}
                      </Text>
                    </View>
                    {holiday.countdown ? (
                      <View style={[
                        styles.tagBadge,
                        holiday.countdown.includes('Today') ? styles.tagToday :
                        isNational ? styles.tagNational : isFestival ? styles.tagFestival : isState ? styles.tagRegional : styles.tagFloating,
                        isDark && { backgroundColor: '#0F172A' }
                      ]}>
                        <Text style={[
                          styles.tagBadgeText,
                          holiday.countdown.includes('Today') ? { color: '#10B981' } : (isDark ? { color: '#38BDF8' } : {})
                        ]}>
                          {holiday.countdown}
                        </Text>
                      </View>
                    ) : (
                      <View style={[
                        styles.tagBadge,
                        isNational ? styles.tagNational : isFestival ? styles.tagFestival : isState ? styles.tagRegional : styles.tagFloating,
                        isDark && { backgroundColor: '#0F172A' }
                      ]}>
                        <Text style={[styles.tagBadgeText, isDark && { color: '#38BDF8' }]}>{holiday.type}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* DYNAMIC SECTION 2: ANNOUNCEMENTS */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, isDark && { color: '#F8FAFC' }]}>Company Announcements</Text>
          <TouchableOpacity onPress={() => setIsAnnouncementModalVisible(true)} activeOpacity={0.7}>
            <Text style={[styles.sectionActionText, isDark && { color: '#38BDF8' }]}>View All</Text>
          </TouchableOpacity>
        </View>

        {loadingData ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={isDark ? '#38BDF8' : '#0F172A'} />
          </View>
        ) : announcements.length === 0 ? (
          <View style={[styles.emptyCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
            <Text style={[styles.emptyText, isDark && { color: '#94A3B8' }]}>No active announcements posted.</Text>
          </View>
        ) : (
          <View style={styles.listStack}>
            {announcements.slice(0, 3).map((item) => {
              const priUpper = (item.priority || '').toUpperCase();
              const isUrgent = priUpper.includes('URGENT') || priUpper.includes('HIGH');
              const isPolicy = priUpper.includes('POLICY');

              return (
                <View key={item.id} style={[styles.announcementCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                  <View style={styles.announcementTopRow}>
                    <View style={[
                      styles.priorityBadge,
                      isUrgent 
                        ? (isDark ? { backgroundColor: '#4C0519' } : { backgroundColor: '#FFE4E6' }) 
                        : isPolicy 
                        ? (isDark ? { backgroundColor: '#1E1B4B' } : { backgroundColor: '#EEF2FF' }) 
                        : (isDark ? { backgroundColor: '#451A03' } : { backgroundColor: '#FEF3C7' })
                    ]}>
                      <Text style={[
                        styles.priorityText,
                        isUrgent 
                          ? (isDark ? { color: '#FB7185' } : { color: '#E11D48' }) 
                          : isPolicy 
                          ? (isDark ? { color: '#818CF8' } : { color: '#4F46E5' }) 
                          : (isDark ? { color: '#FBBF24' } : { color: '#D97706' })
                      ]}>
                        {(item.priority || 'General').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.datePostedText, isDark && { color: '#64748B' }]}>{item.datePosted}</Text>
                  </View>

                  <Text style={[styles.announcementTitle, isDark && { color: '#F8FAFC' }]}>{item.title}</Text>
                  <Text style={[styles.announcementDesc, isDark && { color: '#94A3B8' }]}>{item.description}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Work Type Selector Modal */}
      <WorkTypeSelectorModal
        visible={isWorkTypeModalVisible}
        workTypes={user?.workTypes || ['OFFICE', 'FIELD', 'REMOTE']}
        onClose={() => setIsWorkTypeModalVisible(false)}
        onSelect={(type) => {
          setIsWorkTypeModalVisible(false);
          clockIn(type);
        }}
      />

      {/* Holiday Calendar View Modal */}
      <HolidayCalendarModal
        visible={isHolidayModalVisible}
        onClose={() => setIsHolidayModalVisible(false)}
        holidays={holidays}
        calendar={calendarInfo}
      />

      {/* All Company Announcements View Modal */}
      <AnnouncementsModal
        visible={isAnnouncementModalVisible}
        onClose={() => setIsAnnouncementModalVisible(false)}
        announcements={announcements}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 160, // Full clearance for floating bottom dock & gesture bar
  },
  segmentedControlContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#0F172A',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  glossyBlackHeroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 5,
  },
  glossyBlackHeroCardClockedIn: {
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroSubText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeDark: {
    backgroundColor: '#1E293B',
  },
  statusBadgeEmerald: {
    backgroundColor: '#064E3B',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748B',
    marginRight: 6,
  },
  statusDotEmerald: {
    backgroundColor: '#10B981',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  timerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  timerDisplay: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  progressRingBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressRingText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '900',
  },
  checkoutHintText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 18,
  },
  clockButton: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  clockButtonEmerald: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  clockButtonRose: {
    backgroundColor: '#F43F5E',
    shadowColor: '#F43F5E',
  },
  clockButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  telemetryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  telemetryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  telemetryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  telemetryDot: {
    color: '#CBD5E1',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  listStack: {
    gap: 10,
  },
  holidayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  holidayIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holidayName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  holidayDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagNational: {
    backgroundColor: '#E0F2FE',
  },
  tagFestival: {
    backgroundColor: '#FEF3C7',
  },
  tagFloating: {
    backgroundColor: '#F1F5F9',
  },
  tagRegional: {
    backgroundColor: '#F3E8FF',
  },
  tagToday: {
    backgroundColor: '#DCFCE7',
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  announcementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  announcementTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priorityBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  datePostedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  announcementDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  loadingBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
  },
});