import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import CellularTracker from '../modules/cellular-tracker';
import { useAuth } from '@/context/AuthContext';
import {
  Activity,
  ActivityApiError,
  QueuedStart,
  cancelActivity,
  clearQueuedStart,
  extendActivity,
  fetchCurrentActivity,
  finishActivity,
  flushQueuedStart,
  getBestEffortPosition,
  getQueuedStart,
  rememberTitle,
  setQueuedStart,
  startActivity,
  toActivityApiError,
} from '@/services/activityService';
import { istDateString, MINUTE_MS } from '@/utils/activityTime';

// The running Day Activity. The server is the source of truth: `current` is re-read at launch, on login and every
// time the app returns to the foreground, and replaced by whatever each action returns.

export type ActivityResult = { ok: true; activity: Activity } | { ok: false; error: ActivityApiError };
export type StartResult = ActivityResult | { ok: true; queued: QueuedStart };

export interface StartInput {
  /** FREE work place: the work as typed. */
  title?: string;
  /** LIST work place: the chosen item (sent as `workKey`); its title is only for display while queued offline. */
  work?: { key: string; title: string; minutes: number | null };
  /** Exactly one of plannedEndAt (epoch ms) or plannedMinutes, except a LIST item with fixed minutes: none. */
  plannedEndAt?: number;
  plannedMinutes?: number;
  notes?: string;
}

interface ActivityContextValue {
  current: Activity | null;
  /** A start made offline that has not reached the server yet. */
  queued: QueuedStart | null;
  /** True until the first answer from the server for this login. */
  loading: boolean;
  /** Why a queued start was not sent (shown once); null when there is nothing to tell. */
  droppedNotice: 'TOO_OLD' | 'CONFLICT' | 'REJECTED' | null;
  dismissDroppedNotice: () => void;
  /** Gives up a start that is still waiting for a connection. */
  discardQueued: () => Promise<void>;
  refresh: () => Promise<Activity | null>;
  start: (input: StartInput) => Promise<StartResult>;
  extend: (id: string, extraMinutes: number, reason: string) => Promise<ActivityResult>;
  finish: (id: string, body: { reason?: string; notes?: string }) => Promise<ActivityResult>;
  cancel: (id: string, reason?: string) => Promise<ActivityResult>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

/** After these the activity is no longer ours to act on: re-read the server and let the screen close. */
const STALE_CODES = new Set(['NOT_IN_PROGRESS', 'NOT_FOUND', 'FORBIDDEN']);
const QUEUE_RETRY_MS = 30_000;

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId: string | undefined = user?.id;
  const [current, setCurrent] = useState<Activity | null>(null);
  const [queued, setQueued] = useState<QueuedStart | null>(null);
  const [loading, setLoading] = useState(true);
  const [droppedNotice, setDroppedNotice] = useState<'TOO_OLD' | 'CONFLICT' | 'REJECTED' | null>(null);
  const requestSeq = useRef(0);

