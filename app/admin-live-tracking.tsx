import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LeafletMap } from '../components/LeafletMap';
import api from '@/services/api';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from "@/constants/API";
import { WORLD_REGION } from '@/constants/map';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AdminLiveTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useTranslationSafe(['tracking', 'common']);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const firstLocation: any = locations.find(
    (loc: any) => typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
  );

  const fetchLocations = async () => {
    try {
      const response = await api.get('/footprints/live');
      if (response.data) {
        setLocations(response.data);
      }
    } catch (error: any) {
      console.log('Error fetching live locations:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View className="flex-1 bg-background">
      <View 
        className="flex-row items-center px-6 bg-white border-b border-border z-10"
        style={{ paddingTop: Math.max(insets.top + 6, 16), paddingBottom: 14 }}
      >
        <TouchableOpacity className="w-10 h-10 rounded-xl bg-background items-center justify-center mr-4" onPress={() => router.back()}>
          <IconSymbol name="chevron.left" color="#0f172a" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-text-main tracking-tight">{t('tracking:live_title', { defaultValue: 'Live Tracking' })}</Text>
          <Text className="text-xs text-text-muted font-medium mt-0.5">{t('tracking:live_subtitle', { defaultValue: 'Real-time employee locations' })}</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#0052CC" />
          <Text className="text-sm font-semibold text-text-muted mt-3">{t('common:loading', { defaultValue: 'Loading Live Tracking...' })}</Text>
        </View>
      ) : (
        <View className="flex-1 relative">
          <LeafletMap
            initialRegion={firstLocation ? {
              latitude: firstLocation.latitude,
              longitude: firstLocation.longitude,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            } : WORLD_REGION}
            markers={locations.map((loc: any) => ({
              latitude: loc.latitude,
              longitude: loc.longitude,
              title: loc.userName || loc.userId,
              color: loc.speed > 0 ? 'blue' : 'orange'
            }))}
          />
        </View>
      )}
    </View>
  );
}
