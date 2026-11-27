import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PhoneCall, Search, X } from 'lucide-react';

import { useLeads } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useTasks } from '@/hooks/useTasks';
import { useReminders } from '@/hooks/useReminders';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { completeTaskWithRecurrence } from '@/mobile/lib/taskActions';
import { requireSafeStaffName } from '@/mobile/lib/staffAttribution';
import { supabase } from '@/integrations/supabase/client';

import { WeakSignalOutboxProvider } from '@/mobile/outbox/WeakSignalOutboxContext';
import { WorkspaceGate } from '@/mobile/routing/WorkspaceGate';
import {
  recordCallIntent,
  useCallIntentWatcher,
  type CallIntentTarget,
} from '@/mobile/hooks/useCallIntentWatcher';
import { buildMobilePath, parseMobilePath } from '@/mobile/routing/workspacePreference';
import { MobileControlPanelProvider } from '@/mobile/lib/controlPanelContext';
import { ClockInOutModal } from '@/components/hr/ClockInOutModal';
import { AttendancePromptGuard } from '@/mobile/components/AttendancePromptGuard';
import { formatPhoneDisplay, toLocalDateInputValue } from '@/mobile/lib/format';
import {
  resolveClockMode,
  type ClockMode,
} from '@/mobile/lib/clockMode';
import {
  CALL_LOG_PICKER_MAX_MATCHES,
  filterCallLogContacts,
  hasMoreCallLogMatches,
  type CallLogContact,
} from '@/mobile/lib/contactPicker';

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

import {
  CallOutcomeSheet,
  logTaskActivity,
  TaskDetailSheet,
  TodayPage,
  WorkPage,
} from '@/mobile/screens/DailyWorkScreens';
import { MobileLeadForm } from '@/mobile/screens/LeadScreens';
import {
  EntityProfilePage,
  MobileCustomerEditForm,
  MobileProfessionalEditForm,
  PeoplePage,
} from '@/mobile/screens/PeopleScreens';
import { FullCrmHandoffView, MessagesPage, MorePage } from '@/mobile/screens/CommsAndMoreScreens';

import type { ActivityType } from '@/constants/activityLogConstants';
import type { Json } from '@/integrations/supabase/types';
import type { EntityKind, MainTab, MobileRoute, PendingTaskCompletionHandoff } from '@/mobile/types/crmTypes';


/**
 * Completes the source task only after Convert / Mark Lost has saved.
 * The task-scoped reminder hook supplies the exact reminders to dismiss.
 */
const PendingTaskCompletionRunner: React.FC<{
  handoff: PendingTaskCompletionHandoff;
  onFinished: () => void;
}> = ({ handoff, onFinished }) => {
  const { updateTask, createNextRecurringInstance } = useTasks();
  const { reminders, dismissReminder, loading: remindersLoading } = useReminders('task', handoff.taskId);
  const { logActivity } = useLogActivity();
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const startedTaskIdRef = React.useRef<string | null>(null);
  const staffName = requireSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null);

  useEffect(() => {
    if (remindersLoading) return;
    if (startedTaskIdRef.current === handoff.taskId) return;
    startedTaskIdRef.current = handoff.taskId;
    void (async () => {
      try {
        const nowIso = new Date().toISOString();
        const result = await completeTaskWithRecurrence(
          { id: handoff.taskId, is_recurring: handoff.isRecurring },
          {
            updateTask: (taskId, updates) => updateTask(taskId, {
              ...updates,
              completion_outcome: handoff.outcome,
              completion_notes: handoff.notes || null,
              completion_status: handoff.completionStatus,
              attempt_count: handoff.attemptCount,
              last_attempt_at: nowIso,
              next_action_type: handoff.lifecycleAction === 'convert' ? 'convert_to_deal' : null,
              closed_at: nowIso,
              closed_by: user?.id ?? null,
              updated_by: staffName,
            }),
            createNextRecurringInstance,
            dismissReminder,
            reminders,
          },
        );
        if (!result.ok) {
          toast({
            title: 'Lead action saved; task needs attention',
            description: result.error ?? 'The related task could not be completed.',
            variant: 'destructive',
          });
          return;
        }
        await logTaskActivity(
          handoff.taskId,
          'outcome_recorded',
          {
            outcome: handoff.outcome,
            completion_status: handoff.completionStatus,
            notes: handoff.notes,
            attempt_count: handoff.attemptCount,
          } as Json,
          staffName,
          user?.id ?? null,
        );
        await logTaskActivity(
          handoff.taskId,
          'closed',
          {
            closed_by: user?.id ?? null,
            closed_at: nowIso,
            outcome: handoff.outcome,
          } as Json,
          staffName,
          user?.id ?? null,
        );
        try {
          await logActivity({
            lead_id: handoff.leadId,
            activity_type: 'task_outcome_recorded' as ActivityType,
            activity_category: 'task',
            title: `Task Closed: ${handoff.taskTitle} — ${handoff.outcomeLabel}`,
            description: handoff.notes || undefined,
            is_manual: false,
            metadata: {
              source: 'mobile_lead_lifecycle',
              lead_id: handoff.leadId,
              lifecycle_action: handoff.lifecycleAction,
              task_id: handoff.taskId,
              outcome: handoff.outcome,
              outcome_label: handoff.outcomeLabel,
              completion_status: handoff.completionStatus,
              attempt_count: handoff.attemptCount,
              notes: handoff.notes,
            },
            related_entity_type: 'task',
            related_entity_id: handoff.taskId,
          });
        } catch (activityError) {
          console.warn('[mobile lifecycle] Task completion activity could not be logged.', activityError);
        }
        toast({ title: 'Task completed', description: 'The required lead action was saved.' });
      } catch (error) {
        toast({
          title: 'Lead action saved; task needs attention',
          description: error instanceof Error ? error.message : 'The related task could not be completed.',
          variant: 'destructive',
        });
      } finally {
        onFinished();
      }
    })();
  }, [
    handoff.taskId, handoff.taskTitle, handoff.isRecurring, handoff.leadId, handoff.lifecycleAction,
    handoff.outcome, handoff.outcomeLabel, handoff.notes, handoff.completionStatus, handoff.attemptCount,
    remindersLoading, updateTask, createNextRecurringInstance, dismissReminder, reminders,
    logActivity, user?.id, staffName, toast, onFinished,
  ]);
  return null;
};

