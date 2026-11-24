import { Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '@/constants/API';

export const MAX_EXPENSE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Turns what the server stored for an attachment (absolute URL or a relative/Windows path) into a loadable URL. */
export function resolveAttachmentUrl(raw?: string | null): string {
  if (!raw) return '';
  const clean = raw.replace(/\\/g, '/');
  if (/^https?:\/\//i.test(clean)) return clean;
  const origin = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${origin}/${clean.replace(/^\/+/, '')}`;
}

export function isPdfAttachment(urlOrName?: string | null, mimeType?: string | null): boolean {
  if (mimeType && mimeType.toLowerCase() === 'application/pdf') return true;
  if (!urlOrName) return false;
  return /\.pdf(?:[?#].*)?$/i.test(urlOrName.trim());
}

export function attachmentFileName(urlOrName: string, fallback: string): string {
  const last = urlOrName.split(/[?#]/)[0].split('/').pop();
  return last ? decodeURIComponent(last) : fallback;
}

/**
 * Opens a PDF. On the web it opens in a new tab. On a phone the file is downloaded to the cache and handed to the
 * system's "open with" sheet, so the user's own PDF reader shows it and the document URL is not sent to a third party.
 * Resolves false when the file could not be fetched.
 */
export async function openPdf(url: string, dialogTitle?: string): Promise<boolean> {
  if (!url) return false;
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
    return true;
  }
  try {
    const target = `${FileSystem.cacheDirectory}attachment_${Date.now()}.pdf`;
    const res = await FileSystem.downloadAsync(url, target);
    if (res.status !== 200) return false;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(res.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
      return true;
    }
  } catch {
    // fall through to the browser
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
