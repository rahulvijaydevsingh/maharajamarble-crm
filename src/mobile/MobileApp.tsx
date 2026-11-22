import React, { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PhoneCall, X } from 'lucide-react';

import { useLeads } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useProfessionals } from '@/hooks/useProfessionals';

import { WeakSignalOutboxProvider } from '@/mobile/outbox/WeakSignalOutboxContext';
import { WorkspaceGate } from '@/mobile/routing/WorkspaceGate';
import {
  recordCallIntent,
  useCallIntentWatcher,
  type CallIntentTarget,
} from '@/mobile/hooks/useCallIntentWatcher';
import { buildMobilePath, parseMobilePath } from '@/mobile/routing/workspacePreference';
import { AttendancePromptGuard } from '@/mobile/components/AttendancePromptGuard';
import { formatPhoneDisplay } from '@/mobile/lib/format';

import {
  BottomTabBar,
  MobileErrorBoundary,
  NotificationsDrawer,
  PendingOutboxDrawer,
  PersistentTopBar,
  QuickAddSheet,
  VersionCheckBanner,
  WeakSignalSyncStrip,
} from '@/mobile/shell/MobileShell';

import { CallOutcomeSheet, TaskDetailSheet, TodayPage, WorkPage } from '@/mobile/screens/DailyWorkScreens';
import { MobileLeadForm } from '@/mobile/screens/LeadScreens';
import {
  EntityProfilePage,
  MobileCustomerEditForm,
  MobileProfessionalEditForm,
  PeoplePage,
} from '@/mobile/screens/PeopleScreens';
import { FullCrmHandoffView, MessagesPage, MorePage } from '@/mobile/screens/CommsAndMoreScreens';

import type { EntityKind, MainTab, MobileRoute } from '@/mobile/types/crmTypes';

/** Extracts the task id from a `/m/work/:taskId` URL. */
function workTaskIdFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'm' || segments[1] !== 'work') return null;
  return segments[2] ? decodeURIComponent(segments[2]) : null;
}

