import React, { useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, Platform } from 'react-native';
import { USER_CONFIG } from "@/constants/UserRoles";
import { LeafletMap } from './LeafletMap';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

const parseDateString = (str: string): { year: number, month: number, day: number } | null => {
  if (!str) return null;
  // Match YYYY-MM-DD
  let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) };
  }
  // Match M/D/YYYY or D/M/YYYY
  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const p1 = parseInt(match[1]);
    const p2 = parseInt(match[2]);
    const y = parseInt(match[3]);
    if (p1 > 12) {
      return { year: y, month: p2, day: p1 };
    } else {
      return { year: y, month: p1, day: p2 };
    }
  }
  return null;
};

const formatDateISO = (d: Date) => {
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const matchesDate = (itemDate: string, selectedDate: string) => {
  if (!itemDate || !selectedDate) return false;
  if (itemDate === selectedDate) return true;
  
  const d1 = parseDateString(itemDate);
  const d2 = parseDateString(selectedDate);
  
  if (d1 && d2) {
    return d1.year === d2.year && d1.month === d2.month && d1.day === d2.day;
  }
  return false;
};

export default function AttendanceMap({ 
  history, 
  locationHistory = [], 
  selectedDate 
}: { 
  history: any[], 
  locationHistory?: any[], 
  selectedDate: string 
}) {
  const { t } = useTranslationSafe(['tracking', 'attendance', 'common']);

  const dayRecords = useMemo(() => history.filter(item => {
    const d = item.date || (item.timestamp ? formatDateISO(new Date(Number(item.timestamp))) : undefined);
    return matchesDate(d, selectedDate);
  }), [history, selectedDate]);
  const dayFootprints = useMemo(() => locationHistory.filter(item => {
    const d = item.date || (item.timestamp ? formatDateISO(new Date(Number(item.timestamp))) : undefined);
    return matchesDate(d, selectedDate);
  }), [locationHistory, selectedDate]);
  
  const formattedDate = useMemo(() => {
    try {
      const [year, month, day] = selectedDate.split('-');
      if (year && month && day) {
        const dObj = new Date(Number(year), Number(month) - 1, Number(day));
        return dObj.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch (e) {
      // Fallback
    }
    return selectedDate;
  }, [selectedDate]);

  const validFootprints = useMemo(() => dayFootprints.filter(p => p.latitude !== null && p.longitude !== null), [dayFootprints]);
  const coordinates = validFootprints.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  
  const initialLat = coordinates.length > 0 ? coordinates[0].latitude : (USER_CONFIG.sites[0]?.lat || 28.6692);
  const initialLon = coordinates.length > 0 ? coordinates[0].longitude : (USER_CONFIG.sites[0]?.lon || 77.4538);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📍 {t('tracking:geofence_monitoring', { defaultValue: 'Geofence Monitoring' })} ({formattedDate})</Text>
      
      <View style={styles.mapContainer}>
        <LeafletMap
          initialRegion={{
            latitude: initialLat,
            longitude: initialLon,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          circles={USER_CONFIG.sites.map((site) => ({
            latitude: site.lat,
            longitude: site.lon,
            radius: site.radius,
            color: 'green'
          }))}
          polylines={coordinates.length > 0 ? [{ points: coordinates, color: '#007BFF', weight: 4 }] : []}
          markers={validFootprints.map((p, index) => ({
            latitude: p.latitude,
            longitude: p.longitude,
            title: `${new Date(Number(p.timestamp)).toLocaleTimeString()} - ${p.trackingMethod}`,
            color: index === validFootprints.length - 1 ? 'green' : 'red'
          }))}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionHeader}>{t('tracking:configured_sites', { defaultValue: 'Configured Sites' })} ({USER_CONFIG.sites.length}):</Text>
        {USER_CONFIG.sites.map((site, index) => (
          <Text key={index} style={styles.siteText}>
            • {site.name} ({t('tracking:radius_label', { defaultValue: 'Radius:' })} {site.radius}m)
          </Text>
        ))}
        
        {dayRecords.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { marginTop: 10 }]}>{t('attendance:records_count', { defaultValue: 'Records' })} ({dayRecords.length}):</Text>
            {dayRecords.map((item, index) => (
              <Text key={index} style={styles.recordText}>
                • {item.checkIn || t('attendance:status_checked_in', { defaultValue: 'Checked In' })} - {item.checkOut || t('attendance:status_active', { defaultValue: 'Active' })}
              </Text>
            ))}
          </>
        )}

        {dayFootprints.length > 0 ? (
          <>
            <Text style={[styles.sectionHeader, { marginTop: 10 }]}>{t('tracking:footprints_count', { defaultValue: 'Recorded Footprints' })} ({dayFootprints.length}):</Text>
            <ScrollView style={styles.footprintList} nestedScrollEnabled={true}>
              {[...dayFootprints].reverse().map((point, index) => {
                const isOff = point.trackingMethod === 'UNAVAILABLE' || point.latitude === null || point.longitude === null;
                const isLocationDisabled = point.locationEnabled === false;
                const isGps = point.trackingMethod === 'GPS';
                const isCellular = point.trackingMethod === 'CELLULAR';
                
                let displayText = "";
                if (isOff) {
                  displayText = `⚠️ ${t('tracking:location_unavailable', { defaultValue: 'LOCATION SERVICES UNAVAILABLE' })}`;
                  if (isLocationDisabled) {
                    displayText += ` (${t('tracking:manually_disabled', { defaultValue: 'MANUALLY DISABLED' })})`;
                  }
                } else {
                  const latLngStr = `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
                  const accuracyStr = point.accuracy ? ` (Acc: ${Math.round(point.accuracy)}m)` : '';
                  const rawBat = point.batteryLevel !== undefined && point.batteryLevel !== null ? Number(point.batteryLevel) : NaN;
                  const batteryStr = !isNaN(rawBat) ? ` [🔋 ${Math.round(rawBat > 1 ? rawBat : rawBat * 100)}%]` : '';
                  
                  if (isGps) {
                    displayText = `🛰️ GPS: ${latLngStr}${accuracyStr}${batteryStr}`;
                  } else if (isCellular) {
                    const cellIdStr = point.cellId ? ` Cell ID: ${point.cellId}` : '';
                    const signalStr = point.signalStrength ? ` Sig: ${point.signalStrength}dBm` : '';
                    displayText = `📡 Cellular: ${latLngStr}${accuracyStr}${cellIdStr}${signalStr}${batteryStr}`;
                    if (isLocationDisabled) {
                      displayText += ` ⚠️ (${t('tracking:gps_off', { defaultValue: 'GPS Off' })})`;
                    }
                  } else {
                    displayText = `📍 ${t('tracking:location_label', { defaultValue: 'Location' })}: ${latLngStr}${accuracyStr}${batteryStr}`;
                  }
                  
                  if (point.isMockLocation) {
                    displayText += ` 🚫 ${t('tracking:mocked', { defaultValue: 'MOCKED!' })}`;
                  }
                }
                
                return (
                  <Text key={index} style={[styles.footprintText, (isOff || isLocationDisabled) && styles.warningText]}>
                    • {new Date(Number(point.timestamp)).toLocaleTimeString()}: {displayText}
                  </Text>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <Text style={styles.noRecordText}>{t('tracking:no_footprint_history', { defaultValue: 'No footprint history for' })} {formattedDate}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    height: 550, 
    width: '90%', 
    borderRadius: 15, 
    marginTop: 10, 
    backgroundColor: '#fff', 
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center'
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 8, textAlign: 'center' },
  infoText: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
  mapContainer: {
    height: 200,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  card: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, flex: 1 },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  siteText: { fontSize: 12, color: '#4b5563' },
  recordText: { fontSize: 12, color: '#10b981' },
  noRecordText: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 4 },
  footprintList: { maxHeight: 120, marginTop: 4 },
  footprintText: { fontSize: 11, color: '#4b5563', fontFamily: 'System' },
  warningText: { color: '#dc2626', fontWeight: 'bold' }
});