import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Detects that a newer build of the mobile workspace has been deployed.
 *
 * The check reads `/index.html` (never cached) and compares the hashed asset
 * filenames it references with the ones the current document already loaded.
 * A mismatch means the server has a newer bundle.
 *
 * The hook is deliberately non-intrusive: it never reloads on its own. The
 * caller decides when to apply the update, and passes `isDirty` so a form with
 * unsaved input is never interrupted.
 */

const INDEX_URL = '/index.html';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Extracts the sorted set of hashed build assets referenced by an HTML document. */
export function extractAssetSignature(html: string): string | null {
  if (typeof html !== 'string' || html.length === 0) return null;
  const matches = html.match(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g);
  if (!matches || matches.length === 0) return null;
  return Array.from(new Set(matches)).sort().join(',');
}

/** Reads the hashed build assets the running document actually loaded. */
export function readCurrentAssetSignature(): string | null {
  if (typeof document === 'undefined') return null;
  const nodes = Array.from(
    document.querySelectorAll('script[src*="/assets/"], link[rel="stylesheet"][href*="/assets/"]'),
  );
  const urls = nodes
    .map((node) => node.getAttribute('src') || node.getAttribute('href'))
    .filter((value): value is string => typeof value === 'string');
  if (urls.length === 0) return null;
  return Array.from(new Set(urls)).sort().join(',');
}

export interface VersionCheckOptions {
  /**
   * True when the user has unsaved input on screen. The update is then only
   * surfaced as a banner and never applied automatically.
   */
  isDirty?: boolean;
  /** Poll interval in milliseconds. */
  intervalMs?: number;
  /** Disable the check entirely (for example in tests). */
  enabled?: boolean;
}

export interface VersionCheckState {
  /** True when the server is serving a different build than the one loaded. */
  updateAvailable: boolean;
  /** True when an update exists but unsaved input is blocking it. */
  blockedByUnsavedChanges: boolean;
  /** The asset signature of the running build. */
  currentSignature: string | null;
  /** The asset signature published by the server. */
  latestSignature: string | null;
  /** Dismiss the banner for this session. */
  dismiss: () => void;
  /** Reload into the newest build. */
  applyUpdate: () => void;
  /** Force an immediate re-check. */
  checkNow: () => Promise<void>;
}

export function useVersionCheck(options: VersionCheckOptions = {}): VersionCheckState {
  const { isDirty = false, intervalMs = CHECK_INTERVAL_MS, enabled = true } = options;

  const [currentSignature, setCurrentSignature] = useState<string | null>(null);
  const [latestSignature, setLatestSignature] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dismissedRef = useRef(false);

  const checkNow = useCallback(async () => {
    if (typeof window === 'undefined' || !enabled) return;
    try {
      const response = await fetch(INDEX_URL, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const html = await response.text();
      const published = extractAssetSignature(html);
      if (!published) return;

      const running = readCurrentAssetSignature() ?? currentSignature;
      setCurrentSignature(running);
      setLatestSignature(published);
      setUpdateAvailable(Boolean(running) && published !== running && !dismissedRef.current);
    } catch {
      // A failed version check must never surface an error to the field user.
    }
  }, [currentSignature, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      void checkNow();
    };

    run();
    const timer = window.setInterval(run, intervalMs);

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        run();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', run);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', run);
    };
  }, [checkNow, enabled, intervalMs]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setDismissed(true);
    setUpdateAvailable(false);
  }, []);

  const applyUpdate = useCallback(() => {
    if (isDirty) return;
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [isDirty]);

  return {
    updateAvailable,
    blockedByUnsavedChanges: updateAvailable && isDirty,
    currentSignature,
    latestSignature,
    dismiss,
    applyUpdate,
    checkNow,
  };
}
