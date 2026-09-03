// constants/UserRoles.ts
export type UserRole = 'OFFICE' | 'FIELD';

export const USER_CONFIG = {
  role: 'FIELD' as UserRole,
  officeLocation: { lat: 28.6692, lon: 77.4538 },
  geofenceRadius: 100,
  sites: [
    { name: "My Test Site", lat: 28.6692, lon: 77.4538, radius: 50 }, // Set to your current location
  ],
};