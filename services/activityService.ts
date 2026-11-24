import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import api from './api';
import { toEpochMs } from '@/utils/activityTime';
import { queuedStartIsValid } from '@/utils/activityRules';

// Day Activities (see DAY_ACTIVITIES_API.md on the HRMS server). Times are epoch milliseconds.

export type ActivityStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ActivityState = 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED' | 'COMPLETED_LATE' | 'CANCELLED' | 'UNFINISHED';

export interface ActivityExtension {
  at: number | null;
  extraMinutes: number;
  reason: string;
  previousDeadlineAt: number | null;
  newDeadlineAt: number | null;
}

export interface Activity {
  id: string;
  title: string;
  notes: string | null;
  /** YYYY-MM-DD in IST. */
  date: string;
  startedAt: number;
  /** The original plan; never changes. */
  plannedEndAt: number;
  /** The current deadline: drives the countdown and the alarm. */
  deadlineAt: number;
  endedAt: number | null;
  status: ActivityStatus;
  state: ActivityState;
  plannedMinutes: number;
  takenMinutes: number | null;
  overMinutes: number;
  extraMinutesAsked: number;
  extensions: ActivityExtension[];
  finishReason: string | null;
  remindersSent: number;
}

/** One thing an employee can log in a LIST work place. `minutes` is fixed by the server, or null when they choose the time. */
export interface WorkItem {
  key: string;
  title: string;
  minutes: number | null;
}

/** What the employee may log, from GET /activities/work-list. It depends on their work place and is never hard-coded. */
export interface WorkList {
  region: string;
  label: string;
  /** LIST: pick from `items`, no free text. FREE: type the work. */
  mode: 'LIST' | 'FREE';
  workPlace: string;
  items: WorkItem[];
}

export interface StartActivityInput {
  /** FREE mode: the work as typed. Not sent in LIST mode. */
  title?: string;
  /** LIST mode: the chosen item's `key`, sent instead of `title`. */
  workKey?: string;
  /** Exactly one of plannedEndAt (epoch ms) or plannedMinutes; none at all for a LIST item with a fixed time. */
  plannedEndAt?: number;
  plannedMinutes?: number;
  notes?: string;
  latitude?: number;
  longitude?: number;
  /** Only for a start that was queued while offline. */
  startedAt?: number;
}

/** Every failure of an activity call, with the server's `code` and user-facing `error` text when it sent them. */
export class ActivityApiError extends Error {
  status: number | null;
  code: string;
  /** True when the request never got an answer (no connection, timeout). Safe to retry or queue. */
  isNetwork: boolean;
  /** The running activity, carried by 409 ACTIVITY_IN_PROGRESS. */
  current: Activity | null;
  /** The list to choose from again, carried by 400 WORK_REQUIRED. */
  workList: WorkList | null;

  constructor(message: string, opts: { status?: number | null; code?: string; isNetwork?: boolean; current?: Activity | null; workList?: WorkList | null }) {
    super(message);
    this.name = 'ActivityApiError';
    this.status = opts.status ?? null;
    this.code = opts.code ?? 'UNKNOWN';
    this.isNetwork = !!opts.isNetwork;
    this.current = opts.current ?? null;
    this.workList = opts.workList ?? null;
  }
}

