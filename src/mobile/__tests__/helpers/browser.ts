/**
 * Test helpers.
 *
 * The repository runs vitest in the default **node** environment (there is no
 * `jsdom` dependency and none may be added), so anything that touches
 * `window.localStorage` / `window.sessionStorage` needs a minimal browser
 * stand-in. This module installs one and always restores the previous global.
 */

export interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  readonly length: number;
  key(index: number): string | null;
}

export function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
  };
}

interface FakeWindow {
  localStorage: FakeStorage;
  sessionStorage: FakeStorage;
  innerWidth: number;
  addEventListener: () => void;
  removeEventListener: () => void;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

/**
 * Installs a minimal `window` global. Returns a restore function.
 *
 * The real `setTimeout` / `clearTimeout` are reused so code that schedules
 * work behaves normally.
 */
export function installFakeWindow(
  options: { innerWidth?: number; localStorage?: FakeStorage; sessionStorage?: FakeStorage } = {},
): { window: FakeWindow; restore: () => void } {
  const globals = globalThis as unknown as Record<string, unknown>;
  const previousWindow = globals.window;
  const previousDocument = globals.document;

  const fakeWindow: FakeWindow = {
    localStorage: options.localStorage ?? createFakeStorage(),
    sessionStorage: options.sessionStorage ?? createFakeStorage(),
    innerWidth: options.innerWidth ?? 375,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  globals.window = fakeWindow;
  globals.document = {
    visibilityState: 'visible',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  return {
    window: fakeWindow,
    restore: () => {
      if (previousWindow === undefined) delete globals.window;
      else globals.window = previousWindow;
      if (previousDocument === undefined) delete globals.document;
      else globals.document = previousDocument;
    },
  };
}
