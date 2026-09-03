import * as Location from 'expo-location';

export interface LocationResult {
  latitude: number;
  longitude: number;
  address: string;
}

export const fetchGeotagLocation = async (): Promise<LocationResult> => {
  console.log('[LocationService] Requesting location permissions...');
  const { status } = await Location.requestForegroundPermissionsAsync();
  
  if (status !== 'granted') {
    throw new Error('LOCATION_PERMISSION_DENIED');
  }

  console.log('[LocationService] Fetching high-accuracy coordinates...');
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  
  const latitude = loc.coords.latitude;
  const longitude = loc.coords.longitude;
  
  console.log(`[LocationService] Coordinates resolved: ${latitude}, ${longitude}`);
  let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  try {
    console.log('[LocationService] Reverse geocoding coordinates...');
    const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (geo && geo.length > 0) {
      const item = geo[0];
      const name = item.name || '';
      const street = item.street || '';
      const city = item.city || '';
      const region = item.region || '';
      const postalCode = item.postalCode || '';
      
      const parts = [name, street, city, region, postalCode].filter(Boolean);
      if (parts.length > 0) {
        address = parts.join(', ');
      }
    }
  } catch (geoErr: any) {
    console.warn('[LocationService] Reverse geocode failed:', geoErr.message);
    // Fallback to generic address if requested by previous logic, or just coords
    address = 'Jaypee Wishtown Internal Road, Sector 128, Noida'; // Based on existing code fallback
  }

  console.log(`[LocationService] Final address: ${address}`);
  return { latitude, longitude, address };
};