const MobileWorkspaceController: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { professionals } = useProfessionals();
  const { tasks, loading: tasksLoading } = useTasks();

  const [clockModalOpen, setClockModalOpen] = useState(false);
  const [clockMode, setClockMode] = useState<ClockMode>('clock-in');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [quickAddState, setQuickAddState] = useState<{
    open: boolean;
    mode: 'menu' | 'task' | 'note' | 'reminder';
    preselected?: { entityType: EntityKind; entityId: string };
  }>({ open: false, mode: 'menu' });
  const [callLogPickerOpen, setCallLogPickerOpen] = useState(false);
  const [callLogQuery, setCallLogQuery] = useState('');
  const [callOutcomeMode, setCallOutcomeMode] = useState<'call' | 'complete'>('call');
  const [pendingLeadLifecycle, setPendingLeadLifecycle] = useState<{ leadId: string; action: 'convert' | 'lost' } | null>(null);
  const [pendingTaskCompletion, setPendingTaskCompletion] = useState<{ handoff: PendingTaskCompletionHandoff; ready: boolean } | null>(null);

  const { callOutcomeTarget, openCallOutcome, dismissCallOutcome } =
    useCallIntentWatcher();

  const parsedRoute = useMemo(() => parseMobilePath(location.pathname), [location.pathname]);

  // An unknown `/m/...` URL is redirected to the Today screen instead of being
  // left in the address bar as an invalid deep link.
  useEffect(() => {
    if (parsedRoute === null) {
      navigate(buildMobilePath({ name: 'today' }), { replace: true });
    }
  }, [parsedRoute, navigate]);

  const route = useMemo<MobileRoute>(
    () => parsedRoute ?? ({ name: 'today' as const }),
    [parsedRoute],
  );

  useEffect(() => {
    if (
      pendingLeadLifecycle &&
      (route.name !== 'entity_profile' || route.entityType !== 'lead' || route.entityId !== pendingLeadLifecycle.leadId)
    ) {
      setPendingLeadLifecycle(null);
    }
    if (
      pendingTaskCompletion &&
      !pendingTaskCompletion.ready &&
      (route.name !== 'entity_profile' || route.entityType !== 'lead' || route.entityId !== pendingTaskCompletion.handoff.leadId)
    ) {
      setPendingTaskCompletion(null);
    }
  }, [route, pendingLeadLifecycle, pendingTaskCompletion]);

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

  const workTaskId = route.name === 'work' ? route.taskId ?? null : null;

  /**
   * Dynamic clock in / clock out.
   *
   * The desktop attendance screen (`src/pages/HRAttendance.tsx`) decides the
   * mode from today's `attendance_records` row. The mobile workspace reads the
   * same row so the Today / More buttons always offer the half of the pair the
   * user still needs.
   */
  const refreshClockMode = useCallback(async () => {
    if (!user?.id) {
      setClockMode('clock-in');
      return;
    }
    try {
      const today = toLocalDateInputValue(new Date().toISOString());
      const { data } = await supabase
        .from('attendance_records')
        .select('clock_in, clock_out')
        .eq('staff_id', user.id)
        .eq('date', today)
        .maybeSingle();

      setClockMode(
        resolveClockMode(
          (data ?? null) as { clock_in?: string | null; clock_out?: string | null } | null,
        ),
      );
    } catch {
      // A failed lookup must never block the attendance action — fall back to
      // the safe "clock in" mode.
      setClockMode('clock-in');
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshClockMode();
  }, [refreshClockMode]);

  /**
   * A deep link to a task that no longer exists must not leave the user on an
   * empty sheet — bounce back to the work list.
   */
  useEffect(() => {
    if (!workTaskId) return;
    if (tasksLoading) return;
    if (tasks.some((task) => task.id === workTaskId)) return;

    toast({
      title: 'Task not found',
      description: 'This task is no longer available.',
      variant: 'destructive',
    });
    navigate(buildMobilePath({ name: 'work' }), { replace: true });
  }, [navigate, tasks, tasksLoading, toast, workTaskId]);

  const allContactsForCallLog = useMemo<CallLogContact[]>(
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

  const visibleCallLogContacts = useMemo(
    () => filterCallLogContacts(allContactsForCallLog, callLogQuery, CALL_LOG_PICKER_MAX_MATCHES),
    [allContactsForCallLog, callLogQuery],
  );

  const callLogMatchesTruncated = useMemo(
    () => hasMoreCallLogMatches(allContactsForCallLog, callLogQuery, CALL_LOG_PICKER_MAX_MATCHES),
    [allContactsForCallLog, callLogQuery],
  );

  const handleOpenCallOutcome = useCallback(
    (target: CallIntentTarget) => {
      setCallOutcomeMode('call');
      openCallOutcome(target);
    },
    [openCallOutcome],
  );

  const handleOpenCompletionSheet = useCallback(
    (target: CallIntentTarget) => {
      setCallOutcomeMode('complete');
      openCallOutcome(target);
    },
    [openCallOutcome],
  );

  const handleTaskClosed = useCallback((closedTaskId: string) => {
    if (route.name === 'work' && route.taskId === closedTaskId) {
      navigate(buildMobilePath({ name: 'work' }));
    }
  }, [route, navigate]);

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

  const handleLeadLifecycleAction = useCallback((action: 'convert' | 'lost', leadId: string, handoff?: PendingTaskCompletionHandoff) => {
    setPendingLeadLifecycle({ leadId, action });
    setPendingTaskCompletion(handoff ? { handoff, ready: false } : null);
    navigate(buildMobilePath({ name: 'entity_profile', entityType: 'lead', entityId: leadId, initialTab: 'overview' }));
  }, [navigate]);

  const handleLeadActionHandled = useCallback(() => {
    setPendingLeadLifecycle(null);
  }, []);

  const handleLeadLifecycleSaved = useCallback(() => {
    setPendingTaskCompletion((current) => current ? { ...current, ready: true } : null);
  }, []);

  const handleLeadLifecycleCancelled = useCallback(() => setPendingTaskCompletion(null), []);
  const handlePendingTaskCompletionFinished = useCallback(() => setPendingTaskCompletion(null), []);

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
              clockMode={clockMode}
              onOpenCallOutcome={handleOpenCallOutcome}
              onOpenCompletionSheet={handleOpenCompletionSheet}
              onBeginCall={handleBeginCall}
              attendanceBanner={<AttendancePromptGuard />}
            />
          )}

          {route.name === 'work' && (
            <WorkPage
              initialFilter={route.initialFilter}
              onNavigate={onNavigate}
              onOpenCallOutcome={handleOpenCallOutcome}
              onOpenCompletionSheet={handleOpenCompletionSheet}
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
              clockMode={clockMode}
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
              onBeginCall={handleBeginCall}
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
              excludeTaskId={
                route.entityType === 'lead' && pendingTaskCompletion?.handoff.leadId === route.entityId
                  ? pendingTaskCompletion.handoff.taskId
                  : null
              }
              onBack={goBack}
              onNavigate={onNavigate}
              onOpenCallOutcome={handleOpenCallOutcome}
              onOpenCompletionSheet={handleOpenCompletionSheet}
              initialLeadAction={pendingLeadLifecycle?.leadId === route.entityId ? pendingLeadLifecycle.action : null}
              onLeadActionHandled={handleLeadActionHandled}
              onLeadLifecycleSaved={handleLeadLifecycleSaved}
              onLeadLifecycleCancelled={handleLeadLifecycleCancelled}
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

        {/* The drawers and sheets are only mounted while they are open — a
            closed modal must not keep its subscriptions alive. */}
        {notificationsOpen ? (
          <NotificationsDrawer
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            onNavigate={onNavigate}
          />
        ) : null}

        {outboxOpen ? (
          <PendingOutboxDrawer open={outboxOpen} onClose={() => setOutboxOpen(false)} />
        ) : null}

        {quickAddState.open ? (
          <QuickAddSheet
            open={quickAddState.open}
            initialMode={quickAddState.mode}
            preselectedEntity={quickAddState.preselected}
            onClose={() => setQuickAddState((previous) => ({ ...previous, open: false }))}
            onNavigate={onNavigate}
            onOpenCallLogPicker={() => setCallLogPickerOpen(true)}
          />
        ) : null}

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
              <div className="p-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FA] px-3">
                  <Search className="w-4 h-4 text-[#47464C] shrink-0" />
                  <input
                    type="search"
                    value={callLogQuery}
                    onChange={(event) => setCallLogQuery(event.target.value)}
                    placeholder="Search name, phone or firm"
                    aria-label="Search contacts for call log"
                    className="flex-1 bg-transparent py-3 text-[#1A1A2E] outline-none placeholder:text-[#8A8A93] text-base"
                  />
                </div>
                {callLogMatchesTruncated && (
                  <p className="mt-2 text-xs text-[#47464C]">
                    Showing the first {CALL_LOG_PICKER_MAX_MATCHES} matches — refine your search to see more.
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-[#F1F5F9]">
                {visibleCallLogContacts.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-[#47464C]">
                    No contacts match “{callLogQuery}”.
                  </p>
                ) : (
                  visibleCallLogContacts.map((contact) => (
                    <button
                      key={`${contact.entityType}:${contact.entityId}`}
                      type="button"
                      onClick={() => {
                        setCallLogPickerOpen(false);
                        setCallLogQuery('');
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
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* The task detail sheet is mounted BEFORE the call outcome sheet, so
            "Log Call" opened from `/m/work/:taskId` always stacks ON TOP of
            the task sheet instead of opening behind it. */}
        {route.name === 'work' && workTaskId && (
          <TaskDetailSheet
            open
            taskId={workTaskId}
            onClose={() => navigate(buildMobilePath({ name: 'work' }))}
            onNavigate={onNavigate}
            onOpenCallOutcome={handleOpenCallOutcome}
            onOpenCompletionSheet={handleOpenCompletionSheet}
            onBeginCall={handleBeginCall}
          />
        )}

        {pendingTaskCompletion?.ready ? (
          <PendingTaskCompletionRunner handoff={pendingTaskCompletion.handoff} onFinished={handlePendingTaskCompletionFinished} />
        ) : null}

        {callOutcomeTarget ? (
          <CallOutcomeSheet
            open={Boolean(callOutcomeTarget)}
            mode={callOutcomeMode}
            onLeadLifecycleAction={handleLeadLifecycleAction}
            onTaskClosed={handleTaskClosed}
            openedAfterCall={Boolean(callOutcomeTarget?.openedAfterCall)}
            target={callOutcomeTarget}
            onDismiss={() => {
              setCallOutcomeMode('call');
              dismissCallOutcome();
            }}
          />
        ) : null}

        {/* The attendance clock — the live desktop modal, mounted in the
            mobile workspace so the field user can clock in AND clock out. */}
        <ClockInOutModal
          open={clockModalOpen}
          onOpenChange={setClockModalOpen}
          mode={clockMode}
          onSuccess={() => {
            setClockModalOpen(false);
            void refreshClockMode();
          }}
        />
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
        {/* The Control Panel settings are fetched once for the whole tree. */}
        <MobileControlPanelProvider>
          <WorkspaceGate>
            <MobileWorkspaceController />
          </WorkspaceGate>
        </MobileControlPanelProvider>
      </WeakSignalOutboxProvider>
    </MobileErrorBoundary>
  );
};

export default MobileApp;
