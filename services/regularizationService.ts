import { Platform } from 'react-native';
import api from './api';
import { toEpochMs } from '@/utils/activityTime';

// Attendance regularization (see REGULARIZATION_API.md on the HRMS server). Dates are YYYY-MM-DD, India time.

export type RegularizationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface RegularizationDocument {
  /** Path on the server, e.g. storage/regularization/regularization-123.pdf (resolve with resolveAttachmentUrl). */
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface RegularizationRequest {
  id: string;
  date: string;
  comment: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  status: RegularizationStatus;
  /** The admin's reason when rejected. */
  decisionNote: string | null;
  decidedAt: number | null;
  documents: RegularizationDocument[];
  createdAt: number | null;
}

export interface AttachedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
}

export interface CreateRegularizationInput {
  date: string;
  comment: string;
  /** Optional 'HH:mm'. */
  checkIn?: string;
  checkOut?: string;
  documents: AttachedFile[];
}

/** Every failure of a regularization call, with the server's `code` and user-facing `error` text when it sent them. */
export class RegularizationApiError extends Error {
  status: number | null;
  code: string;
  /** True when the request never got an answer (no connection, timeout). Safe to retry. */
  isNetwork: boolean;
  /** The existing request, carried by 409 ALREADY_REQUESTED. */
  request: RegularizationRequest | null;

  constructor(message: string, opts: { status?: number | null; code?: string; isNetwork?: boolean; request?: RegularizationRequest | null }) {
    super(message);
    this.name = 'RegularizationApiError';
    this.status = opts.status ?? null;
    this.code = opts.code ?? 'UNKNOWN';
    this.isNetwork = !!opts.isNetwork;
    this.request = opts.request ?? null;
  }
}

const STATUSES: RegularizationStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export function normalizeRegularization(raw: any): RegularizationRequest {
  const status = STATUSES.includes(raw?.status) ? (raw.status as RegularizationStatus) : 'PENDING';
  return {
    id: String(raw?.id ?? ''),
    date: String(raw?.date ?? ''),
    comment: String(raw?.comment ?? ''),
    requestedCheckIn: raw?.requestedCheckIn || null,
    requestedCheckOut: raw?.requestedCheckOut || null,
    status,
    decisionNote: raw?.decisionNote || null,
    decidedAt: toEpochMs(raw?.decidedAt),
    documents: Array.isArray(raw?.documents)
      ? raw.documents.map((d: any) => ({
          url: String(d?.url ?? ''),
          name: String(d?.name ?? ''),
          mimeType: String(d?.mimeType ?? ''),
          size: Number(d?.size) || 0,
        }))
      : [],
    createdAt: toEpochMs(raw?.createdAt),
  };
}

export function toRegularizationError(err: any): RegularizationApiError {
  if (err instanceof RegularizationApiError) return err;
  const res = err?.response;
  if (res) {
    const body = res.data || {};
    return new RegularizationApiError(String(body.error || err?.message || 'Request failed'), {
      status: res.status,
      code: String(body.code || (res.status === 401 ? 'UNAUTHORIZED' : res.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN')),
      request: body.request ? normalizeRegularization(body.request) : null,
    });
  }
  const isNetwork =
    err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT' ||
    err?.code === 'ECONNREFUSED' || /network error|timeout/i.test(String(err?.message || ''));
  return new RegularizationApiError(String(err?.message || 'Network error'), { code: isNetwork ? 'NETWORK' : 'UNKNOWN', isNetwork });
}

async function call<T>(run: () => Promise<{ data: any }>, pick: (data: any) => T): Promise<T> {
  try {
    return pick((await run()).data);
  } catch (err) {
    throw toRegularizationError(err);
  }
}

const withRequest = (data: any) => normalizeRegularization(data?.request);

/** Newest day first (the server sends oldest first); the day's newest request first when a day has several. */
export function sortNewestFirst(requests: RegularizationRequest[]): RegularizationRequest[] {
  return [...requests].sort((a, b) => (a.date === b.date ? (b.createdAt ?? 0) - (a.createdAt ?? 0) : a.date < b.date ? 1 : -1));
}

export const listRegularizations = () =>
  call(
    () => api.get('/regularizations', { params: { status: 'ALL' } }),
    (data) => ({
      requests: sortNewestFirst(Array.isArray(data?.requests) ? (data.requests as any[]).map(normalizeRegularization) : []),
      pendingCount: Number(data?.pendingCount) || 0,
    }),
  );

export const getRegularization = (id: string) =>
  call(() => api.get(`/regularizations/${encodeURIComponent(id)}`), withRequest);

export const cancelRegularization = (id: string) =>
  call(() => api.post(`/regularizations/${encodeURIComponent(id)}/cancel`), withRequest);

/** Sends the request as multipart/form-data. Content-Type is left to the HTTP client so it adds the boundary. */
export async function createRegularization(input: CreateRegularizationInput): Promise<RegularizationRequest> {
  const form = new FormData();
  form.append('date', input.date);
  form.append('comment', input.comment.trim());
  if (input.checkIn?.trim()) form.append('checkIn', input.checkIn.trim());
  if (input.checkOut?.trim()) form.append('checkOut', input.checkOut.trim());
  try {
    for (const file of input.documents) {
      if (Platform.OS === 'web') {
        const blob = await (await fetch(file.uri)).blob();
        form.append('documents', blob, file.name);
      } else {
        form.append('documents', { uri: decodeURIComponent(file.uri), name: file.name, type: file.mimeType } as any);
      }
    }
    return withRequest((await api.post('/regularizations', form)).data);
  } catch (err) {
    throw toRegularizationError(err);
  }
}
