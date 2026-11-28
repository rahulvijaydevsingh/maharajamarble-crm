import { useEffect, useRef, useState } from 'react';

import type { Reminder } from '@/hooks/useReminders';
import { partitionRemindersForBell, getReminderAlertKey } from '@/lib/reminderBellState';

let sharedAudioContext: AudioContext | null = null;

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const windowWithWebkit = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? windowWithWebkit.webkitAudioContext ?? null;
}

/** Must be called directly by a user gesture so browsers unlock audio playback. */
export function unlockNotificationAudio(): void {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) return;
  try {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContextConstructor();
    }
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => undefined);
    }
  } catch {
    // Audio is an enhancement; a blocked or unavailable context is non-fatal.
  }
}

function playTone(context: AudioContext, frequency: number, startsAt: number, duration: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.045, startsAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.02);
}

/** A crisp two-tone chime made entirely with Web Audio (no bundled audio file). */
export function playNotificationChime(): void {
  if (!sharedAudioContext || sharedAudioContext.state !== 'running') return;
  try {
    const now = sharedAudioContext.currentTime;
    playTone(sharedAudioContext, 880, now, 0.15);
    playTone(sharedAudioContext, 1174.66, now + 0.16, 0.16);
  } catch {
    // Browsers may suspend audio between visibility changes.
  }
}

export function isAndroidDevice(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    (!window.isSecureContext && window.location.hostname !== 'localhost')
  ) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register('/sw-notifications.js');
  } catch {
    return null;
  }
}

/** Invoke from a button click. Audio unlock runs synchronously before permission prompting. */
export function requestAndroidNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  unlockNotificationAudio();
  void registerNotificationServiceWorker();
  if (
    typeof Notification === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return Promise.resolve('unsupported');
  }
  return Notification.requestPermission();
}

export async function dispatchAndroidBackgroundNotification(
  title: string,
  body: string,
  tag: string,
  url: string,
  muted = false,
): Promise<void> {
  if (
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      silent: muted,
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      data: { url },
    });
  } catch {
    // Background notifications can fail when Android revokes permission or the SW is updating.
  }
}

/**
 * Seeds the first visible batch silently, then returns each new due trigger
 * exactly once. A changed snooze timestamp creates a fresh alert key.
 */
export function collectNewlyDueAlertReminders(
  newDueReminders: readonly Reminder[],
  alertedKeys: Set<string>,
  initialized: boolean,
): Reminder[] {
  if (!initialized) {
    newDueReminders.forEach((reminder) => alertedKeys.add(getReminderAlertKey(reminder)));
    return [];
  }

  return newDueReminders.filter((reminder) => {
    const key = getReminderAlertKey(reminder);
    if (alertedKeys.has(key)) return false;
    alertedKeys.add(key);
    return true;
  });
}

export interface ReminderAlertWatcherOptions {
  reminders: readonly Reminder[];
  clearedAt: string | null;
  userId: string | undefined;
  muted: boolean;
  loading?: boolean;
  resolveBody: (reminder: Reminder) => string;
  resolveUrl: (reminder: Reminder) => string;
}

/** Watches due reminders on every mounted mobile route, not only in the drawer. */
export function useReminderAlertWatcher({
  reminders,
  clearedAt,
  userId,
  muted,
  loading = false,
  resolveBody,
  resolveUrl,
}: ReminderAlertWatcherOptions): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const alertedKeysRef = useRef(new Set<string>());
  const initializedRef = useRef(false);
  const activeUserRef = useRef(userId);
  const skipNextBatchRef = useRef(false);

  useEffect(() => {
    if (activeUserRef.current !== userId) {
      activeUserRef.current = userId;
      alertedKeysRef.current.clear();
      initializedRef.current = false;
      skipNextBatchRef.current = true;
      return;
    }
    if (!userId) {
      alertedKeysRef.current.clear();
      initializedRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (isAndroidDevice()) void registerNotificationServiceWorker();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (skipNextBatchRef.current) {
      skipNextBatchRef.current = false;
      return;
    }
    if (loading || !userId) return;

    const { newDue } = partitionRemindersForBell(reminders, clearedAt, nowMs);
    const newlyDue = collectNewlyDueAlertReminders(
      newDue,
      alertedKeysRef.current,
      initializedRef.current,
    );

    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }

    newlyDue.forEach((reminder) => {
      const body = resolveBody(reminder);
      const url = resolveUrl(reminder);
      const tag = getReminderAlertKey(reminder);

      if (document.visibilityState === 'visible') {
        if (!muted) playNotificationChime();
      } else if (isAndroidDevice() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        void dispatchAndroidBackgroundNotification(reminder.title, body, tag, url, muted);
      }
    });
  }, [clearedAt, loading, muted, nowMs, reminders, resolveBody, resolveUrl, userId]);

  return nowMs;
}
