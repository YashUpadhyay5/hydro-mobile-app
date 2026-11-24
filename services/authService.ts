import api from './api';
import { setSecureItem, deleteSecureItem } from '@/utils/storage';
import { fetchAppSettings } from './settingsService';
import { disableAttendanceReminders } from './AttendanceReminderService';

export const loginUser = async (credentials: { email: string, password: string }) => {
  const cleanEmail = credentials.email.trim().toLowerCase();
  const cleanPassword = credentials.password.trim();

  try {
    const response = await api.post('/auth/login', { email: cleanEmail, password: cleanPassword });
    const userProfile = {
      ...response.data.user,
      token: response.data.token
    };
    await setSecureItem('userToken', response.data.token);
    await setSecureItem('userProfile', JSON.stringify(userProfile));

    // Fetch and store latest application settings on login
    await fetchAppSettings().catch(err => console.warn("[Login] Settings fetch warning:", err.message));

    return userProfile;
  } catch (err: any) {
    // If the server explicitly rejected the credentials with 400 or 401, throw to show exact message
    if (err.response && (err.response.status === 400 || err.response.status === 401)) {
      throw err;
    }
    // Backend is unreachable — surface the error clearly instead of falling back to mock users
    console.error("[Login] Backend unreachable:", err.message);
    const networkError: any = new Error(
      'Unable to connect to the server. Please check your internet connection and try again.'
    );
    networkError.isNetworkError = true;
    throw networkError;
  }
};

export const logoutUser = async () => {
  // A signed-out device must not keep ringing reminders for the previous user.
  disableAttendanceReminders();
  await deleteSecureItem('userToken');
  await deleteSecureItem('userProfile');
};