const MobileWorkspaceController: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { professionals } = useProfessionals();

  const [clockModalOpen, setClockModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [quickAddState, setQuickAddState] = useState<{
    open: boolean;
    mode: 'menu' | 'task' | 'note' | 'reminder';
    preselected?: { entityType: EntityKind; entityId: string };
  }>({ open: false, mode: 'menu' });
  const [callLogPickerOpen, setCallLogPickerOpen] = useState(false);

  const { callOutcomeTarget, openCallOutcome, dismissCallOutcome } =
    useCallIntentWatcher();

  const route = useMemo(
    () => parseMobilePath(location.pathname) ?? { name: 'today' as const },
    [location.pathname],
  );

  const onNavigate = useCallback(
    (next: MobileRoute) => {
      navigate(buildMobilePath(next));
    },
    [navigate],
  );

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const selectMainTab = useCallback(
    (tab: MainTab) => {
      navigate(buildMobilePath({ name: tab } as MobileRoute));
    },
    [navigate],
  );

  const isMainTab =
    route.name === 'today' ||
    route.name === 'work' ||
    route.name === 'people' ||
    route.name === 'more';

  const activeTab: MainTab = isMainTab ? (route.name as MainTab) : 'today';

  const workTaskId = route.name === 'work' ? workTaskIdFromPath(location.pathname) : null;

  const allContactsForCallLog = useMemo(
    () => [
      ...leads
        .filter((lead) => lead.status !== 'lost')
        .map((lead) => ({
          entityType: 'lead' as EntityKind,
          entityId: lead.id,
          name: lead.name,
          phone: lead.phone,
          sub: lead.id.slice(0, 8),
        })),
      ...customers.map((customer) => ({
        entityType: 'customer' as EntityKind,
        entityId: customer.id,
        name: customer.name,
        phone: customer.phone,
        sub: customer.id.slice(0, 8),
      })),
      ...professionals.map((professional) => ({
        entityType: 'professional' as EntityKind,
        entityId: professional.id,
        name: professional.name,
        phone: professional.phone,
        sub: professional.firm_name ?? professional.id.slice(0, 8),
      })),
    ],
    [leads, customers, professionals],
  );

  const handleOpenCallOutcome = useCallback(
    (target: CallIntentTarget) => {
      openCallOutcome(target);
    },
    [openCallOutcome],
  );

  /**
   * Handles a tap on a `tel:` link.
   *
   * It only records the intent to call — the outcome sheet opens once the
   * user comes back from the dialer, never before they leave. A manual "Log"
   * tap goes through `handleOpenCallOutcome` and opens the sheet directly.
   */
  const handleBeginCall = useCallback((target: CallIntentTarget) => {
    recordCallIntent(target);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA]">
      <div
        className={`w-full bg-[#F8F9FA] flex flex-col relative pb-[env(safe-area-inset-bottom)] ${
          route.name === 'messages' ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'
        }`}
      >
        {isMainTab && (
          <>
            <PersistentTopBar
              onOpenMessages={() => onNavigate({ name: 'messages' })}
              onOpenNotifications={() => setNotificationsOpen(true)}
            />
            <VersionCheckBanner />
            <WeakSignalSyncStrip onOpenOutbox={() => setOutboxOpen(true)} />
          </>
        )}

        <main
          className={`flex-1 ${isMainTab ? 'pb-24' : ''} ${
            route.name === 'messages' ? 'min-h-0 flex flex-col' : ''
          }`}
        >
          {route.name === 'today' && (
            <TodayPage
              onNavigate={onNavigate}
              onOpenClockModal={() => setClockModalOpen(true)}
              onOpenCallOutcome={handleOpenCallOutcome}
              onBeginCall={handleBeginCall}
              attendanceBanner={<AttendancePromptGuard />}
            />
          )}

          {route.name === 'work' && (
            <WorkPage
              initialFilter={route.initialFilter}
              onNavigate={onNavigate}
              onOpenCallOutcome={handleOpenCallOutcome}
              onBeginCall={handleBeginCall}
            />
          )}

          {route.name === 'people' && (
            <PeoplePage
              initialFilter={route.initialFilter}
              onNavigate={onNavigate}
              onOpenCallOutcome={handleOpenCallOutcome}
              onBeginCall={handleBeginCall}
            />
          )}

          {route.name === 'more' && (
            <MorePage
              onNavigate={onNavigate}
              onOpenClockModal={() => setClockModalOpen(true)}
              onOpenNotifications={() => setNotificationsOpen(true)}
              onOpenOutbox={() => setOutboxOpen(true)}
            />
          )}

          {route.name === 'messages' && (
            <MessagesPage initialThreadId={route.threadId} onBackToShell={goBack} />
          )}

          {route.name === 'lead_form' && (
            <MobileLeadForm
              key={`lead-form-${route.mode}-${route.leadId ?? 'new'}`}
              mode={route.mode}
              leadId={route.leadId}
              onCancel={goBack}
              onNavigate={onNavigate}
              onOpenQuickAddMode={(mode, leadId) =>
                setQuickAddState({
                  open: true,
                  mode,
                  preselected: { entityType: 'lead', entityId: leadId },
                })
              }
            />
          )}

          {route.name === 'entity_profile' && (
            <EntityProfilePage
              key={`entity-${route.entityType}-${route.entityId}`}
              entityType={route.entityType}
              entityId={route.entityId}
              initialTab={route.initialTab}
              onBack={goBack}
              onNavigate={onNavigate}
              onOpenCallOutcome={handleOpenCallOutcome}
              onBeginCall={handleBeginCall}
              onOpenQuickTask={(entityType, entityId) =>
                setQuickAddState({
                  open: true,
                  mode: 'task',
                  preselected: { entityType, entityId },
                })
              }
            />
          )}

          {route.name === 'customer_edit' && (
            <MobileCustomerEditForm
              key={`customer-edit-${route.customerId}`}
              customerId={route.customerId}
              onCancel={goBack}
              onSaved={goBack}
            />
          )}

          {route.name === 'professional_edit' && (
            <MobileProfessionalEditForm
              key={`professional-edit-${route.professionalId}`}
              professionalId={route.professionalId}
              onCancel={goBack}
              onSaved={goBack}
            />
          )}

          {route.name === 'full_crm_handoff' && (
            <FullCrmHandoffView
              targetLabel={route.targetLabel}
              targetCode={route.targetCode}
              onReturnToMobile={goBack}
            />
          )}
        </main>

        {isMainTab && (
          <BottomTabBar
            activeTab={activeTab}
            onSelectTab={selectMainTab}
            onOpenQuickAdd={() => setQuickAddState({ open: true, mode: 'menu' })}
          />
        )}

        <NotificationsDrawer
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onNavigate={onNavigate}
        />

        <PendingOutboxDrawer open={outboxOpen} onClose={() => setOutboxOpen(false)} />

        <QuickAddSheet
          open={quickAddState.open}
          initialMode={quickAddState.mode}
          preselectedEntity={quickAddState.preselected}
          onClose={() => setQuickAddState((previous) => ({ ...previous, open: false }))}
          onNavigate={onNavigate}
          onOpenCallLogPicker={() => setCallLogPickerOpen(true)}
        />

        {/* Contact picker used by the "Log a Call" quick action. */}
        {callLogPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Select Contact to Log Call"
              className="w-full bg-white rounded-t-[20px] max-h-[80dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
            >
              <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <h2 className="text-base font-bold text-[#1A1A2E]">Select Contact for Call Log</h2>
                <button
                  type="button"
                  onClick={() => setCallLogPickerOpen(false)}
                  aria-label="Close contact picker"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-[#F1F5F9]">
                {allContactsForCallLog.map((contact) => (
                  <button
                    key={`${contact.entityType}:${contact.entityId}`}
                    type="button"
                    onClick={() => {
                      setCallLogPickerOpen(false);
                      openCallOutcome({
                        entityType: contact.entityType,
                        entityId: contact.entityId,
                        entityName: contact.name,
                        phone: contact.phone,
                      });
                    }}
                    className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between text-left hover:bg-[#F8F9FA]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#1A1A2E] truncate">{contact.name}</div>
                      <div className="font-utility text-xs text-[#47464C] truncate">
                        {contact.sub} · {formatPhoneDisplay(contact.phone)}
                      </div>
                    </div>
                    <PhoneCall className="w-4 h-4 text-[#059669] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <CallOutcomeSheet
          open={Boolean(callOutcomeTarget)}
          openedAfterCall={Boolean(callOutcomeTarget?.openedAfterCall)}
          target={callOutcomeTarget}
          onDismiss={dismissCallOutcome}
        />

        {route.name === 'work' && workTaskId && (
          <TaskDetailSheet
            open
            taskId={workTaskId}
            onClose={() => navigate(buildMobilePath({ name: 'work' }))}
            onNavigate={onNavigate}
            onOpenCallOutcome={handleOpenCallOutcome}
            onBeginCall={handleBeginCall}
          />
        )}
      </div>
    </div>
  );
};

/**
 * The `/m` mobile workspace entry point.
 *
 * It is loaded lazily so the desktop bundle is never bloated by the mobile
 * screens (the repository had no code splitting before this release).
 */
export const MobileApp: React.FC = () => {
  return (
    <MobileErrorBoundary>
      <WeakSignalOutboxProvider>
        <WorkspaceGate>
          <MobileWorkspaceController />
        </WorkspaceGate>
      </WeakSignalOutboxProvider>
    </MobileErrorBoundary>
  );
};

export default MobileApp;
