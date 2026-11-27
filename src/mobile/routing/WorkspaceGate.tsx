import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Smartphone } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import {
  MOBILE_ROOT,
  isMobileViewport,
  mapDesktopPathToMobile,
  mapMobilePathToDesktop,
  readWorkspacePreference,
  subscribeWorkspacePreference,
  writeWorkspacePreference,
} from '@/mobile/routing/workspacePreference';
import type { WorkspacePref } from '@/mobile/types/crmTypes';

/** True when `pathname` is inside the mobile workspace (`/m` or `/m/...`). */
function isMobileWorkspacePath(pathname: string): boolean {
  return pathname === MOBILE_ROOT || pathname.startsWith(`${MOBILE_ROOT}/`);
}

/**
 * Controls whether the `/m` routes render the mobile workspace or hand the
 * user over to the full desktop CRM.
 *
 * Rules:
 *  - On a viewport `>= 768px` the gate never redirects. The mobile workspace
 *    still renders (the `/m/*` URLs are directly reachable), so a desktop user
 *    who opens a shared mobile link sees the mobile workspace instead of being
 *    bounced around.
 *  - The user's explicit preference (`mm_workspace_pref_v1`) wins over the
 *    viewport, so a field user who deliberately switched to the full CRM is
 *    not fought by the gate.
 */
export const WorkspaceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [preference, setPreference] = useState<WorkspacePref>('mobile');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPreference(readWorkspacePreference());
    setReady(true);
    // React immediately when the user switches preference from inside the
    // workspace (for example "Switch to Full CRM" in the More hub).
    return subscribeWorkspacePreference(() => {
      setPreference(readWorkspacePreference());
    });
  }, []);

  if (!ready) {
    // Render nothing while the preference is read so the workspace never
    // flashes the wrong surface on first paint.
    return <div className="min-h-[100dvh] bg-[#F8F9FA]" />;
  }

  if (preference === 'desktop') {
    // The user explicitly asked for the full CRM, so hand the route over to
    // the equivalent desktop surface instead of trapping them on a static
    // placeholder. The phone can always come back through the launcher.
    const desktopTarget = mapMobilePathToDesktop(location.pathname) ?? '/';
    return <Navigate to={desktopTarget} replace />;
  }

  return <>{children}</>;
};

/**
 * A non-intrusive affordance rendered on the desktop CRM when the viewport is
 * narrower than the mobile breakpoint.
 *
 * It is hidden on every viewport `>= 768px`, so desktop users never see it,
 * and it deep-links into the equivalent mobile URL when it is tapped (for
 * example `/leads?view=abc` → `/m/people/lead/abc`).
 *
 * It stays visible on desktop routes below the breakpoint even when the user
 * switched to the full CRM — that button is their only way back to `/m`.
 *
 * It only exists for a signed-in user: the signed-out landing page must stay
 * clean.
 */
export const MobileWorkspaceLauncher: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(isMobileViewport());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (!visible) return null;

  // The launcher belongs to a signed-in workspace only — never on the
  // signed-out landing page.
  if (!user) return null;

  // Inside the mobile workspace (or on the sign-in screen) the launcher would
  // be a duplicate of the workspace's own navigation.
  if (isMobileWorkspacePath(location.pathname)) return null;
  if (location.pathname === '/auth') return null;

  const target =
    mapDesktopPathToMobile(location.pathname, location.search) ?? `${MOBILE_ROOT}/today`;

  return (
    <button
      type="button"
      onClick={() => {
        writeWorkspacePreference('mobile');
        navigate(target);
      }}
      className="fixed bottom-4 right-4 z-40 min-h-[44px] px-4 rounded-full bg-[#1A1A2E] text-white text-sm font-semibold shadow-lg flex items-center gap-2"
    >
      <Smartphone className="w-4 h-4" />
      <span className="whitespace-nowrap">Switch to Mobile workspace</span>
    </button>
  );
};

/**
 * Sends a phone-sized viewport to the mobile workspace when the desktop URL
 * has a mobile equivalent.
 *
 * Guard rails:
 *  - never on `>= 768px`,
 *  - never when the user explicitly chose the full CRM
 *    (`mm_workspace_pref_v1 === 'desktop'`),
 *  - never inside `/m` (so it can never loop),
 *  - never on the sign-in screen.
 */
export const DesktopToMobileAutoRouter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isMobileViewport()) return;
    if (readWorkspacePreference() !== 'mobile') return;
    if (isMobileWorkspacePath(location.pathname)) return;
    if (location.pathname === '/auth') return;

    const target = mapDesktopPathToMobile(location.pathname, location.search);
    if (!target) return;

    navigate(target, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return null;
};