export function normalizeWorkList(raw: any): WorkList {
  const items: WorkItem[] = Array.isArray(raw?.items)
    ? raw.items
        .filter((i: any) => i && i.key !== undefined && i.title !== undefined)
        .map((i: any) => ({ key: String(i.key), title: String(i.title), minutes: i.minutes === null || i.minutes === undefined ? null : Number(i.minutes) }))
    : [];
  return {
    region: String(raw?.region ?? ''),
    label: String(raw?.label ?? ''),
    mode: raw?.mode === 'LIST' ? 'LIST' : 'FREE',
    workPlace: String(raw?.workPlace ?? ''),
    items,
  };
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function normalizeActivity(raw: any): Activity {
  const deadlineAt = toEpochMs(raw?.deadlineAt) ?? toEpochMs(raw?.plannedEndAt) ?? 0;
  const status: ActivityStatus = raw?.status === 'COMPLETED' || raw?.status === 'CANCELLED' ? raw.status : 'IN_PROGRESS';
  const state: ActivityState = raw?.state
    ? raw.state
    : status === 'IN_PROGRESS'
      ? (Date.now() > deadlineAt ? 'OVERDUE' : 'IN_PROGRESS')
      : status;
  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title ?? ''),
    notes: raw?.notes ?? null,
    date: String(raw?.date ?? ''),
    startedAt: toEpochMs(raw?.startedAt) ?? 0,
    plannedEndAt: toEpochMs(raw?.plannedEndAt) ?? deadlineAt,
    deadlineAt,
    endedAt: toEpochMs(raw?.endedAt),
    status,
    state,
    plannedMinutes: num(raw?.plannedMinutes),
    takenMinutes: raw?.takenMinutes === null || raw?.takenMinutes === undefined ? null : num(raw.takenMinutes),
    overMinutes: num(raw?.overMinutes),
    extraMinutesAsked: num(raw?.extraMinutesAsked),
    extensions: Array.isArray(raw?.extensions)
      ? raw.extensions.map((e: any) => ({
          at: toEpochMs(e?.at),
          extraMinutes: num(e?.extraMinutes),
          reason: String(e?.reason ?? ''),
          previousDeadlineAt: toEpochMs(e?.previousDeadlineAt),
          newDeadlineAt: toEpochMs(e?.newDeadlineAt),
        }))
      : [],
    finishReason: raw?.finishReason ?? null,
    remindersSent: num(raw?.remindersSent),
  };
}

