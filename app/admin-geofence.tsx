import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import api from '@/services/api';
import { API_BASE_URL } from '@/constants/API';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LeafletMap } from '@/components/LeafletMap';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

export default function AdminGeofenceScreen() {
  const router = useRouter();
  const { t } = useTranslationSafe(['tracking', 'common', 'permissions']);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('100');

  const fetchGeofences = async () => {
    try {
      setLoading(true);
      const res = await api.get('/geofence');
      if (Array.isArray(res.data)) {
        setGeofences(res.data);
      }
    } catch (err: any) {
      console.error("Failed to fetch geofences:", err.message);
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        Alert.alert(t('common:warning', { defaultValue: 'Timeout' }), t('common:timeout_msg', { defaultValue: 'Request timed out after 60 seconds.' }));
      } else {
        Alert.alert(t('common:error', { defaultValue: 'Error' }), t('tracking:err_load_geofence', { defaultValue: 'Could not load geofence configurations.' }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGeofences();
  }, []);

  const handleGetCurrentLocation = async () => {
    try {
      setFetchingLocation(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissions:denied_title', { defaultValue: 'Permission Denied' }), t('permissions:location_required', { defaultValue: 'Location permissions are required to fetch current coordinates.' }));
        setFetchingLocation(false);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert(t('permissions:gps_off_title', { defaultValue: 'Location Services Off' }), t('permissions:enable_gps', { defaultValue: 'Please enable GPS/location services on your device.' }));
        setFetchingLocation(false);
        return;
      }

      let loc;
      try {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      } catch (err) {
        console.warn("High accuracy query failed, trying balanced:", err);
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }

      setLatitude(String(loc.coords.latitude));
      setLongitude(String(loc.coords.longitude));
      Alert.alert(t('common:success', { defaultValue: 'Location Resolved' }), t('tracking:location_set_success', { defaultValue: "Successfully set coordinates to your device's current location." }));
    } catch (err: any) {
      console.error("Fetch current location error:", err.message);
      if (Platform.OS === 'web') {
        try {
          const pos = await new Promise<any>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
          });
          setLatitude(String(pos.coords.latitude));
          setLongitude(String(pos.coords.longitude));
          Alert.alert(t('common:success', { defaultValue: 'Location Resolved' }), t('tracking:browser_location_success', { defaultValue: "Successfully set coordinates to browser location." }));
        } catch (webGeoErr) {
          Alert.alert(t('common:error', { defaultValue: 'Error' }), t('tracking:err_determine_loc', { defaultValue: 'Could not determine current location coordinates.' }));
        }
      } else {
        Alert.alert(t('common:error', { defaultValue: 'Error' }), t('tracking:err_determine_loc', { defaultValue: 'Could not determine current location coordinates.' }));
      }
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleAddGeofence = async () => {
    const latNum = Number(latitude);
    const lonNum = Number(longitude);
    const radNum = Number(radius);
    const gfName = name.trim();

    if (!gfName) {
      Alert.alert(t('common:error', { defaultValue: 'Validation Error' }), t('tracking:val_gf_name', { defaultValue: 'Please provide a name for the geofence.' }));
      return;
    }

    if (isNaN(latNum) || isNaN(lonNum) || isNaN(radNum)) {
      Alert.alert(t('common:error', { defaultValue: 'Validation Error' }), t('tracking:val_coords_numeric', { defaultValue: 'Coordinates and radius must be valid numeric values.' }));
      return;
    }

    if (radNum <= 0) {
      Alert.alert(t('common:error', { defaultValue: 'Validation Error' }), t('tracking:val_radius_positive', { defaultValue: 'Radius must be a positive number of meters.' }));
      return;
    }

    try {
      setSaving(true);
      await api.post('/geofence', {
        name: gfName,
        latitude: latNum,
        longitude: lonNum,
        radius: radNum
      });
      
      Alert.alert(t('common:success', { defaultValue: 'Success' }), t('tracking:gf_added_success', { defaultValue: 'New geofence added successfully.' }));
      setName('');
      setLatitude('');
      setLongitude('');
      setRadius('100');
      await fetchGeofences();
    } catch (err: any) {
      console.error("Save geofence error:", err.message);
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        Alert.alert(t('common:warning', { defaultValue: 'Timeout' }), t('common:timeout_msg', { defaultValue: 'Request timed out after 60 seconds.' }));
      } else {
        Alert.alert(t('common:error', { defaultValue: 'Save Error' }), t('tracking:save_gf_failed', { defaultValue: 'Could not create geofence boundary.' }));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGeofence = async (id: number, gfName: string) => {
    Alert.alert(
      t('common:confirm', { defaultValue: 'Confirm Delete' }),
      t('tracking:confirm_delete_gf', { defaultValue: `Are you sure you want to delete geofence "${gfName}"?` }),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: "cancel" },
        { 
          text: t('common:delete', { defaultValue: 'Delete' }), 
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await api.delete(`/geofence/${id}`);
              Alert.alert(t('common:success', { defaultValue: 'Deleted' }), t('tracking:gf_deleted_success', { defaultValue: 'Geofence removed successfully.' }));
              await fetchGeofences();
            } catch (err: any) {
              console.error("Delete geofence error:", err.message);
              if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                Alert.alert(t('common:warning', { defaultValue: 'Timeout' }), t('common:timeout_msg', { defaultValue: 'Request timed out after 60 seconds.' }));
              } else {
                Alert.alert(t('common:error', { defaultValue: 'Delete Error' }), t('tracking:delete_gf_failed', { defaultValue: 'Could not remove geofence.' }));
              }
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: Platform.OS === 'ios' ? 50 : 20 }}>
      <View className="flex-row items-center px-6 py-4.5 bg-white border-b border-border">
        <TouchableOpacity className="w-10 h-10 rounded-xl bg-background items-center justify-center mr-4" onPress={() => router.back()}>
          <IconSymbol name="chevron.left" color="#0f172a" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-text-main tracking-tight">{t('tracking:geofence_title', { defaultValue: 'Geofence Settings' })}</Text>
          <Text className="text-xs text-text-muted font-medium mt-0.5">{t('tracking:geofence_subtitle', { defaultValue: 'Configure check-in boundaries' })}</Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="p-5" showsVerticalScrollIndicator={false}>
        <View className="flex-row bg-indigo-50/50 rounded-2xl p-4.5 border border-indigo-100 mb-6 items-center">
          <View className="w-11 h-11 rounded-xl bg-indigo-100 items-center justify-center mr-3.5">
            <IconSymbol name="location.fill" color="#4f46e5" size={22} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-indigo-900 mb-1 tracking-tight">{t('tracking:policy_header', { defaultValue: 'Multi-Geofence Policy' })}</Text>
            <Text className="text-xs text-indigo-700 leading-4.5 font-medium">
              {t('tracking:policy_desc', { defaultValue: 'Add multiple office workspaces. Office employees are permitted to check in/out if they are within the boundary of AT LEAST ONE of these geofences.' })}
            </Text>
          </View>
        </View>

        <Card className="mb-6 p-5">
          <Text className="text-sm font-black text-text-main tracking-tight uppercase mb-4">📍 {t('tracking:active_geofences', { defaultValue: 'Active Geofence Areas' })} ({geofences.length})</Text>
          
          {Platform.OS !== 'web' && (
            <View className="h-[200px] w-full rounded-xl overflow-hidden mb-4 border border-border">
              <LeafletMap
                initialRegion={{
                  latitude: geofences.length > 0 ? geofences[0].latitude : 28.6692,
                  longitude: geofences.length > 0 ? geofences[0].longitude : 77.4538,
                  latitudeDelta: 0.1,
                  longitudeDelta: 0.1,
                }}
                onMapPress={(coordinate) => {
                  setLatitude(String(coordinate.latitude));
                  setLongitude(String(coordinate.longitude));
                }}
                circles={geofences.map(gf => ({
                  latitude: gf.latitude,
                  longitude: gf.longitude,
                  radius: gf.radius,
                  color: '#4f46e5'
                }))}
                markers={latitude && longitude && !isNaN(Number(latitude)) && !isNaN(Number(longitude)) ? [{
                  latitude: Number(latitude),
                  longitude: Number(longitude),
                  title: 'New Geofence Marker',
                  color: 'red'
                }] : []}
              />
            </View>
          )}
          
          {loading && geofences.length === 0 ? (
            <ActivityIndicator size="small" color="#0052CC" className="my-5" />
          ) : geofences.length === 0 ? (
            <Text className="text-[13px] text-text-muted italic text-center my-4">{t('tracking:no_geofences', { defaultValue: 'No geofences created yet. Employees will default to Noida Office rules.' })}</Text>
          ) : (
            geofences.map((gf, index) => (
              <View key={gf.id || gf._id} className={`flex-row justify-between items-center py-3 ${index !== geofences.length - 1 ? 'border-b border-border' : ''}`}>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-text-main">{gf.name}</Text>
                  <Text className="text-xs text-text-muted mt-0.5">
                    Lat: {gf.latitude?.toFixed(5)} | Lon: {gf.longitude?.toFixed(5)}
                  </Text>
                  <Text className="text-xs text-primary font-semibold mt-0.5">{t('tracking:radius_label', { defaultValue: 'Radius:' })} {gf.radius} {t('tracking:meters', { defaultValue: 'meters' })}</Text>
                </View>
                <TouchableOpacity 
                  className="w-10 h-10 items-center justify-center rounded-lg bg-red-50" 
                  onPress={() => handleDeleteGeofence(gf.id || gf._id, gf.name)}
                >
                  <IconSymbol name="trash.fill" color="#ef4444" size={20} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </Card>

        <Card className="p-5.5">
          <Text className="text-sm font-black text-text-main uppercase tracking-tight mb-4.5">➕ {t('tracking:add_gf_title', { defaultValue: 'Add New Office Geofence' })}</Text>
          
          <View className="mb-4">
            <Text className="text-[11px] font-black text-text-secondary uppercase tracking-wider mb-1.5">{t('tracking:gf_name_label', { defaultValue: 'Geofence Name' })}</Text>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="e.g. Noida Office / Delhi Site"
            />
          </View>

          <View className="mb-4">
            <Text className="text-[11px] font-black text-text-secondary uppercase tracking-wider mb-1.5">{t('tracking:lat_label', { defaultValue: 'Latitude Coordinate' })}</Text>
            <Input
              value={latitude}
              onChangeText={setLatitude}
              placeholder="e.g. 28.6692"
              keyboardType="numeric"
            />
          </View>

          <View className="mb-4">
            <Text className="text-[11px] font-black text-text-secondary uppercase tracking-wider mb-1.5">{t('tracking:lon_label', { defaultValue: 'Longitude Coordinate' })}</Text>
            <Input
              value={longitude}
              onChangeText={setLongitude}
              placeholder="e.g. 77.4538"
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity 
            className={`flex-row items-center justify-center py-3 rounded-xl border border-indigo-200 bg-indigo-50/50 mb-1 ${fetchingLocation ? 'opacity-60' : ''}`} 
            onPress={handleGetCurrentLocation}
            disabled={fetchingLocation}
            activeOpacity={0.8}
          >
            {fetchingLocation ? (
              <ActivityIndicator size="small" color="#4f46e5" />
            ) : (
              <Text className="text-[13px] font-black text-indigo-600">🎯 {t('tracking:sync_gps', { defaultValue: 'Sync Coordinates With GPS' })}</Text>
            )}
          </TouchableOpacity>

          <View className="h-px bg-border my-5" />

          <View className="mb-5">
            <Text className="text-[11px] font-black text-text-secondary uppercase tracking-wider mb-1.5">{t('tracking:radius_input_label', { defaultValue: 'Geofence Radius (Meters)' })}</Text>
            <Input
              value={radius}
              onChangeText={setRadius}
              placeholder="e.g. 100"
              keyboardType="numeric"
            />
          </View>

          <Button 
            variant="primary" 
            className={`py-3.5 ${saving ? 'opacity-60' : ''}`} 
            onPress={handleAddGeofence}
            disabled={saving}
          >
            {saving ? t('common:saving', { defaultValue: 'Saving...' }) : `💾 ${t('common:save', { defaultValue: 'Save & Add Geofence' })}`}
          </Button>
        </Card>
      </ScrollView>
    </View>
  );
}
