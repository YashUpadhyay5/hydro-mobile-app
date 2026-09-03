import api from './api';
import { setSecureItem, deleteSecureItem } from '@/utils/storage';
import { fetchAppSettings } from './settingsService';

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
    console.warn("Backend API unreachable or error, checking offline fallback users:", err.message);
    const dummyUsers = [
      { email: "admin@hrms.com", password: "password123", id: "admin", name: "Admin", role: "ADMIN", designation: "OFFICE", workTypes: ["Office"] },
      { email: "employee1@hrms.com", password: "password123", id: "emp1", name: "Aman", role: "EMPLOYEE", designation: "OFFICE", workTypes: ["Office", "Field", "Remote"] },
      { email: "employee2@hrms.com", password: "password123", id: "emp2", name: "Yash", role: "EMPLOYEE", designation: "OFFICE", workTypes: ["Office"] },
      { email: "employee3@hrms.com", password: "password123", id: "emp3", name: "Rahul", role: "EMPLOYEE", designation: "OFFICE", workTypes: ["Field", "Remote"] },
      { email: "employee4@hrms.com", password: "password123", id: "emp4", name: "Pooja", role: "EMPLOYEE", designation: "OFFICE", workTypes: ["Warehouse", "Factory"] },
      { email: "employee5@hrms.com", password: "password123", id: "emp5", name: "Sneha", role: "EMPLOYEE", designation: "OFFICE", workTypes: ["Office", "Field", "Remote", "Warehouse", "Factory"] },
      { email: "yashhydromaterial@gmail.com", password: "password123", id: "HMPL02", name: "Yash Material", role: "EMPLOYEE", designation: "FIELD", workTypes: ["Field", "Office", "Remote"] }
    ];

    const matched = dummyUsers.find(
      u => u.email.toLowerCase() === credentials.email.toLowerCase() && u.password === credentials.password
    );

    if (matched) {
      const mockToken = `fake-jwt-token-${matched.id}`;
      const userProfile = {
        id: matched.id,
        name: matched.name,
        email: matched.email,
        role: matched.role,
        designation: matched.designation || 'OFFICE',
        workTypes: matched.workTypes,
        token: mockToken
      };
      await setSecureItem('userToken', mockToken);
      await setSecureItem('userProfile', JSON.stringify(userProfile));

      // Fetch and store settings on offline login fallback
      await fetchAppSettings().catch(err => console.warn("[Offline Login] Settings fetch warning:", err.message));

      return userProfile;
    }
    throw err;
  }
};

export const logoutUser = async () => {
  await deleteSecureItem('userToken');
  await deleteSecureItem('userProfile');
};