  const refresh = useCallback(async (): Promise<Activity | null> => {
    const seq = ++requestSeq.current;
    try {
      const flushed = await flushQueuedStart();
      if (flushed.status === 'sent' && seq === requestSeq.current) setCurrent(flushed.activity);
      if (flushed.status === 'dropped') setDroppedNotice(flushed.reason);
      setQueued(await getQueuedStart());
      const live = flushed.status === 'sent' ? flushed.activity : await fetchCurrentActivity();
      // A newer refresh or action has already answered: its result is fresher than this one.
      if (seq === requestSeq.current) setCurrent(live);
      return live;
    } catch (err) {
      // Offline or the server is unreachable: keep what is on screen rather than showing "no activity".
      console.warn('[Activity] refresh failed:', toActivityApiError(err).message);
      return null;
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Launch and login.
  useEffect(() => {
    if (!userId) {
      requestSeq.current++;
      setCurrent(null);
      setQueued(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [userId, refresh]);

  // Back to the foreground: another device or the server may have changed things.
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [userId, refresh]);

  // A queued start is retried while the app is open.
  useEffect(() => {
    if (!userId || !queued) return;
    const timer = setInterval(() => refresh(), QUEUE_RETRY_MS);
    return () => clearInterval(timer);
  }, [userId, queued, refresh]);

  // Keep the native alarm in step with the deadline we know. It rings with the app closed and with no connection.
  const ringing = current?.status === 'IN_PROGRESS' && (current.state === 'IN_PROGRESS' || current.state === 'OVERDUE') &&
    current.date === istDateString(Date.now()) ? current : null;
  useEffect(() => {
    if (!userId) {
      CellularTracker.cancelActivityAlarm();
      return;
    }
    if (ringing) {
      CellularTracker.scheduleActivityAlarm(ringing.id, ringing.title, ringing.deadlineAt);
    } else if (queued) {
      // id '' = "the current activity": the Extra time screen resolves it once the start has synced.
      CellularTracker.scheduleActivityAlarm('', queued.title, queued.plannedEndAt);
    } else {
      CellularTracker.cancelActivityAlarm();
    }
    // Re-arm only when the deadline or the queued start changes, not on every refresh of the same activity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ringing?.id, ringing?.deadlineAt, queued?.startedAt, queued?.plannedEndAt]);

  /** Runs one server action. A stale-activity answer refreshes from the server; the caller decides what to show. */
  const act = useCallback(async (run: () => Promise<Activity>): Promise<ActivityResult> => {
    try {
      const activity = await run();
      requestSeq.current++;
      setCurrent(activity.status === 'IN_PROGRESS' ? activity : null);
      return { ok: true, activity };
    } catch (err) {
      const error = toActivityApiError(err);
      if (error.code === 'ACTIVITY_IN_PROGRESS' && error.current) {
        requestSeq.current++;
        setCurrent(error.current);
      } else if (error.status !== null && STALE_CODES.has(error.code)) {
        refresh();
      }
      return { ok: false, error };
    }
  }, [refresh]);

  const start = useCallback(async (input: StartInput): Promise<StartResult> => {
    const startedAt = Date.now();
    const fix = await getBestEffortPosition();
    const extras = {
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      ...(fix ?? {}),
    };
    // LIST work place: the server takes the work by key (and fixes the time itself for some items). FREE: typed title.
    const fixedTime = !!input.work && input.work.minutes !== null;
    const what = input.work ? { workKey: input.work.key } : { title: (input.title ?? '').trim() };
    const time = fixedTime
      ? {}
      : input.plannedMinutes !== undefined
        ? { plannedMinutes: input.plannedMinutes }
        : { plannedEndAt: input.plannedEndAt };
    const displayTitle = input.work ? input.work.title : (input.title ?? '').trim();
    const result = await act(() => startActivity({ ...what, ...time, ...extras }));
    if (result.ok) {
      if (!input.work) rememberTitle(displayTitle);
      return result;
    }
    if (result.error.isNetwork) {
      // No connection: keep the start with its real time and send it later with `startedAt`.
      const minutes = fixedTime ? (input.work as { minutes: number }).minutes : input.plannedMinutes;
      const plannedEndAt = minutes !== undefined && minutes !== null ? startedAt + minutes * MINUTE_MS : (input.plannedEndAt as number);
      const queuedStart: QueuedStart = {
        ...extras,
        title: displayTitle,
        ...(input.work ? { workKey: input.work.key, fixedTime } : {}),
        plannedEndAt,
        startedAt,
      };
      await setQueuedStart(queuedStart);
      setQueued(queuedStart);
      if (!input.work) rememberTitle(displayTitle);
      return { ok: true, queued: queuedStart };
    }
    return result;
  }, [act]);

  const extend = useCallback((id: string, extraMinutes: number, reason: string) =>
    act(() => extendActivity(id, extraMinutes, reason.trim())), [act]);

  const finish = useCallback(async (id: string, body: { reason?: string; notes?: string }) => {
    const fix = await getBestEffortPosition();
    return act(() => finishActivity(id, {
      ...(body.reason?.trim() ? { reason: body.reason.trim() } : {}),
      ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
      ...(fix ?? {}),
    }));
  }, [act]);

  const cancel = useCallback((id: string, reason?: string) =>
    act(() => cancelActivity(id, reason?.trim() || undefined)), [act]);

  const discardQueued = useCallback(async () => {
    await clearQueuedStart();
    setQueued(null);
  }, []);
  const dismissDroppedNotice = useCallback(() => setDroppedNotice(null), []);

  return (
    <ActivityContext.Provider value={{ current, queued, loading, droppedNotice, dismissDroppedNotice, discardQueued, refresh, start, extend, finish, cancel }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity(): ActivityContextValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivity must be used inside ActivityProvider');
  return ctx;
}
