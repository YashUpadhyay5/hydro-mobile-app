export const NAMESPACES = [
  'common',
  'nav',
  'sidebar',
  'dashboard',
  'attendance',
  'leave',
  'payroll',
  'expense',
  'employee',
  'auth',
  'profile',
  'settings',
  'notification',
  'validation',
  'errors',
  'toast',
  'forms',
  'calendar',
  'table',
  'reports',
  'analytics',
  'charts',
  'documents',
  'camera',
  'tracking',
  'permissions',
  'communication',
] as const;

export type Namespace = (typeof NAMESPACES)[number];
export const DEFAULT_NAMESPACE: Namespace = 'common';

