import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Smartphone } from 'lucide-react';

import {
  MOBILE_ROOT,
  isMobileViewport,
  mapDesktopPathToMobile,
  readWorkspacePreference,
  subscribeWorkspacePreference,
  writeWorkspacePreference,
} from '@/mobile/routing/workspacePreference';
import { FullCrmHandoffPanel } from '@/mobile/components/FullCrmHandoffPanel';
import type { WorkspacePref } from '@/mobile/types/crmTypes';

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

  const returnToMobile = useCallback(() => {
    writeWorkspacePreference('mobile');
    setPreference('mobile');
  }, []);

  if (!ready) {
    // Render nothing while the preference is read so the workspace never
    // flashes the wrong surface on first paint.
    return <div className="min-h-[100dvh] bg-[#F8F9FA]" />;
  }

  if (preference === 'desktop') {
    return (
      <FullCrmHandoffPanel
        targetLabel="Full CRM Desktop Workspace"
        targetCode="crm/workspace"
        isWorkspaceSwitch
        onReturnToMobile={returnToMobile}
      />
    );
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
 */
export const MobileWorkspaceLauncher: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
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

  const target =
    mapDesktopPathToMobile(location.pathname, location.search) ?? `${MOBILE_ROOT}/today`;

  return (
    <button
      type="button"
      onClick={() => {
        writeWorkspacePreference('mobile');
        navigate(target);
      }}
      className="fixed bottom-4 right-4 z-[70] min-h-[44px] px-4 rounded-full bg-[#1A1A2E] text-white text-sm font-semibold shadow-lg flex items-center gap-2"
    >
      <Smartphone className="w-4 h-4" />
      <span className="whitespace-nowrap">Switch to Mobile workspace</span>
    </button>
  );
};
