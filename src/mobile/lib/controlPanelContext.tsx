/* eslint-disable react-refresh/only-export-components -- the provider and its reader form one unit; the mobile workspace is lazily loaded as a single chunk and never hot-reloaded in isolation. */
import React, { createContext, useContext } from 'react';

import { useControlPanelSettings } from '@/hooks/useControlPanelSettings';

type ControlPanelSettings = ReturnType<typeof useControlPanelSettings>;

/**
 * The Control Panel settings shared by the whole mobile workspace.
 *
 * `useControlPanelSettings()` reads two Supabase tables and keeps the result
 * in component state, so every mounted screen that called it fired its own
 * pair of queries. The mobile tree mounts a lot of screens, so the settings
 * are fetched exactly once here and handed down through this context.
 */
const MobileControlPanelContext = createContext<ControlPanelSettings | null>(null);

/**
 * The fallback used when a screen is rendered outside the provider (for
 * example in an isolated test). It never queries anything — the mobile
 * workspace always mounts the provider.
 */
const FALLBACK_SETTINGS = {
  systemOptions: [],
  setSystemOptions: () => undefined,
  loading: true,
  saving: false,
  hasUnsavedChanges: false,
  saveSettings: async () => undefined,
  loadSettings: async () => undefined,
  getFieldOptions: () => [],
  getOptionLabel: () => '',
} as unknown as ControlPanelSettings;

/** Calls `useControlPanelSettings()` once and shares the result. */
export const MobileControlPanelProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const settings = useControlPanelSettings();
  return (
    <MobileControlPanelContext.Provider value={settings}>
      {children}
    </MobileControlPanelContext.Provider>
  );
};

/**
 * Reads the shared Control Panel settings.
 *
 * Inside the mobile workspace this is the single shared instance; outside the
 * provider it degrades to an empty, query-free fallback.
 */
export function useMobileControlPanel(): ControlPanelSettings {
  const context = useContext(MobileControlPanelContext);
  return context ?? FALLBACK_SETTINGS;
}