export function toActivityApiError(err: any): ActivityApiError {
  if (err instanceof ActivityApiError) return err;
  const res = err?.response;
  if (res) {
    const body = res.data || {};
    return new ActivityApiError(String(body.error || err?.message || 'Request failed'), {
      status: res.status,
      code: String(body.code || (res.status === 401 ? 'UNAUTHORIZED' : res.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN')),
      current: body.current ? normalizeActivity(body.current) : null,
      workList: body.workList ? normalizeWorkList(body.workList) : null,
    });
  }
  const isNetwork =
    err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT' ||
    err?.code === 'ECONNREFUSED' || /network error|timeout/i.test(String(err?.message || ''));
  return new ActivityApiError(String(err?.message || 'Network error'), { code: isNetwork ? 'NETWORK' : 'UNKNOWN', isNetwork });
}

async function call<T>(run: () => Promise<{ data: any }>, pick: (data: any) => T): Promise<T> {
  try {
    const res = await run();
    return pick(res.data);
  } catch (err) {
    throw toActivityApiError(err);
  }
}

const withActivity = (data: any): Activity => normalizeActivity(data?.activity);

/** The running activity, or null. The server is the source of truth: never trust a cached copy over this. */
export const fetchCurrentActivity = () =>
  call(() => api.get('/activities/current'), (data) => (data?.activity ? normalizeActivity(data.activity) : null));

/** What this employee may log. Fetched every time the Start screen opens, never cached: the work place can change. */
export const fetchWorkList = () =>
  call(() => api.get('/activities/work-list'), (data) => normalizeWorkList(data));

export const startActivity = (input: StartActivityInput) =>
  call(() => api.post('/activities', input), withActivity);

export const extendActivity = (id: string, extraMinutes: number, reason: string) =>
  call(() => api.post(`/activities/${encodeURIComponent(id)}/extend`, { extraMinutes, reason }), withActivity);

export const finishActivity = (id: string, body: { reason?: string; notes?: string; latitude?: number; longitude?: number }) =>
  call(() => api.post(`/activities/${encodeURIComponent(id)}/finish`, body), withActivity);

export const cancelActivity = (id: string, reason?: string) =>
  call(() => api.post(`/activities/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {}), withActivity);

export const fetchActivitiesForDate = (date?: string) =>
  call(
    () => api.get('/activities', { params: date ? { date } : undefined }),
    (data) => ({
      date: String(data?.date ?? date ?? ''),
      employee: data?.employee ?? null,
      activities: Array.isArray(data?.activities) ? (data.activities as any[]).map(normalizeActivity) : [],
    }),
  );

/** A GPS fix if location permission is already granted. Never asks, never blocks for long. */
export async function getBestEffortPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
    const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((p) => ({ latitude: p.coords.latitude, longitude: p.coords.longitude }))
      .catch(() => null);
    const fix = await Promise.race([fresh, timeout]);
    if (fix) return fix;
    const last = await Location.getLastKnownPositionAsync();
    return last ? { latitude: last.coords.latitude, longitude: last.coords.longitude } : null;
  } catch {
    return null;
  }
}

// ── Titles used before, kept on the device as one-tap chips ───────────────────────────────

const RECENT_TITLES_KEY = '@hrms_activity_recent_titles_v1';
const RECENT_TITLES_MAX = 8;

export async function getRecentTitles(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_TITLES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export async function rememberTitle(title: string): Promise<void> {
  const clean = title.trim();
  if (!clean) return;
  try {
    const existing = await getRecentTitles();
    const next = [clean, ...existing.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, RECENT_TITLES_MAX);
    await AsyncStorage.setItem(RECENT_TITLES_KEY, JSON.stringify(next));
  } catch {
    // chips are a convenience; never fail a start because of them
  }
}

// ── A start made while offline waits here with its real start time ────────────────────────

const QUEUED_START_KEY = '@hrms_activity_queued_start_v1';

export interface QueuedStart {
  /** What is shown while it waits: the typed work, or the chosen item's title. */
  title: string;
  /** LIST mode: sent as `workKey` instead of `title`. */
  workKey?: string;
  /** True when the server fixes the time (a LIST item with minutes): no time is sent, `plannedEndAt` is only for display and the alarm. */
  fixedTime?: boolean;
  plannedEndAt: number;
  notes?: string;
  latitude?: number;
  longitude?: number;
  startedAt: number;
}

export async function getQueuedStart(): Promise<QueuedStart | null> {
  try {
    const raw = await AsyncStorage.getItem(QUEUED_START_KEY);
    if (!raw) return null;
    const q = JSON.parse(raw);
    return q && typeof q.title === 'string' && typeof q.startedAt === 'number' && typeof q.plannedEndAt === 'number' ? q : null;
  } catch {
    return null;
  }
}

export const setQueuedStart = (q: QueuedStart) => AsyncStorage.setItem(QUEUED_START_KEY, JSON.stringify(q));
export const clearQueuedStart = () => AsyncStorage.removeItem(QUEUED_START_KEY);

export type FlushResult =
  | { status: 'none' }
  | { status: 'kept' }
  | { status: 'sent'; activity: Activity }
  | { status: 'dropped'; reason: 'TOO_OLD' | 'CONFLICT' | 'REJECTED'; message?: string };

/** Sends the queued start if there is one. Keeps it while there is no connection. */
export async function flushQueuedStart(nowMs: number = Date.now()): Promise<FlushResult> {
  const queued = await getQueuedStart();
  if (!queued) return { status: 'none' };
  if (!queuedStartIsValid(queued.startedAt, nowMs)) {
    await clearQueuedStart();
    return { status: 'dropped', reason: 'TOO_OLD' };
  }
  try {
    const activity = await startActivity({
      ...(queued.workKey ? { workKey: queued.workKey } : { title: queued.title }),
      ...(queued.fixedTime ? {} : { plannedEndAt: queued.plannedEndAt }),
      notes: queued.notes,
      latitude: queued.latitude,
      longitude: queued.longitude,
      startedAt: queued.startedAt,
    });
    await clearQueuedStart();
    return { status: 'sent', activity };
  } catch (err) {
    const e = toActivityApiError(err);
    if (e.isNetwork || e.status === null || e.status >= 500) return { status: 'kept' };
    if (e.code === 'ACTIVITY_IN_PROGRESS' && e.current) {
      await clearQueuedStart();
      // The first attempt may have reached the server even though its answer was lost: that is not a conflict.
      const sameStart = e.current.title === queued.title && Math.abs(e.current.startedAt - queued.startedAt) < 5 * 60_000;
      return sameStart ? { status: 'sent', activity: e.current } : { status: 'dropped', reason: 'CONFLICT' };
    }
    if (e.status === 401) return { status: 'kept' };
    await clearQueuedStart();
    return { status: 'dropped', reason: 'REJECTED', message: e.message };
  }
}
