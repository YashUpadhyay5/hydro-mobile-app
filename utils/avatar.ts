import { API_BASE_URL } from '@/constants/API';

/**
 * Resolves an avatar string to a fully qualified, loadable image URL.
 * Handles:
 * - null / undefined / empty string -> null
 * - Full remote URLs ('http://...', 'https://...') -> returned as-is
 * - Local device URIs ('file://...', 'content://...', 'data:...') -> returned as-is
 * - Server-relative paths (e.g. '/static/uploads/...', 'uploads/...') -> prepends backend host
 */
export function resolveAvatarUrl(avatar?: string | null): string | null {
  if (!avatar || typeof avatar !== 'string') {
    return null;
  }

  const trimmed = avatar.trim();
  if (!trimmed) {
    return null;
  }

  // If already full URL or local scheme
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  // Extract the base server host without the '/api' suffix (e.g. http://host:8000)
  const baseHost = API_BASE_URL.replace(/\/api\/?$/, '');
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${baseHost}${path}`;
}