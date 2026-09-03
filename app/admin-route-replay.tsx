import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LeafletMap } from '../components/LeafletMap';
import api from '@/services/api';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from "@/constants/API";
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

export default function AdminRouteReplayScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslationSafe(['tracking', 'common']);
  const { userId, date } = useLocalSearchParams();
  const [footprints, setFootprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchHistory = async () => {
    try {
      const uId = userId || user?.id || 'employee';
      const fetchDate = date || new Date().toISOString().split('T')[0];
      const response = await api.get(`${API_BASE_URL}/footprints/history?userId=${uId}&date=${fetchDate}`);
      if (response.data) {
        setFootprints(response.data);
      }
    } catch (error: any) {
      console.log('Error fetching history:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId, date]);

  useEffect(() => {
    let interval: any;
    if (isPlaying && currentIndex < footprints.length - 1) {
      const speed = Math.max(20, 2500 / Math.max(1, footprints.length));
      interval = setInterval(() => {
        setCurrentIndex(prev => prev + 1);
      }, speed);
    } else if (currentIndex >= footprints.length - 1) {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, footprints.length]);

  const coordinates = footprints.slice(0, currentIndex + 1).map((f: any) => ({ latitude: f.latitude, longitude: f.longitude }));
  const currentFootprint: any = footprints[currentIndex];
  
  const allCoords = footprints.map((f: any) => ({ latitude: f.latitude, longitude: f.longitude }));

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: Platform.OS === 'ios' ? 50 : 20 }}>
      <View className="flex-row items-center px-6 py-4.5 bg-white border-b border-border z-10">
        <TouchableOpacity className="w-10 h-10 rounded-xl bg-background items-center justify-center mr-4" onPress={() => router.back()}>
          <IconSymbol name="chevron.left" color="#0f172a" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-text-main tracking-tight">{t('tracking:replay_title', { defaultValue: 'Route Replay' })}</Text>
          <Text className="text-xs text-text-muted font-medium mt-0.5">{t('tracking:replay_subtitle', { defaultValue: 'Historical employee movement' })}</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#0052CC" />
          <Text className="text-sm font-semibold text-text-muted mt-3">{t('common:loading', { defaultValue: 'Loading Route History...' })}</Text>
        </View>
      ) : (
        <View className="flex-1 relative">
          <LeafletMap
            initialRegion={allCoords.length > 0 ? {
              latitude: allCoords[0].latitude,
              longitude: allCoords[0].longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            } : {
              latitude: 28.6692,
              longitude: 77.4538,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            }}
            polylines={coordinates.length > 0 ? [{ points: coordinates, color: '#0052CC', weight: 4 }] : []}
            markers={[
              ...footprints.slice(0, currentIndex + 1).map((f: any, index) => ({
                latitude: f.latitude,
                longitude: f.longitude,
                title: `Footprint ${index + 1}`,
                emoji: '👣'
              })),
              ...(currentFootprint ? [{
                latitude: currentFootprint.latitude,
                longitude: currentFootprint.longitude,
                title: 'Current Location',
                emoji: '📍'
              }] : [])
            ]}
          />

          {coordinates.length > 0 && (
            <View className="absolute bottom-8 self-center bg-white p-4 rounded-xl border border-border shadow-lg shadow-black/10 items-center w-4/5">
              <Text className="text-base font-black text-text-main mb-3">
                {currentFootprint ? new Date(parseInt(currentFootprint.timestamp)).toLocaleTimeString() : 'N/A'}
              </Text>
              <TouchableOpacity 
                className={`py-2.5 px-6 rounded-lg w-full items-center ${isPlaying ? 'bg-orange-50 border border-orange-200' : 'bg-primary'}`} 
                onPress={() => setIsPlaying(!isPlaying)}
              >
                <Text className={`font-bold text-sm ${isPlaying ? 'text-orange-600' : 'text-white'}`}>
                  {isPlaying ? t('tracking:pause_replay', { defaultValue: 'Pause' }) : t('tracking:play_replay', { defaultValue: 'Play Replay' })}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
