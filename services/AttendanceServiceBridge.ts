import { NativeModules, Platform } from 'react-native';

const { AttendanceServiceModule } = NativeModules;

export interface AttendanceServiceType {
  startAttendanceService(userId: string, token: string, targetUrl: string, workType: string): Promise<boolean>;
  stopAttendanceService(): Promise<boolean>;
}

// Fallback for non-Android platforms
const AttendanceServiceBridgeFallback: AttendanceServiceType = {
  startAttendanceService: async () => true,
  stopAttendanceService: async () => true,
};

const AttendanceServiceBridge: AttendanceServiceType = (Platform.OS === 'android' && AttendanceServiceModule)
  ? (AttendanceServiceModule as AttendanceServiceType) 
  : AttendanceServiceBridgeFallback;

export default AttendanceServiceBridge;
