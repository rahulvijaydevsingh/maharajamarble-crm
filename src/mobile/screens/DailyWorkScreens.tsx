/**
 * Mobile workspace — daily work screens.
 *
 * Ports the AI Studio prototype's `TodayPage`, `WorkPage`, `TaskDetailSheet` and
 * `CallOutcomeSheet` onto the live Supabase-backed CRM.
 *
 * Live data only:
 *  - tasks come from `useTasks()` and are mapped with `toMobileTask`,
 *  - the visible task universe is filtered with `isTaskActiveAndNotOrphan`
 *    (the byte-for-byte copy of `src/pages/Tasks.tsx:116-118`), so Customer and
 *    Professional tasks stay visible while deleted-lead orphans, soft-deleted
 *    tasks and cancelled tasks never show up,
 *  - task types and configured completion outcomes come from the live Control Panel;
 *    completion outcomes fall back to the shared six-option constant while the
 *    configured field has no active values, and `KIT*` task types are excluded,
 *  - task reschedules use `useTasks().updateTask()`, whose canonical reminder
 *    mirror DELETEs and INSERTs one task-scoped row with `is_dismissed=false`.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  PhoneCall,
  Repeat,
  RotateCcw,
  User,
  X,
  XCircle,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';

import { useAuth } from '@/contexts/AuthContext';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useMobileControlPanel } from '@/mobile/lib/controlPanelContext';
import { useWeakSignalOutbox } from '@/mobile/outbox/WeakSignalOutboxContext';
import { useToast } from '@/hooks/use-toast';
import { useCustomers } from '@/hooks/useCustomers';
import { useLeads } from '@/hooks/useLeads';
import { usePermissions } from '@/hooks/usePermissions';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useReminders } from '@/hooks/useReminders';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useTasks } from '@/hooks/useTasks';
import { useActiveStaffOptions } from '@/hooks/useActiveStaff';

import { normalizePhone10 } from '@/lib/phone';
import {
  isProfessionalDesignation,
  resolveProfessionalForProfessionalLead,
  type ProfessionalLeadCandidate,
} from '@/lib/professionalResolver';
import { getRescheduleReasonSuggestions, OUTCOME_OPTIONS } from '@/constants/taskConstants';
import type { ActivityType } from '@/constants/activityLogConstants';

import { EntityBadge, StatusBadge } from '@/mobile/shell/MobileShell';
import {
  buildMapsUrl,
  buildTelUrl,
  buildWhatsAppUrl,
  combineDateAndTime,
  formatDateTimeInputDisplay,
  formatPhoneDisplay,
  formatShortDateTime,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/mobile/lib/format';
import { toMobileTask } from '@/mobile/lib/mappers';
import { isSafeStaffName, requireSafeStaffName } from '@/mobile/lib/staffAttribution';
import { clockModeLabel, type ClockMode } from '@/mobile/lib/clockMode';
import {
  canUseTaskScopeToggle,
  filterTasksByScope,
  getTaskUrgency,
  isTaskActiveAndNotOrphan,
  isTaskCancelledForBin,
  sortTasksByUrgency,
  taskTypeLabel,
  type TaskScope,
} from '@/mobile/lib/tasks';
import {
  buildFollowUpTaskPayload,
  cancelTaskWithCleanup,
  completeTaskWithRecurrence,
  createFollowUpTaskOnce,
  getDefaultFollowUpTaskTitle,
  hasValidTaskReschedule,
  isLeadOnlyOpenNonRecurringTask,
  type TaskActionDeps,
} from '@/mobile/lib/taskActions';

import type { Customer as LiveCustomer } from '@/hooks/useCustomers';
import type { Lead as LiveLead } from '@/hooks/useLeads';
import type { Professional as LiveProfessional } from '@/hooks/useProfessionals';
import type { TaskInsert } from '@/hooks/useTasks';
import type { Json } from '@/integrations/supabase/types';
import type {
  CallOutcomeAction,
  CallOutcomeValue,
  CrmTask,
  EntityKind,
  MobileRoute,
  WorkFilter,
} from '@/mobile/types/crmTypes';

/* -------------------------------------------------------------------------- */
/* Shared types                                                               */
/* -------------------------------------------------------------------------- */

/** The target a call is placed against (or logged against). */
interface MobileCallTarget {
  entityType: EntityKind;
  entityId: string;
  entityName: string;
  phone: string;
  taskId?: string | null;
}

/** Everything a task card needs to know about the person it belongs to. */
interface TaskEntityInfo {
  entityType: EntityKind;
  entityId: string;
  name: string;
  /** Raw phone exactly as stored. */
  phone: string;
  /** Normalised 10-digit mobile, or `null` when the number is not usable. */
  phone10: string | null;
  location: string | null;
  plusCode: string | null;
  /** The specific role shown on the entity badge ("Architect", "Homeowner"…). */
  role: string;
}

type OptionLabelFn = (moduleName: string, fieldName: string, value: string) => string;

const TASK_STATUS_COMPLETED = 'Completed';
const TASK_STATUS_CANCELLED = 'Cancelled';
const TASK_STATUS_PENDING = 'Pending';

const GRID_COLS = ['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'];

/**
 * How many rows a long list renders before the user asks for more.
 *
 * The mobile lists can run into the hundreds of rows — rendering all of them
 * at once is slow on a phone, so the list is windowed and the user reveals
 * the next chunk with "Show more".
 */
const LIST_WINDOW_CHUNK = 40;

/** A task that still needs work — neither completed nor cancelled. */
function isOpenTask(task: CrmTask): boolean {
  return task.status !== TASK_STATUS_COMPLETED && task.status !== TASK_STATUS_CANCELLED;
}

/**
 * Records an event on a task's own trail (`task_activity_log`) — the table
 * the desktop completion dialog writes to.
 *
 * The entry is informational: a failure is swallowed, because a task write
 * must never be blocked by the activity trail.
 */
async function logTaskActivity(
  taskId: string,
  eventType: string,
  metadata: Json,
  staffName: string,
  userId?: string | null,
): Promise<void> {
  try {
    const { error } = await supabase.from('task_activity_log').insert({
      task_id: taskId,
      event_type: eventType,
      user_id: userId ?? null,
      user_name: staffName,
      metadata,
      notes: null,
    });
    if (error) {
      // The activity trail is informational — never block the task write.
      console.warn('[mobile/logTaskActivity] Could not record the task event:', error.message);
    }
  } catch {
    // The activity trail is informational — never block the task write.
  }
}

/** Local wall-clock ISO for a `YYYY-MM-DD` + `HH:MM` pair. */
function localIsoFromInputs(dateStr: string, timeStr: string): string {
  const parsed = new Date(`${dateStr}T${timeStr}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/* -------------------------------------------------------------------------- */
/* Control Panel view (one hook instance per screen)                         */
/* -------------------------------------------------------------------------- */

interface ControlPanelView {
  /** Task types — Control Panel values, `KIT*` entries removed. */
  taskTypes: { value: string; label: string; isDefault: boolean }[];
  /** Call outcomes — the shared code-defined six-outcome vocabulary. */
  outcomes: { value: string; label: string }[];
  /** `value → label` map for the task types. */
  typeLabelMap: Record<string, string>;
  getOptionLabel: OptionLabelFn;
}

/**
 * Single entry point to the live Control Panel.
 *
 * `useMobileControlPanel()` keeps its own state, so it is called exactly once
 * per screen and everything the screen needs is derived from that one call.
 */
function useControlPanelView(): ControlPanelView {
  const { getFieldOptions, getOptionLabel } = useMobileControlPanel();

  const taskTypes = useMemo(() => {
    const controlPanel = getFieldOptions('tasks', 'type').filter(
      (option) => !option.value.startsWith('KIT'),
    );
    return controlPanel.map((option) => ({
      value: option.value,
      label: getOptionLabel('tasks', 'type', option.value) || option.label,
      isDefault: option.isDefault,
    }));
  }, [getFieldOptions, getOptionLabel]);

  /** Prefer configured outcomes; use the shared desktop vocabulary while the panel is empty. */
  const outcomes = useMemo(() => {
    const configured = getFieldOptions('tasks', 'completion_outcome');
    if (configured.length === 0) {
      return OUTCOME_OPTIONS.map((value) => ({ value, label: value }));
    }
    return configured.map((option) => ({
      value: option.value,
      label: getOptionLabel('tasks', 'completion_outcome', option.value) || option.label,
    }));
  }, [getFieldOptions, getOptionLabel]);

  const typeLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    taskTypes.forEach((option) => {
      map[option.value] = option.label;
    });
    return map;
  }, [taskTypes]);

  return { taskTypes, outcomes, typeLabelMap, getOptionLabel };
}

/* -------------------------------------------------------------------------- */
/* Entity resolution                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the professional profile that a lead represents.
 *
 * The canonical resolver from `@/lib/professionalResolver` is used — it matches
 * on an exact normalised phone, requires a canonical professional designation
 * and only resolves when exactly one candidate matches. There is no
 * `.limit(50)` table scan and no per-row lookup.
 */
function resolveLeadProfessional(
  designation: string | null | undefined,
  phone: string | null | undefined,
  candidates: ProfessionalLeadCandidate[],
  professionals: Map<string, LiveProfessional>,
): LiveProfessional | null {
  if (!isProfessionalDesignation(designation)) return null;

  const professionalId = resolveProfessionalForProfessionalLead(designation, phone, candidates);
  if (!professionalId) return null;

  return professionals.get(professionalId) ?? null;
}

/**
 * The role shown on an entity badge. A lead that is not a professional is a
 * homeowner; a professional is labelled with their professional type.
 */
function roleForLead(
  designation: string | null | undefined,
  professional: LiveProfessional | null,
  getOptionLabel: OptionLabelFn,
): string {
  if (professional?.professional_type) {
    const label = getOptionLabel(
      'professionals',
      'professional_type',
      professional.professional_type,
    );
    return label || professional.professional_type;
  }

  const normalized = (designation ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return 'Homeowner';
  if (normalized === 'owner' || normalized === 'family_member' || normalized === 'other') {
    return 'Homeowner';
  }

  const label = getOptionLabel('leads', 'designation', designation ?? '');
  return label || (designation as string);
}

/**
 * Builds the task → person resolver. Live rows win over the joined task
 * snapshot so the site address, the designation and the phone are current.
 */
function resolveTaskEntity(
  task: CrmTask,
  leads: Map<string, LiveLead>,
  customers: Map<string, LiveCustomer>,
  professionals: Map<string, LiveProfessional>,
  professionalCandidates: ProfessionalLeadCandidate[],
  getOptionLabel: OptionLabelFn,
): TaskEntityInfo {
  // A task that points at a lead is a lead task even when the joined lead
  // snapshot is missing — the snapshot is only a convenience.
  if (task.lead_id) {
    const liveLead = leads.get(task.lead_id) ?? null;
    const designation = liveLead?.designation ?? task.lead?.designation ?? '';
    const phone = liveLead?.phone ?? task.lead?.phone ?? '';
    const professional = resolveLeadProfessional(
      designation,
      phone,
      professionalCandidates,
      professionals,
    );

    return {
      entityType: 'lead',
      entityId: task.lead_id,
      name: liveLead?.name || task.lead?.full_name || 'Lead',
      phone,
      phone10: normalizePhone10(phone),
      location: liveLead?.site_location ?? task.lead?.site_location ?? null,
      plusCode: liveLead?.site_plus_code ?? null,
      role: roleForLead(designation, professional, getOptionLabel),
    };
  }

  if (task.customer_id) {
    const customer = customers.get(task.customer_id) ?? null;
    const phone = customer?.phone ?? '';
    return {
      entityType: 'customer',
      entityId: task.customer_id,
      name: customer?.name || 'Customer',
      phone,
      phone10: normalizePhone10(phone),
      location: customer?.address ?? null,
      plusCode: customer?.site_plus_code ?? null,
      role: customer?.profession?.trim() || customer?.customer_type?.trim() || 'Customer',
    };
  }

  if (task.professional_id) {
    const professional = professionals.get(task.professional_id) ?? null;
    const phone = professional?.phone ?? '';
    const type = professional?.professional_type ?? '';
    return {
      entityType: 'professional',
      entityId: task.professional_id,
      name: professional?.name || 'Professional',
      phone,
      phone10: normalizePhone10(phone),
      location: professional?.address ?? null,
      plusCode: professional?.site_plus_code ?? null,
      role: type
        ? getOptionLabel('professionals', 'professional_type', type) || type
        : 'Professional',
    };
  }

  return {
    entityType: 'lead',
    entityId: task.lead_id ?? '',
    name: 'Unassigned Task',
    phone: '',
    phone10: null,
    location: null,
    plusCode: null,
    role: 'Follow-up',
  };
}

/** Hook wrapper so every screen shares one resolver instance. */
function useTaskEntityResolver(getOptionLabel: OptionLabelFn): (task: CrmTask) => TaskEntityInfo {
  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { professionals } = useProfessionals();

  // The lists are turned into Maps once: the resolver runs for every task in
  // the list, so an array `.find()` per task made the screen O(tasks × rows).
  const leadById = useMemo(() => {
    const map = new Map<string, LiveLead>();
    leads.forEach((lead) => map.set(lead.id, lead));
    return map;
  }, [leads]);

  const customerById = useMemo(() => {
    const map = new Map<string, LiveCustomer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const professionalById = useMemo(() => {
    const map = new Map<string, LiveProfessional>();
    professionals.forEach((professional) => map.set(professional.id, professional));
    return map;
  }, [professionals]);

  // The candidate list is built once — it used to be rebuilt for every task.
  const professionalCandidates = useMemo<ProfessionalLeadCandidate[]>(
    () =>
      professionals.map((professional) => ({
        id: professional.id,
        phone: professional.phone,
        alternate_phone: professional.alternate_phone,
        status: professional.status,
      })),
    [professionals],
  );

  return useMemo(
    () => (task: CrmTask) =>
      resolveTaskEntity(
        task,
        leadById,
        customerById,
        professionalById,
        professionalCandidates,
        getOptionLabel,
      ),
    [leadById, customerById, professionalById, professionalCandidates, getOptionLabel],
  );
}

/* -------------------------------------------------------------------------- */
/* Recent activity feed                                                        */
/* -------------------------------------------------------------------------- */

interface RecentActivityRow {
  id: string;
  title: string;
  user_name: string | null;
  activity_timestamp: string;
  lead_id: string | null;
  customer_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

/**
 * A short, live "recent activity" feed. The read is bounded to a handful of
 * rows and never throws — an empty feed simply renders an empty state.
 */
function useRecentActivity(limit: number): RecentActivityRow[] {
  const [rows, setRows] = useState<RecentActivityRow[]>([]);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user) return undefined;

    let cancelled = false;

    const load = async () => {
      try {
        // supabase-js does not throw on a database error — the `{ error }` has
        // to be inspected explicitly.
        const { data, error } = await supabase
          .from('activity_log')
          .select(
            'id,title,user_name,activity_timestamp,lead_id,customer_id,related_entity_type,related_entity_id',
          )
          .order('activity_timestamp', { ascending: false })
          .limit(limit);
        if (cancelled) return;
        if (error) {
          console.warn('[mobile activity] The recent activity feed failed.', error);
          setRows([]);
          return;
        }
        if (Array.isArray(data)) {
          setRows(data as RecentActivityRow[]);
        }
      } catch {
        /* the activity feed is a nice-to-have — never block the screen */
      }
    };

    void load();

    // The feed is refreshed whenever the app comes back to the foreground.
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [authLoading, user, limit]);

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Shared card action row                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The action row under every task card. Tiles are never truncated and every
 * tile is at least 48px tall.
 */
const CardActionRow: React.FC<{
  phone: string;
  phone10: string | null;
  location?: string | null;
  plusCode?: string | null;
  fourthLabel: 'Done' | 'Log';
  onCall: () => void;
  onFourthAction: () => void;
  /** Hidden for a role that may not write — a dead button is worse than none. */
  showFourthAction?: boolean;
}> = ({
  phone,
  phone10,
  location,
  plusCode,
  fourthLabel,
  onCall,
  onFourthAction,
  showFourthAction = true,
}) => {
  const hasPhone = Boolean(phone10);
  const hasLocation = Boolean(location && location.trim().length > 0);

  const tileCount =
    (hasPhone ? 2 : 0) + (hasLocation ? 1 : 0) + (showFourthAction ? 1 : 0);
  const gridClass = GRID_COLS[tileCount] ?? 'grid-cols-2';

  return (
    <div className={`grid gap-1.5 pt-2.5 border-t border-[#F1F5F9] ${gridClass}`}>
      {hasPhone ? (
        <a
          href={buildTelUrl(phone10 ?? phone)}
          onClick={onCall}
          className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#EEF2F6] text-[#1A1A2E] flex flex-col items-center justify-center gap-0.5 hover:bg-[#E2E8F0] active:scale-[0.98] transition-transform"
        >
          <Phone className="w-4 h-4 shrink-0" />
          <span className="font-utility text-[11px] font-semibold whitespace-nowrap">Call</span>
        </a>
      ) : (
        <div className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#F3F4F6] text-[#8A8A94] flex flex-col items-center justify-center gap-0.5">
          <Phone className="w-4 h-4 shrink-0" />
          <span className="font-utility text-[11px] font-semibold whitespace-nowrap">
            No phone
          </span>
        </div>
      )}

      {hasPhone ? (
        <a
          href={buildWhatsAppUrl(phone10 ?? phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#ECFDF5] text-[#059669] flex flex-col items-center justify-center gap-0.5 hover:bg-[#D1FAE5] active:scale-[0.98] transition-transform"
        >
          <MessageCircle className="w-4 h-4 shrink-0" />
          <span className="font-utility text-[11px] font-semibold whitespace-nowrap">WA</span>
        </a>
      ) : null}

      {hasLocation ? (
        <a
          href={buildMapsUrl(location, plusCode)}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] text-[#1A1A2E] flex flex-col items-center justify-center gap-0.5 hover:bg-[#EEF2F6] active:scale-[0.98] transition-transform"
        >
          <Navigation className="w-4 h-4 shrink-0" />
          <span className="font-utility text-[11px] font-semibold whitespace-nowrap">Maps</span>
        </a>
      ) : null}

      {showFourthAction ? (
        <button
          type="button"
          onClick={onFourthAction}
          className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#1A1A2E] text-white flex flex-col items-center justify-center gap-0.5 hover:bg-[#2E3148] active:scale-[0.98] transition-transform"
        >
          {fourthLabel === 'Done' ? (
            <Check className="w-4 h-4 shrink-0 text-[#C9A84C]" />
          ) : (
            <PhoneCall className="w-4 h-4 shrink-0 text-[#C9A84C]" />
          )}
          <span className="font-utility text-[11px] font-semibold whitespace-nowrap">
            {fourthLabel}
          </span>
        </button>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Shared task card                                                           */
/* -------------------------------------------------------------------------- */

const TaskCard: React.FC<{
  task: CrmTask;
  entity: TaskEntityInfo;
  typeLabel: string;
  onOpenProfile: () => void;
  onCall: () => void;
  onFourthAction: () => void;
  fourthLabel: 'Done' | 'Log';
  /** Long lists get `content-visibility:auto` so off-screen rows cost nothing. */
  virtualise?: boolean;
  /** Hidden for a role that may not write — a dead button is worse than none. */
  showFourthAction?: boolean;
}> = ({
  task,
  entity,
  typeLabel,
  onOpenProfile,
  onCall,
  onFourthAction,
  fourthLabel,
  virtualise = false,
  showFourthAction = true,
}) => {
  const urgency = getTaskUrgency(task);
  const badgeTone =
    urgency === 'overdue'
      ? 'overdue'
      : urgency === 'due_today'
        ? 'due_today'
        : urgency === 'completed'
          ? 'connected'
          : 'neutral';
  const badgeLabel =
    urgency === 'overdue'
      ? 'Overdue'
      : urgency === 'due_today'
        ? 'Due Today'
        : urgency === 'upcoming'
          ? 'Upcoming'
          : urgency === 'completed'
            ? 'Completed'
            : 'Cancelled';

  return (
    <article
      className={`bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-[0_1px_3px_rgba(26,26,46,0.05)] space-y-3 ${
        virtualise ? '[content-visibility:auto] [contain-intrinsic-size:auto_180px]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge tone={badgeTone} label={badgeLabel} />
          {task.is_recurring && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EEF2F6] text-[#1A1A2E] font-utility text-[11px] font-semibold whitespace-nowrap">
              <Repeat className="w-3 h-3 shrink-0" />
              <span>{task.recurrence_rule || 'Recurring'}</span>
            </span>
          )}
        </div>
        <span className="font-utility text-xs font-semibold text-[#47464C] whitespace-nowrap">
          {formatShortDateTime(task.due_at)}
        </span>
      </div>

      <button type="button" onClick={onOpenProfile} className="w-full text-left space-y-1.5 block">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[16px] font-bold text-[#1A1A2E] leading-snug">{entity.name}</span>
          <EntityBadge kind={entity.entityType} subLabel={entity.role} />
        </div>
        <p className="text-sm font-semibold text-[#191C1D] leading-snug">{task.title}</p>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-[#47464C]">
          <span>{typeLabel}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <User className="w-3 h-3 shrink-0" />
            <span>{task.assigned_to || 'Unassigned'}</span>
          </span>
        </div>
        {entity.location ? (
          <div className="flex items-start gap-1.5 text-xs text-[#47464C]">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#47464C]" />
            <span>{entity.location}</span>
          </div>
        ) : null}
      </button>

      <CardActionRow
        phone={entity.phone}
        phone10={entity.phone10}
        location={entity.location}
        plusCode={entity.plusCode}
        fourthLabel={fourthLabel}
        onCall={onCall}
        onFourthAction={onFourthAction}
        showFourthAction={showFourthAction}
      />
    </article>
  );
};

/* -------------------------------------------------------------------------- */
/* Shared task scope toggle                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The compact "Mine | Team" segmented toggle.
 *
 * Only the roles that may look at the whole team queue ever see it — the
 * caller decides that with `canUseTaskScopeToggle(role)`.
 */
const TaskScopeToggle: React.FC<{
  scope: TaskScope;
  onChange: (scope: TaskScope) => void;
}> = ({ scope, onChange }) => (
  <div
    role="group"
    aria-label="Task scope"
    className="inline-flex items-center gap-0.5 p-0.5 rounded-[10px] bg-[#F1F5F9] border border-[#E2E8F0]"
  >
    {(['mine', 'team'] as const).map((option) => {
      const active = scope === option;
      return (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={active}
          className={`min-h-[32px] px-2.5 rounded-[8px] font-utility text-[11px] font-bold uppercase tracking-wide transition-colors ${
            active ? 'bg-[#1A1A2E] text-white' : 'text-[#47464C]'
          }`}
        >
          {option === 'mine' ? 'Mine' : 'Team'}
        </button>
      );
    })}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Screen 1 — TodayPage                                                       */
/* -------------------------------------------------------------------------- */

export const TodayPage: React.FC<{
  onNavigate: (route: MobileRoute) => void;
  onOpenClockModal: () => void;
  onOpenCallOutcome: (target: MobileCallTarget) => void;
  onOpenCompletionSheet: (target: MobileCallTarget) => void;
  /**
   * Called when the user taps the Call tile. It only records the intent to
   * call; the sheet then opens once the user comes back from the dialer.
   * `onOpenCallOutcome` is reserved for a manual "Log" tap.
   */
  onBeginCall?: (target: MobileCallTarget) => void;
  attendanceBanner?: React.ReactNode;
  /**
   * Which half of the attendance pair the clock button offers. The parent
   * owns the attendance state — the page only renders the label.
   */
  clockMode?: ClockMode;
}> = ({
  onNavigate,
  onOpenClockModal,
  onOpenCallOutcome,
  onOpenCompletionSheet,
  onBeginCall,
  attendanceBanner,
  clockMode = 'clock-in',
}) => {
  const { tasks } = useTasks();
  const { isOnline, enqueue } = useWeakSignalOutbox();
  const { toast } = useToast();
  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { professionals } = useProfessionals();
  const { reminders, snoozeReminder, dismissReminder } = useReminders();
  const { profile, role } = useAuth();
  const { hasPermission } = usePermissions();
  const control = useControlPanelView();
  const resolveEntity = useTaskEntityResolver(control.getOptionLabel);
  const recentActivity = useRecentActivity(6);

  const remindersSectionRef = useRef<HTMLElement | null>(null);

  /** The queue scope — a field agent only ever sees their own tasks. */
  const [scope, setScope] = useState<TaskScope>('mine');
  const scopeToggleVisible = canUseTaskScopeToggle(role);
  /** Writing a task needs `tasks.edit` — a read-only role gets no CTAs. */
  const canEditTasks = hasPermission('tasks.edit');

  const mobileTasks = useMemo(() => tasks.map(toMobileTask), [tasks]);

  const scopedTasks = useMemo(
    () => filterTasksByScope(mobileTasks, scope, profile?.full_name),
    [mobileTasks, scope, profile?.full_name],
  );

  const activeTasks = useMemo(
    () => scopedTasks.filter((task) => isTaskActiveAndNotOrphan(task) && isOpenTask(task)),
    [scopedTasks],
  );

  const overdueTasks = useMemo(
    () => activeTasks.filter((task) => getTaskUrgency(task) === 'overdue'),
    [activeTasks],
  );

  const dueTodayTasks = useMemo(
    () => activeTasks.filter((task) => getTaskUrgency(task) === 'due_today'),
    [activeTasks],
  );

  const priorityFollowUps = useMemo(
    () => sortTasksByUrgency([...overdueTasks, ...dueTodayTasks]),
    [overdueTasks, dueTodayTasks],
  );

  const activeReminders = useMemo(
    () => reminders.filter((reminder) => !reminder.is_dismissed),
    [reminders],
  );

  // The lookups are Maps: the reminder list is rendered row by row and an
  // array `.find()` per row made the screen O(reminders × rows).
  const leadById = useMemo(() => {
    const map = new Map<string, LiveLead>();
    leads.forEach((lead) => map.set(lead.id, lead));
    return map;
  }, [leads]);

  const customerById = useMemo(() => {
    const map = new Map<string, LiveCustomer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const professionalById = useMemo(() => {
    const map = new Map<string, LiveProfessional>();
    professionals.forEach((professional) => map.set(professional.id, professional));
    return map;
  }, [professionals]);

  const professionalCandidates = useMemo<ProfessionalLeadCandidate[]>(
    () =>
      professionals.map((professional) => ({
        id: professional.id,
        phone: professional.phone,
        alternate_phone: professional.alternate_phone,
        status: professional.status,
      })),
    [professionals],
  );

  const reminderEntity = (
    entityType: string,
    entityId: string,
  ): { name: string; role: string; kind: EntityKind | null } => {
    if (entityType === 'lead') {
      const lead = leadById.get(entityId);
      if (!lead) return { name: 'Lead', role: 'Homeowner', kind: 'lead' };
      const professional = resolveLeadProfessional(
        lead.designation,
        lead.phone,
        professionalCandidates,
        professionalById,
      );
      return {
        name: lead.name,
        role: roleForLead(lead.designation, professional, control.getOptionLabel),
        kind: 'lead',
      };
    }
    if (entityType === 'customer') {
      const customer = customerById.get(entityId);
      return {
        name: customer?.name ?? 'Customer',
        role: customer?.profession?.trim() || customer?.customer_type?.trim() || 'Customer',
        kind: 'customer',
      };
    }
    if (entityType === 'professional') {
      const professional = professionals.find((item) => item.id === entityId);
      return {
        name: professional?.name ?? 'Professional',
        role: professional?.professional_type || 'Professional',
        kind: 'professional',
      };
    }
    return { name: 'Task', role: 'Follow-up', kind: null };
  };

  /** Every Done tap enters the completion sheet, never a silent status update. */
  const handleCompleteTask = (task: CrmTask) => {
    const entity = resolveEntity(task);
    onOpenCompletionSheet({
      entityType: entity.entityType,
      entityId: entity.entityId,
      entityName: entity.name,
      phone: entity.phone,
      taskId: task.id,
    });
  };

  return (
    <div className="p-4 space-y-5">
      {attendanceBanner}

      {/* Mine | Team — only for the roles that may see the whole team queue. */}
      {scopeToggleVisible ? (
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-[#1A1A2E]">Today</h1>
          <TaskScopeToggle scope={scope} onChange={setScope} />
        </div>
      ) : null}

      {/* 3 Tappable Status Pills */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onNavigate({ name: 'work', initialFilter: 'overdue' })}
          className="min-h-[48px] px-2.5 py-2 rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] flex flex-col items-start justify-center gap-0.5 text-left"
        >
          <div className="flex items-center gap-1 font-utility text-[11px] font-bold whitespace-nowrap">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Overdue</span>
          </div>
          <span className="font-utility text-lg font-bold leading-none">{overdueTasks.length}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ name: 'work', initialFilter: 'today' })}
          className="min-h-[48px] px-2.5 py-2 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex flex-col items-start justify-center gap-0.5 text-left"
        >
          <div className="flex items-center gap-1 font-utility text-[11px] font-bold whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Due Today</span>
          </div>
          <span className="font-utility text-lg font-bold leading-none">{dueTodayTasks.length}</span>
        </button>

        <button
          type="button"
          onClick={() =>
            remindersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          className="min-h-[48px] px-2.5 py-2 rounded-[12px] bg-[#EEF2F6] border border-[#E2E8F0] text-[#1A1A2E] flex flex-col items-start justify-center gap-0.5 text-left"
        >
          <div className="flex items-center gap-1 font-utility text-[11px] font-bold whitespace-nowrap">
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span>Reminders</span>
          </div>
          <span className="font-utility text-lg font-bold leading-none">
            {activeReminders.length}
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenClockModal}
        className="w-full min-h-[44px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-[#1A1A2E] text-sm font-semibold flex items-center justify-center gap-2"
      >
        <Clock className="w-4 h-4 shrink-0 text-[#1A1A2E]" />
        <span>{clockModeLabel(clockMode)}</span>
        <span className="px-2 py-0.5 rounded-full bg-[#EEF2F6] text-[#1A1A2E] font-utility text-[11px] font-bold uppercase tracking-wide whitespace-nowrap">
          {clockMode === 'clock-out' ? 'On shift' : 'Not started'}
        </span>
      </button>

      {/* Overdue-first Follow-Up Cards */}
      <section aria-labelledby="today-followups-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="today-followups-heading" className="text-base font-bold text-[#1A1A2E]">
            Priority Follow-Ups
          </h2>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'work', initialFilter: 'today' })}
            className="min-h-[44px] px-2 font-utility text-xs font-semibold text-[#1A1A2E] flex items-center gap-0.5 whitespace-nowrap"
          >
            <span>All Work</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {priorityFollowUps.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-5 text-center space-y-1.5">
            <CheckCircle2 className="w-7 h-7 text-[#059669] mx-auto" />
            <div className="text-sm font-semibold text-[#1A1A2E]">
              All today&apos;s follow-ups cleared
            </div>
            <p className="text-xs text-[#47464C]">Check Upcoming tasks in Work or tap + to add.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {priorityFollowUps.map((task) => {
              const entity = resolveEntity(task);
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  entity={entity}
                  typeLabel={taskTypeLabel(task.task_type, control.typeLabelMap)}
                  onOpenProfile={() =>
                    onNavigate({
                      name: 'entity_profile',
                      entityType: entity.entityType,
                      entityId: entity.entityId,
                    })
                  }
                  onCall={() => {
                    const target = {
                      entityType: entity.entityType,
                      entityId: entity.entityId,
                      entityName: entity.name,
                      phone: entity.phone,
                      taskId: task.id,
                    };
                    // The Call tile is a `tel:` anchor: it must only record the
                    // intent to call. The outcome sheet opens when the user
                    // comes back, never before they leave for the dialer.
                    if (onBeginCall) onBeginCall(target);
                    else onOpenCallOutcome(target);
                  }}
                  onFourthAction={() => handleCompleteTask(task)}
                  fourthLabel="Done"
                  showFourthAction={canEditTasks}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Reminder Alarm Cards */}
      <section
        ref={remindersSectionRef}
        aria-labelledby="upcoming-reminders-heading"
        className="space-y-3"
      >
        <h2 id="upcoming-reminders-heading" className="text-base font-bold text-[#1A1A2E]">
          Reminder Alarms
        </h2>

        {activeReminders.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 text-center text-xs text-[#47464C]">
            No pending reminder alarms.
          </div>
        ) : (
          <div className="space-y-2.5">
            {activeReminders.map((reminder) => {
              const info = reminderEntity(reminder.entity_type, reminder.entity_id);
              return (
                <div
                  key={reminder.id}
                  className="bg-white border border-[#E2E8F0] rounded-[12px] p-3.5 shadow-[0_1px_3px_rgba(26,26,46,0.05)] space-y-2.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-utility text-xs font-semibold text-[#D97706] flex items-center gap-1 whitespace-nowrap">
                        <Bell className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatShortDateTime(reminder.reminder_datetime)}</span>
                      </span>
                      {info.kind ? (
                        <EntityBadge kind={info.kind} subLabel={info.role} />
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EEF2F6] text-[#1A1A2E] font-utility text-[11px] font-bold uppercase tracking-wide whitespace-nowrap shrink-0">
                          <span>{info.role}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-[#1A1A2E] leading-snug">
                      {reminder.title}
                    </div>
                    <div className="text-xs font-medium text-[#47464C]">{info.name}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#F1F5F9]">
                    <button
                      type="button"
                      onClick={() => {
                        const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000);
                        if (!isOnline) {
                          enqueue({
                            kind: 'snooze_reminder',
                            label: `Snooze · ${reminder.title}`,
                            payload: {
                              reminderId: reminder.id,
                              snoozeUntil: snoozeUntil.toISOString(),
                            },
                          });
                          toast({
                            title: 'Saved offline',
                            description:
                              'This alarm is stored on the device and will sync automatically.',
                          });
                          return;
                        }
                        void snoozeReminder(reminder.id, snoozeUntil);
                      }}
                      className="min-h-[44px] rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FA] text-xs font-semibold text-[#1A1A2E] flex items-center justify-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>Snooze +1 hr</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isOnline) {
                          enqueue({
                            kind: 'done_reminder',
                            label: `Dismiss · ${reminder.title}`,
                            payload: { reminderId: reminder.id },
                          });
                          toast({
                            title: 'Saved offline',
                            description:
                              'This alarm is stored on the device and will sync automatically.',
                          });
                          return;
                        }
                        void dismissReminder(reminder.id);
                      }}
                      className="min-h-[44px] rounded-[10px] bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-semibold text-[#059669] flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Done</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Activity timeline */}
      <section aria-labelledby="recent-activity-heading" className="space-y-3 pb-2">
        <h2 id="recent-activity-heading" className="text-base font-bold text-[#1A1A2E]">
          Recent Activity
        </h2>
        {recentActivity.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 text-center text-xs text-[#47464C]">
            No recent activity recorded.
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-[12px] divide-y divide-[#F1F5F9]">
            {recentActivity.map((activity) => {
              const kind: EntityKind | null =
                activity.related_entity_type === 'customer' ||
                activity.related_entity_type === 'professional' ||
                activity.related_entity_type === 'lead'
                  ? (activity.related_entity_type as EntityKind)
                  : activity.customer_id
                    ? 'customer'
                    : activity.lead_id
                      ? 'lead'
                      : null;
              const entityId =
                activity.related_entity_id ??
                (kind === 'customer' ? activity.customer_id : activity.lead_id) ??
                '';

              return (
                <button
                  key={activity.id}
                  type="button"
                  disabled={!kind || !entityId}
                  onClick={() => {
                    if (!kind || !entityId) return;
                    onNavigate({
                      name: 'entity_profile',
                      entityType: kind,
                      entityId,
                    });
                  }}
                  className="w-full text-left p-3.5 flex items-start justify-between gap-3 hover:bg-[#F8F9FA] disabled:hover:bg-transparent"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-[#191C1D] leading-snug line-clamp-2">
                      {activity.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-[#47464C]">
                      <span>{activity.user_name || 'Staff'}</span>
                    </div>
                  </div>
                  <span className="font-utility text-[11px] text-[#47464C] whitespace-nowrap shrink-0">
                    {formatShortDateTime(activity.activity_timestamp)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Screen 2 — WorkPage                                                        */
/* -------------------------------------------------------------------------- */

export const WorkPage: React.FC<{
  initialFilter?: WorkFilter;
  onNavigate: (route: MobileRoute) => void;
  onOpenCallOutcome: (target: MobileCallTarget) => void;
  /** Records the intent to call; the sheet opens on return from the dialer. */
  onBeginCall?: (target: MobileCallTarget) => void;
  attendanceBanner?: React.ReactNode;
}> = ({ initialFilter = 'today', onNavigate, onOpenCallOutcome, onBeginCall, attendanceBanner }) => {
  const { tasks } = useTasks();
  const { profile, role } = useAuth();
  const control = useControlPanelView();
  const resolveEntity = useTaskEntityResolver(control.getOptionLabel);

  const [filter, setFilter] = useState<WorkFilter>(initialFilter);
  /** The queue scope — a field agent only ever sees their own tasks. */
  const [scope, setScope] = useState<TaskScope>('mine');
  const scopeToggleVisible = canUseTaskScopeToggle(role);
  /** The long list is windowed — the first chunk is rendered, the rest waits. */
  const [visibleCount, setVisibleCount] = useState(LIST_WINDOW_CHUNK);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    // A new queue starts from the top again.
    setVisibleCount(LIST_WINDOW_CHUNK);
  }, [filter, scope]);

  const mobileTasks = useMemo(() => tasks.map(toMobileTask), [tasks]);

  const scopedTasks = useMemo(
    () => filterTasksByScope(mobileTasks, scope, profile?.full_name),
    [mobileTasks, scope, profile?.full_name],
  );

  /** The orphan-safe universe: deleted-lead orphans and cancelled tasks are out. */
  const visibleTasks = useMemo(
    () => scopedTasks.filter((task) => isTaskActiveAndNotOrphan(task)),
    [scopedTasks],
  );

  /**
   * Cancelled tasks are excluded from the orphan-safe universe on purpose, so
   * the "Cancelled" view derives from the raw universe instead — otherwise
   * the chip could never show a row.
   */
  const cancelledTasks = useMemo(
    () => scopedTasks.filter((task) => isTaskCancelledForBin(task)),
    [scopedTasks],
  );

  const counts = useMemo(
    () => ({
      today: visibleTasks.filter((task) => {
        const urgency = getTaskUrgency(task);
        return isOpenTask(task) && (urgency === 'overdue' || urgency === 'due_today');
      }).length,
      overdue: visibleTasks.filter(
        (task) => isOpenTask(task) && getTaskUrgency(task) === 'overdue',
      ).length,
      upcoming: visibleTasks.filter(
        (task) => isOpenTask(task) && getTaskUrgency(task) === 'upcoming',
      ).length,
      completed: visibleTasks.filter((task) => task.status === TASK_STATUS_COMPLETED).length,
      cancelled: cancelledTasks.length,
    }),
    [cancelledTasks, visibleTasks],
  );

  const filteredTasks = useMemo(() => {
    const list = visibleTasks.filter((task) => {
      const urgency = getTaskUrgency(task);
      if (filter === 'today') {
        return isOpenTask(task) && (urgency === 'overdue' || urgency === 'due_today');
      }
      if (filter === 'overdue') return isOpenTask(task) && urgency === 'overdue';
      if (filter === 'upcoming') return isOpenTask(task) && urgency === 'upcoming';
      if (filter === 'completed') return task.status === TASK_STATUS_COMPLETED;
      return false;
    });
    if (filter === 'cancelled') {
      return sortTasksByUrgency(cancelledTasks);
    }
    return sortTasksByUrgency(list);
  }, [cancelledTasks, visibleTasks, filter]);

  // NO "All" chip per specification
  const filterTabs: { id: WorkFilter; label: string; count: number }[] = [
    { id: 'today', label: 'Today', count: counts.today },
    { id: 'overdue', label: 'Overdue', count: counts.overdue },
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ];

  return (
    <div className="p-4 space-y-4">
      {attendanceBanner}

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-[#1A1A2E]">Work Queue</h1>
        <div className="flex items-center gap-2">
          {scopeToggleVisible ? (
            <TaskScopeToggle scope={scope} onChange={setScope} />
          ) : null}
          <span className="font-utility text-xs font-semibold text-[#47464C] whitespace-nowrap">
            {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>
      </div>

      {/* Horizontally Scrollable Filter Chips (NO "All") */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {filterTabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[44px] px-3.5 rounded-full font-utility text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition-colors ${
                active
                  ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                  : 'bg-white text-[#1A1A2E] border-[#E2E8F0]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] ${
                  active ? 'bg-[#C9A84C] text-[#1A1A2E]' : 'bg-[#EEF2F6] text-[#1A1A2E]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Task Cards */}
      {filteredTasks.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-6 text-center space-y-1.5">
          <CheckCircle2 className="w-8 h-8 text-[#059669] mx-auto" />
          <div className="text-sm font-bold text-[#1A1A2E]">No {filter} tasks</div>
          <p className="text-xs text-[#47464C]">Switch filter chips above or tap + to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.slice(0, visibleCount).map((task) => {
            const entity = resolveEntity(task);
            return (
              <TaskCard
                key={task.id}
                task={task}
                entity={entity}
                typeLabel={taskTypeLabel(task.task_type, control.typeLabelMap)}
                virtualise
                // The task sheet is route-driven (`/m/work/:taskId`) — a local
                // modal could not be reached with the hardware Back button.
                onOpenProfile={() => onNavigate({ name: 'work', taskId: task.id })}
                onCall={() => {
                  const target = {
                    entityType: entity.entityType,
                    entityId: entity.entityId,
                    entityName: entity.name,
                    phone: entity.phone,
                    taskId: task.id,
                  };
                  // The Call tile is a `tel:` anchor: it must only record the
                  // intent to call. The outcome sheet opens when the user
                  // comes back, never before they leave for the dialer.
                  if (onBeginCall) onBeginCall(target);
                  else onOpenCallOutcome(target);
                }}
                onFourthAction={() =>
                  onOpenCallOutcome({
                    entityType: entity.entityType,
                    entityId: entity.entityId,
                    entityName: entity.name,
                    phone: entity.phone,
                    taskId: task.id,
                  })
                }
                fourthLabel="Log"
              />
            );
          })}
        </div>
      )}

      {/* The rest of the queue waits for the user to ask for it. */}
      {filteredTasks.length > visibleCount ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + LIST_WINDOW_CHUNK)}
          className="w-full min-h-[48px] rounded-[12px] border border-[#E2E8F0] bg-white text-[#1A1A2E] text-sm font-semibold"
        >
          Show more ({filteredTasks.length - visibleCount} left)
        </button>
      ) : null}

    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Task detail sheet (z-50)                                                   */
/* -------------------------------------------------------------------------- */

export const TaskDetailSheet: React.FC<{
  open: boolean;
  taskId: string | null;
  onClose: () => void;
  onNavigate: (route: MobileRoute) => void;
  onOpenCallOutcome: (target: MobileCallTarget) => void;
  onOpenCompletionSheet: (target: MobileCallTarget) => void;
  /** Records the intent to call; the sheet opens on return from the dialer. */
  onBeginCall?: (target: MobileCallTarget) => void;
}> = ({ open, taskId, onClose, onNavigate, onOpenCallOutcome, onOpenCompletionSheet, onBeginCall }) => {
  const { tasks, updateTask, createNextRecurringInstance } = useTasks();
  const { defaultRemindersEnabled } = useSystemSettings();
  const { dismissReminder, reminders } = useReminders(
    taskId ? 'task' : undefined,
    taskId ?? undefined,
  );
  const { profile, user } = useAuth();
  const { hasPermission } = usePermissions();
  const { logActivity } = useLogActivity();
  const { isOnline, enqueue } = useWeakSignalOutbox();
  const { toast } = useToast();
  const control = useControlPanelView();
  const resolveEntity = useTaskEntityResolver(control.getOptionLabel);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [busy, setBusy] = useState(false);
  /** The last failure of a sheet action — shown inline, the sheet stays open. */
  const [actionError, setActionError] = useState<string | null>(null);
  /** Writing a task needs `tasks.edit` — a read-only role gets no CTAs. */
  const canEditTasks = hasPermission('tasks.edit');

  const liveTask = useMemo(
    () => (taskId ? tasks.find((item) => item.id === taskId) ?? null : null),
    [tasks, taskId],
  );

  const task = useMemo(() => (liveTask ? toMobileTask(liveTask) : null), [liveTask]);

  const [dateStr, setDateStr] = useState(() => toLocalDateInputValue(task ? task.due_at : null));
  const [timeStr, setTimeStr] = useState(() => toLocalTimeInputValue(task ? task.due_at : null));
  const [reminderOn, setReminderOn] = useState<boolean>(defaultRemindersEnabled);

  useEffect(() => {
    if (!open || !task) return;
    setDateStr(toLocalDateInputValue(task.due_at));
    setTimeStr(toLocalTimeInputValue(task.due_at));
    // Existing task reschedules preserve that task's reminder setting.
    setReminderOn(task.reminder_enabled);
    setRescheduleReason('');
    setRescheduleOpen(false);
    setActionError(null);
  }, [open, task]);

  if (!open || !task) return null;

  const entity = resolveEntity(task);
  const urgency = getTaskUrgency(task);
  const typeLabel = taskTypeLabel(task.task_type, control.typeLabelMap);
  const staffName = requireSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null);

  /** The write dependencies shared by every task action in this sheet. */
  const taskActionDeps: TaskActionDeps = {
    updateTask,
    createNextRecurringInstance,
    dismissReminder,
    reminders,
    onError: (message: string) => setActionError(message),
  };

  /**
   * Records the reschedule on the task trail (`task_activity_log` — the table
   * the desktop completion dialog writes to) and on the entity timeline.
   */
  const recordReschedule = async (oldDueDate: string | null, newDueDate: string) => {
    await logTaskActivity(
      task.id,
      'rescheduled',
      {
        old_value: { due_date: oldDueDate, due_time: liveTask?.due_time ?? null },
        new_value: { due_date: newDueDate, due_time: timeStr },
        reason: rescheduleReason.trim(),
        reschedule_count: (liveTask?.reschedule_count ?? 0) + 1,
      },
      staffName,
      user?.id ?? null,
    );

    if (entity.entityType === 'lead' && entity.entityId) {
      await logActivity({
        lead_id: entity.entityId,
        activity_type: 'task_outcome_recorded' as ActivityType,
        activity_category: 'task',
        title: `Task Rescheduled: ${task.title} — ${rescheduleReason.trim()}`,
        description: `Moved to ${newDueDate}`,
        is_manual: false,
        metadata: { task_id: task.id, old_due_date: oldDueDate, new_due_date: newDueDate, reason: rescheduleReason.trim() },
        related_entity_type: 'task',
        related_entity_id: task.id,
      });
    } else if (entity.entityType === 'customer' && entity.entityId) {
      await logActivity({
        customer_id: entity.entityId,
        activity_type: 'task_outcome_recorded' as ActivityType,
        activity_category: 'task',
        title: `Task Rescheduled: ${task.title} — ${rescheduleReason.trim()}`,
        description: `Moved to ${newDueDate}`,
        is_manual: false,
        metadata: { task_id: task.id, old_due_date: oldDueDate, new_due_date: newDueDate, reason: rescheduleReason.trim() },
        related_entity_type: 'task',
        related_entity_id: task.id,
      });
    }
  };

  const handleReschedule = async () => {
    if (!liveTask) return;
    // A reschedule without a date is not a reschedule — the old due date
    // would silently be cleared.
    if (!hasValidTaskReschedule(rescheduleReason, dateStr)) {
      setActionError(!rescheduleReason.trim() ? 'Enter a reschedule reason before saving.' : 'Pick a date before saving the reschedule.');
      return;
    }
    setActionError(null);
    setBusy(true);
    try {
      const updates: Partial<TaskInsert> & { completed_at?: string | null } = {
        due_date: dateStr,
        due_time: timeStr,
        reminder: reminderOn,
        reschedule_reason: rescheduleReason.trim(),
        reschedule_count: (liveTask.reschedule_count ?? 0) + 1,
      };
      if (liveTask.status === TASK_STATUS_COMPLETED) {
        updates.status = TASK_STATUS_PENDING;
        updates.completed_at = null;
      }
      if (!isOnline) {
        // The device is offline — the write is parked and replayed later.
        enqueue({
          kind: 'task_action',
          label: `Reschedule task · ${task.title}`,
          payload: { taskId: task.id, updates },
        });
        toast({
          title: 'Saved offline',
          description: 'This update is stored on the device and will sync automatically.',
        });
        onClose();
        return;
      }

      // useTasks.updateTask owns the canonical task-scoped reminder mirror:
      // it DELETEs old rows and INSERTs one new row with is_dismissed=false.
      await updateTask(task.id, updates);
      await recordReschedule(liveTask.due_date ?? null, dateStr);
      onClose();
    } catch (error) {
      // The sheet stays open so the user can retry.
      setActionError(
        error instanceof Error
          ? error.message
          : 'The task could not be rescheduled. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (status: string) => {
    if (!liveTask) return;
    setActionError(null);
    setBusy(true);
    try {
      if (!isOnline) {
        enqueue({
          kind: 'task_action',
          label: `Update task · ${task.title}`,
          payload: { taskId: task.id, updates: { status } },
        });
        toast({
          title: 'Saved offline',
          description: 'This update is stored on the device and will sync automatically.',
        });
        onClose();
        return;
      }

      if (status === TASK_STATUS_COMPLETED) {
        const result = await completeTaskWithRecurrence(
          { id: task.id, is_recurring: task.is_recurring },
          taskActionDeps,
        );
        if (!result.ok) return;
      } else if (status === TASK_STATUS_CANCELLED) {
        const result = await cancelTaskWithCleanup(
          { id: task.id, is_recurring: task.is_recurring },
          taskActionDeps,
        );
        if (!result.ok) return;
      } else {
        await updateTask(task.id, { status });
      }
      onClose();
    } catch (error) {
      // The sheet stays open so the user can retry.
      setActionError(
        error instanceof Error
          ? error.message
          : 'The task could not be updated. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Task Details"
        className="w-full bg-white rounded-t-[20px] max-h-[90dvh] overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4"
      >
        <div className="w-10 h-1 rounded-full bg-[#E2E8F0] mx-auto" />

        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge
                tone={
                  urgency === 'overdue'
                    ? 'overdue'
                    : urgency === 'due_today'
                      ? 'due_today'
                      : urgency === 'completed'
                        ? 'connected'
                        : 'neutral'
                }
                label={
                  urgency === 'overdue'
                    ? 'Overdue'
                    : urgency === 'due_today'
                      ? 'Due Today'
                      : urgency === 'upcoming'
                        ? 'Upcoming'
                        : urgency === 'completed'
                          ? 'Completed'
                          : 'Cancelled'
                }
              />
              {task.is_recurring && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EEF2F6] text-[#1A1A2E] font-utility text-[11px] font-semibold whitespace-nowrap">
                  <Repeat className="w-3 h-3 shrink-0" />
                  <span>{task.recurrence_rule || 'Recurring'}</span>
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-[#1A1A2E] leading-snug pt-1">{task.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task details"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {actionError ? (
          <div
            role="alert"
            className="p-3 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-xs font-semibold"
          >
            {actionError}
          </div>
        ) : null}

        {task.description && (
          <p className="text-sm text-[#47464C] bg-[#F8F9FA] border border-[#E2E8F0] rounded-[12px] p-3">
            {task.description}
          </p>
        )}

        <div className="bg-[#F8F9FA] border border-[#E2E8F0] rounded-[12px] p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#47464C]">Task Type</span>
            <span className="font-semibold text-[#1A1A2E] text-right">{typeLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#47464C]">Scheduled For</span>
            <span className="font-utility font-semibold text-[#1A1A2E] whitespace-nowrap">
              {formatShortDateTime(task.due_at)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#47464C]">Assigned To</span>
            <span className="font-semibold text-[#1A1A2E] text-right">
              {task.assigned_to || 'Unassigned'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!entity.entityId) return;
            onNavigate({
              name: 'entity_profile',
              entityType: entity.entityType,
              entityId: entity.entityId,
            });
          }}
          className="w-full min-h-[54px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <EntityBadge kind={entity.entityType} subLabel={entity.role} />
            <div className="text-left min-w-0">
              <div className="text-sm font-bold text-[#1A1A2E] truncate">{entity.name}</div>
              <div className="font-utility text-xs text-[#47464C]">
                {formatPhoneDisplay(entity.phone)}
              </div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#47464C] shrink-0" />
        </button>

        {rescheduleOpen && (
          <div className="p-3.5 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0] space-y-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#1A1A2E]">Reschedule Reason *</div>
              <div className="flex flex-wrap gap-1.5">
                {getRescheduleReasonSuggestions('').map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setRescheduleReason(suggestion)} className="min-h-[44px] px-2.5 rounded-full border border-[#E2E8F0] bg-white text-xs font-medium text-[#1A1A2E]">
                    {suggestion}
                  </button>
                ))}
              </div>
              <textarea rows={2} value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} placeholder="Why is this task being rescheduled?" className="w-full min-h-[72px] p-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[#1A1A2E] mb-1">New Date</label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(event) => setDateStr(event.target.value)}
                  className="w-full min-h-[48px] px-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1A1A2E] mb-1">New Time</label>
                <input
                  type="time"
                  value={timeStr}
                  onChange={(event) => setTimeStr(event.target.value)}
                  className="w-full min-h-[48px] px-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base"
                />
              </div>
            </div>
            <label className="flex items-center justify-between min-h-[44px] px-3 rounded-[10px] bg-white border border-[#E2E8F0]">
              <span className="text-sm font-medium text-[#1A1A2E]">Set Reminder Alarm</span>
              <input
                type="checkbox"
                checked={reminderOn}
                onChange={(event) => setReminderOn(event.target.checked)}
                className="w-5 h-5 accent-[#1A1A2E]"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleReschedule()}
              className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base disabled:opacity-60"
            >
              Confirm Reschedule
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() =>
              onOpenCallOutcome({
                entityType: entity.entityType,
                entityId: entity.entityId,
                entityName: entity.name,
                phone: entity.phone,
                taskId: task.id,
              })
            }
            className="min-h-[48px] rounded-[12px] border-[1.5px] border-[#E2E8F0] bg-white text-sm font-semibold text-[#1A1A2E] flex items-center justify-center gap-1.5"
          >
            <PhoneCall className="w-4 h-4 shrink-0" />
            <span>Log Call</span>
          </button>

          {canEditTasks ? (
            <button
              type="button"
              onClick={() => setRescheduleOpen((value) => !value)}
              className="min-h-[48px] rounded-[12px] border-[1.5px] border-[#E2E8F0] bg-white text-sm font-semibold text-[#1A1A2E] flex items-center justify-center gap-1.5"
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Reschedule</span>
            </button>
          ) : (
            <span className="min-h-[48px] rounded-[12px] border-[1.5px] border-[#E2E8F0] bg-[#F8F9FA] text-sm font-semibold text-[#8A8A94] flex items-center justify-center gap-1.5">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Read only</span>
            </span>
          )}

          {canEditTasks ? (
            task.status === TASK_STATUS_COMPLETED ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStatus(TASK_STATUS_PENDING)}
                className="col-span-2 min-h-[48px] rounded-[12px] bg-[#1A1A2E] text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Reopen Task</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStatus(TASK_STATUS_CANCELLED)}
                  className="min-h-[48px] rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-sm font-semibold text-[#DC2626] flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>Cancel Task</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenCompletionSheet({ entityType: entity.entityType, entityId: entity.entityId, entityName: entity.name, phone: entity.phone, taskId: task.id })}
                  className="min-h-[48px] rounded-[12px] bg-[#C9A84C] text-sm font-semibold text-[#1A1A2E] flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Complete Task</span>
                </button>
              </>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Call outcome sheet (z-50)                                                  */
/* -------------------------------------------------------------------------- */

export const CallOutcomeSheet: React.FC<{
  open: boolean;
  mode?: 'call' | 'complete';
  openedAfterCall: boolean;
  target: MobileCallTarget | null;
  onDismiss: () => void;
  onLeadLifecycleAction?: (action: 'convert' | 'lost', leadId: string) => void;
}> = ({ open, mode = 'call', openedAfterCall, target, onDismiss, onLeadLifecycleAction }) => {
  const { tasks, updateTask, createNextRecurringInstance, addTask } = useTasks();
  const { options: activeStaffOptions } = useActiveStaffOptions();
  const { logActivity } = useLogActivity();
  const { defaultRemindersEnabled } = useSystemSettings();
  const { profile, user } = useAuth();
  const { hasPermission } = usePermissions();
  const control = useControlPanelView();

  const { dismissReminder, reminders } = useReminders(
    target?.taskId ? 'task' : undefined,
    target?.taskId ?? undefined,
  );

  /** Writing a task needs `tasks.edit` — a read-only role never writes one. */
  const canEditTasks = hasPermission('tasks.edit');

  /**
   * "Tomorrow 10 AM" — recomputed every time the sheet opens.
   *
   * It used to be computed once at mount, so a sheet opened after midnight
   * still pointed at yesterday.
   */
  const [defaultTomorrow, setDefaultTomorrow] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    return date.toISOString();
  });

  const [outcome, setOutcome] = useState<CallOutcomeValue>('');
  const [note, setNote] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [createAdHocFollowUp, setCreateAdHocFollowUp] = useState(false);
  const [nextStep, setNextStep] = useState<'create' | 'none' | 'convert' | 'lost'>('create');
  const [followUpTaskType, setFollowUpTaskType] = useState('');
  const [followUpAssignee, setFollowUpAssignee] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const followUpTitleTouchedRef = useRef(false);
  const followUpTaskIdRef = useRef<string | null>(null);
  // A call that is not attached to a task must never close the task by
  // accident — the default is "keep it open".
  const [taskAction, setTaskAction] = useState<CallOutcomeAction>('keep_open');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [snoozePreset, setSnoozePreset] = useState<'1h' | '4h' | 'tomorrow' | 'custom'>(
    'tomorrow',
  );
  const [dateStr, setDateStr] = useState(() => toLocalDateInputValue(defaultTomorrow));
  const [timeStr, setTimeStr] = useState(() => toLocalTimeInputValue(defaultTomorrow));
  const [reminderAlarm, setReminderAlarm] = useState<boolean>(defaultRemindersEnabled);
  const [busy, setBusy] = useState(false);
  const taskTypeOptions = control.taskTypes.filter((option) => !option.value.startsWith('KIT'));
  const defaultFollowUpOption = taskTypeOptions.find((option) => option.isDefault) ?? taskTypeOptions[0];
  const defaultFollowUpType = defaultFollowUpOption?.value ?? '';
  const defaultFollowUpLabel = defaultFollowUpOption?.label ?? '';
  const targetTask = target?.taskId ? tasks.find((item) => item.id === target.taskId) ?? null : null;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  /**
   * The sub-steps of a save that already succeeded.
   *
   * A retry after a failed `logActivity` must never run `updateTask` a second
   * time — the completed steps are remembered until the sheet is closed.
   */
  const completedStepsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    setDefaultTomorrow(date.toISOString());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setNote('');
    // The outcome is never preselected — the user has to say what happened.
    setOutcome('');
    setTaskAction(mode === 'complete' ? 'complete' : target?.taskId && canEditTasks ? 'reschedule' : 'keep_open');
    setRescheduleReason('');
    setCreateAdHocFollowUp(false);
    const initialLeadId = target?.entityType === 'lead'
      ? target.entityId
      : targetTask?.lead_id ?? (targetTask?.related_entity_type === 'lead' ? targetTask.related_entity_id : null);
    const requiresLeadNextStep = Boolean(
      targetTask && initialLeadId && isLeadOnlyOpenNonRecurringTask(targetTask, tasksRef.current, initialLeadId),
    );
    setNextStep(requiresLeadNextStep ? 'create' : 'none');
    setFollowUpTaskType(defaultFollowUpType);
    setFollowUpAssignee(staffName);
    setFollowUpTitle(defaultFollowUpLabel ? getDefaultFollowUpTaskTitle(defaultFollowUpLabel, target?.entityName ?? '') : '');
    followUpTitleTouchedRef.current = false;
    followUpTaskIdRef.current = null;
    setSnoozePreset('tomorrow');
    setDateStr(toLocalDateInputValue(defaultTomorrow));
    setTimeStr(toLocalTimeInputValue(defaultTomorrow));
    setReminderAlarm(
      mode === 'call' && targetTask
        ? (targetTask.reminder ?? defaultRemindersEnabled)
        : defaultRemindersEnabled,
    );
    setSaveError(null);
    completedStepsRef.current = new Set();
  }, [open, defaultTomorrow, defaultRemindersEnabled, target?.taskId, target?.entityType, target?.entityId, canEditTasks, mode, defaultFollowUpType, defaultFollowUpLabel, targetTask?.id, targetTask?.is_recurring, targetTask?.lead_id, targetTask?.related_entity_type, targetTask?.related_entity_id, targetTask?.reminder, staffName, target?.entityName]);

  if (!open || !target) return null;

  const scheduledIso = combineDateAndTime(dateStr, timeStr);
  const outcomeLabel =
    control.outcomes.find((option) => option.value === outcome)?.label ?? outcome;
  const staffName = requireSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null);
  const liveTask = targetTask;
  const safeStaffOptions = activeStaffOptions.filter((option) => isSafeStaffName(option.name));
  const assigneeOptions = safeStaffOptions.some((option) => option.name === staffName)
    ? safeStaffOptions
    : [{ id: 'current-staff', name: staffName, label: staffName }, ...safeStaffOptions];
  const linkedLeadId = target.entityType === 'lead'
    ? target.entityId
    : liveTask?.lead_id ?? (liveTask?.related_entity_type === 'lead' ? liveTask.related_entity_id : null);
  const leadOnlyOpenTask = Boolean(
    linkedLeadId && liveTask && isLeadOnlyOpenNonRecurringTask(liveTask, tasks, linkedLeadId),
  );
  const shouldCreateFollowUp = canEditTasks && (target.taskId
    ? taskAction === 'complete' && nextStep === 'create'
    : createAdHocFollowUp);

  const taskActions: { value: CallOutcomeAction; label: string }[] = [
    ...(mode === 'call' ? [{ value: 'keep_open' as const, label: 'Keep Open' }] : []),
    { value: 'reschedule', label: 'Reschedule' },
    { value: 'complete', label: 'Complete' },
    { value: 'cancel', label: 'Cancel' },
  ];

  const applyPreset = (preset: '1h' | '4h' | 'tomorrow' | 'custom') => {
    setSnoozePreset(preset);
    if (preset === '1h') {
      const date = new Date(Date.now() + 60 * 60 * 1000);
      setDateStr(toLocalDateInputValue(date.toISOString()));
      setTimeStr(toLocalTimeInputValue(date.toISOString()));
      if (!shouldCreateFollowUp) setTaskAction('reschedule');
    } else if (preset === '4h') {
      const date = new Date(Date.now() + 4 * 60 * 60 * 1000);
      setDateStr(toLocalDateInputValue(date.toISOString()));
      setTimeStr(toLocalTimeInputValue(date.toISOString()));
      if (!shouldCreateFollowUp) setTaskAction('reschedule');
    } else if (preset === 'tomorrow') {
      setDateStr(toLocalDateInputValue(defaultTomorrow));
      setTimeStr('10:00');
      if (!shouldCreateFollowUp) setTaskAction('reschedule');
    }
  };

  const handleSave = async () => {
    if (!target) return;
    // The outcome is never preselected — the user has to say what happened.
    if (!outcome) {
      setSaveError('Pick a call outcome before saving.');
      return;
    }
    if (target.taskId && canEditTasks && taskAction === 'complete' && leadOnlyOpenTask && !['create', 'convert', 'lost'].includes(nextStep)) {
      setSaveError('Choose a required next step before completing this lead task.');
      return;
    }
    if (shouldCreateFollowUp) {
      if (!followUpTaskType) { setSaveError('Choose a follow-up task type.'); return; }
      if (!isSafeStaffName(followUpAssignee)) { setSaveError('Choose an active staff member with a valid full name.'); return; }
      if (!followUpTitle.trim()) { setSaveError('Enter a follow-up task title.'); return; }
      if (!dateStr.trim()) { setSaveError('Choose a follow-up date.'); return; }
    }
    if (target.taskId && canEditTasks && taskAction === 'reschedule' && !hasValidTaskReschedule(rescheduleReason, dateStr)) {
      setSaveError(!rescheduleReason.trim() ? 'Enter a reschedule reason before saving.' : 'Pick a date before saving the reschedule.');
      return;
    }
    setBusy(true);
    setSaveError(null);
    const steps = completedStepsRef.current;
    try {
      const noteText = note.trim();
      const nowIso = new Date().toISOString();
      const completionStatus = outcome === OUTCOME_OPTIONS[0] ? 'success' : 'unsuccessful';
      const attemptCount = ((liveTask as unknown as { attempt_count?: number } | null)?.attempt_count ?? 0) + 1;
      const nextActionType = taskAction === 'reschedule'
        ? 'reschedule'
        : shouldCreateFollowUp ? 'follow_up' : null;
      const nextActionPayload = taskAction === 'reschedule'
        ? { due_date: dateStr, due_time: timeStr }
        : shouldCreateFollowUp
          ? { due_date: dateStr, due_time: timeStr, task_type: followUpTaskType, assigned_to: followUpAssignee }
          : null;

      // 1 — write the outcome onto the live task. A retry never repeats a
      //     step that already succeeded.
      if (target.taskId && canEditTasks && !steps.has('task_update')) {
        const updates: Partial<TaskInsert> & { completed_at?: string | null } = {
          completion_outcome: outcome,
          completion_notes: noteText || null,
          completion_status: completionStatus,
          attempt_count: attemptCount,
          last_attempt_at: nowIso,
          next_action_type: nextActionType,
          next_action_payload: nextActionPayload,
        };
        if (taskAction === 'complete') {
          updates.closed_at = nowIso;
          updates.closed_by = user?.id ?? null;
        }

        if (taskAction === 'reschedule') {
          // A reschedule without a date is not a reschedule.
          if (!dateStr.trim()) {
            setSaveError('Pick a date before saving the reschedule.');
            return;
          }
          updates.due_date = dateStr;
          updates.due_time = timeStr;
          updates.reminder = reminderAlarm;
          updates.reschedule_reason = rescheduleReason.trim();
          updates.reschedule_count = (liveTask?.reschedule_count ?? 0) + 1;
          if (liveTask?.status === TASK_STATUS_COMPLETED) {
            updates.status = TASK_STATUS_PENDING;
            updates.completed_at = null;
          }
        }

        await updateTask(target.taskId, updates);
        steps.add('task_update');
      }

      // 2 — complete or cancel the task through the shared helper, so a
      //     recurring task rolls forward and the task's alarm is dismissed.
      if (
        target.taskId &&
        canEditTasks &&
        (taskAction === 'complete' || taskAction === 'cancel') &&
        !steps.has('task_status')
      ) {
        const actionOutcome: { error: string | null } = { error: null };
        const actionDeps: TaskActionDeps = {
          updateTask,
          createNextRecurringInstance,
          dismissReminder,
          reminders,
          onError: (message: string) => {
            actionOutcome.error = message;
          },
        };
        const taskTarget = {
          id: target.taskId,
          is_recurring: liveTask?.is_recurring ?? false,
        };
        const result =
          taskAction === 'complete'
            ? await completeTaskWithRecurrence(taskTarget, actionDeps)
            : await cancelTaskWithCleanup(taskTarget, actionDeps);
        if (!result.ok) {
          setSaveError(
            result.error ?? actionOutcome.error ?? 'The task could not be updated.',
          );
          return;
        }
        steps.add('task_status');
      }

      // 2 — record the submitted outcome on the task trail using the
      // Desktop event name and metadata shape.
      if (target.taskId && canEditTasks && !steps.has('outcome_activity')) {
        await logTaskActivity(target.taskId, 'outcome_recorded', {
          outcome,
          completion_status: completionStatus,
          notes: noteText,
          attempt_count: attemptCount,
        } as Json, staffName, user?.id ?? null);
        steps.add('outcome_activity');
      }

      if (target.taskId && canEditTasks && taskAction === 'complete' && !steps.has('closed_activity')) {
        await logTaskActivity(target.taskId, 'closed', {
          closed_by: user?.id ?? null,
          closed_at: nowIso,
          outcome,
        } as Json, staffName, user?.id ?? null);
        steps.add('closed_activity');
      }

      if (target.taskId && canEditTasks && taskAction === 'cancel' && !steps.has('cancelled_activity')) {
        await logTaskActivity(target.taskId, 'cancelled', {
          cancelled_by: user?.id ?? null,
          cancelled_at: nowIso,
          outcome,
        } as Json, staffName, user?.id ?? null);
        steps.add('cancelled_activity');
      }

      // 3 — record the reschedule on the task trail.
      if (
        target.taskId &&
        canEditTasks &&
        taskAction === 'reschedule' &&
        !steps.has('reschedule_activity')
      ) {
        await logTaskActivity(
          target.taskId,
          'rescheduled',
          {
            old_value: {
              due_date: liveTask?.due_date ?? null,
              due_time: liveTask?.due_time ?? null,
            },
            new_value: { due_date: dateStr, due_time: timeStr },
            reason: rescheduleReason.trim(),
            reschedule_count: (liveTask?.reschedule_count ?? 0) + 1,
          },
          staffName,
          user?.id ?? null,
        );
        steps.add('reschedule_activity');
      }

      // 4 — create a follow-up only after the parent task status is saved.
      // addTask writes the canonical staff full_name and its tasks INSERT
      // enters the existing notify_automation_engine() database trigger path.
      if (shouldCreateFollowUp) {
        // The helper caches the inserted id in a ref. If task/activity logging
        // below fails, a retry resumes without inserting a duplicate task.
        const newTaskId = await createFollowUpTaskOnce(followUpTaskIdRef, () =>
          addTask({
            ...buildFollowUpTaskPayload({
              title: followUpTitle,
              type: followUpTaskType,
              assignedTo: followUpAssignee,
              createdBy: staffName,
              dueDate: dateStr,
              dueTime: timeStr,
              reminder: reminderAlarm,
              entityType: target.entityType,
              entityId: target.entityId,
            }),
            parent_task_id: target.taskId ?? null,
          }),
        );
        steps.add('followup_task');

        if (!steps.has('followup_task_activity')) {
          await logTaskActivity(newTaskId, 'created', {
            source: 'mobile_task_completion',
            parent_task_id: target.taskId ?? null,
            task_type: followUpTaskType,
            assigned_to: followUpAssignee,
            due_date: dateStr,
            due_time: timeStr,
            reminder: reminderAlarm,
            related_entity_type: target.entityType,
            related_entity_id: target.entityId,
          } as Json, staffName, user?.id ?? null);
          steps.add('followup_task_activity');
        }

        if (target.taskId && !steps.has('followup_parent_activity')) {
          await logTaskActivity(target.taskId, 'follow_up_created', {
            new_task_id: newTaskId,
            new_task_title: followUpTitle.trim(),
            due_date: dateStr,
          } as Json, staffName, user?.id ?? null);
          steps.add('followup_parent_activity');
        }
        // addTask already calls the shared syncTaskReminder(data) mirror,
        // which creates/deletes the task-scoped row. A second insert here
        // would race that upsert and could duplicate the bell alarm.
      }

      // 5 — log the call or the task completion on the entity timeline.
      if (!steps.has('log_activity')) {
        await logActivity({
          lead_id: linkedLeadId ?? (target.entityType === 'lead' ? target.entityId : undefined),
          customer_id: target.entityType === 'customer' ? target.entityId : undefined,
          activity_type: (target.taskId && canEditTasks ? 'task_outcome_recorded' : 'phone_call') as ActivityType,
          activity_category: target.taskId && canEditTasks ? 'task' : 'communication',
          title: target.taskId && canEditTasks
            ? taskAction === 'reschedule'
              ? `Task Rescheduled: ${liveTask?.title ?? target.entityName} — ${rescheduleReason.trim()}`
              : `${taskAction === 'complete' ? 'Task Closed' : taskAction === 'cancel' ? 'Task Cancelled' : 'Task Outcome Recorded'}: ${liveTask?.title ?? target.entityName} — ${outcomeLabel}`
            : `Call logged — ${outcomeLabel}`,
          description: noteText || undefined,
          is_manual: false,
          metadata: {
            task_id: target.taskId ?? null,
            follow_up_task_id: followUpTaskIdRef.current,
            outcome,
            task_action: taskAction,
            next_step: nextStep,
            completion_status: completionStatus,
            attempt_count: attemptCount,
            notes: noteText,
            reason: taskAction === 'reschedule' ? rescheduleReason.trim() : null,
            old_due_date: taskAction === 'reschedule' ? liveTask?.due_date ?? null : null,
            new_due_date: taskAction === 'reschedule' ? dateStr : null,
            scheduled_at: scheduledIso,
          },
          related_entity_type: target.taskId && canEditTasks ? 'task' : target.entityType,
          related_entity_id: target.taskId && canEditTasks ? target.taskId : target.entityId,
        });
        steps.add('log_activity');
      }

      if (target.taskId && taskAction === 'complete' && (nextStep === 'convert' || nextStep === 'lost') && linkedLeadId) {
        onDismiss();
        onLeadLifecycleAction?.(nextStep, linkedLeadId);
        return;
      }
      onDismiss();
    } catch (error) {
      // The sheet stays open and the reason is shown inline — a silent
      // failure looked like a successful save. The steps that already
      // succeeded are remembered, so a retry does not repeat them.
      setSaveError(
        error instanceof Error
          ? error.message
          : 'The call could not be saved. Please try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'complete' ? 'Complete Task' : 'Log Call Outcome'}
        className="w-full bg-white rounded-t-[20px] max-h-[95dvh] flex flex-col"
      >
        {/* Sheet Header */}
        <div className="px-4 py-2.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="font-utility text-[11px] font-bold uppercase tracking-wider text-[#059669]">
              {mode === 'complete' ? 'Task Completion' : openedAfterCall ? 'Opened after call' : 'Call Log'}
            </div>
            <h2 className="text-base font-bold text-[#1A1A2E] leading-tight truncate">
              {mode === 'complete' ? 'Complete Task' : 'Log Call Outcome'}
            </h2>
            <div className="font-utility text-xs text-[#47464C] truncate">{target.entityName}</div>
            <div className="font-utility text-xs text-[#47464C]">
              {target.phone ? formatPhoneDisplay(target.phone) : 'No phone number'}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[44px] px-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FA] text-xs font-semibold text-[#47464C] whitespace-nowrap shrink-0"
          >
            Not now
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 py-2.5 space-y-2.5">
          {saveError ? (
            <div
              role="alert"
              className="p-3 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-xs font-semibold"
            >
              {saveError}
            </div>
          ) : null}

          {/* Outcome list — one per row so the full label is never truncated */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#1A1A2E]">Call Outcome</div>
            <div className="grid grid-cols-1 gap-1.5">
              {control.outcomes.map((option) => {
                const active = outcome === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setOutcome(option.value)}
                    className={`min-h-[44px] px-2.5 rounded-[12px] border text-sm font-semibold flex items-center justify-between gap-2 text-left transition-colors ${
                      active
                        ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                        : 'bg-white text-[#1A1A2E] border-[#E2E8F0]'
                    }`}
                  >
                    <span className="break-words">{option.label}</span>
                    {active ? <Check className="w-4 h-4 shrink-0 text-[#C9A84C]" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 16px Quick Note Textarea */}
          <div>
            <label htmlFor="call-quick-note" className="block text-xs font-bold text-[#1A1A2E] mb-1">
              Quick Note
            </label>
            <textarea
              id="call-quick-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Discussed slab lot availability, client feedback..."
              className="w-full px-3 py-2 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          {/* 4-way Task Action — hidden for a role that may not write tasks. */}
          {target.taskId && canEditTasks ? (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-[#1A1A2E]">Task Action</div>
              <div className="grid grid-cols-2 gap-1.5">
                {taskActions.map((action) => {
                  const active = taskAction === action.value;
                  return (
                    <button
                      key={action.value}
                      type="button"
                      onClick={() => {
                        setTaskAction(action.value);
                        setReminderAlarm(
                          action.value === 'reschedule'
                            ? (liveTask?.reminder ?? defaultRemindersEnabled)
                            : defaultRemindersEnabled,
                        );
                      }}
                      className={`min-h-[44px] px-2 rounded-[10px] border text-xs font-semibold whitespace-nowrap ${
                        active
                          ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                          : 'bg-[#F8F9FA] text-[#1A1A2E] border-[#E2E8F0]'
                      }`}
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : target.taskId ? (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-[#1A1A2E]">Task Action</div>
              <p className="text-xs text-[#47464C]">
                Your role can log the call, but it cannot change the task.
              </p>
            </div>
          ) : null}

          {!target.taskId && canEditTasks ? (
            <label className="flex min-h-[48px] items-center justify-between rounded-[10px] border border-[#E2E8F0] bg-white px-3">
              <span className="text-sm font-semibold text-[#1A1A2E]">Create a follow-up task?</span>
              <input type="checkbox" checked={createAdHocFollowUp} onChange={(event) => setCreateAdHocFollowUp(event.target.checked)} className="h-5 w-5 accent-[#1A1A2E]" />
            </label>
          ) : null}

          {target.taskId && taskAction === 'cancel' ? (
            <p className="rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">This will cancel the task and dismiss its task reminders. The selected outcome and note will be recorded.</p>
          ) : null}

          {target.taskId && taskAction === 'complete' ? (
            <div className="space-y-2 rounded-[12px] border border-[#E2E8F0] bg-[#F8F9FA] p-3">
              {liveTask?.is_recurring ? (
                <p className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Next recurring occurrence will be created automatically</p>
              ) : null}
              <div className="text-xs font-bold text-[#1A1A2E]">Next Step</div>
              {leadOnlyOpenTask ? (
                <div className="grid grid-cols-1 gap-1.5">
                  {([
                    { value: 'create', label: 'Create Next Task' },
                    { value: 'convert', label: 'Convert to Customer' },
                    { value: 'lost', label: 'Mark as Lost' },
                  ] as const).map((option) => (
                    <button key={option.value} type="button" onClick={() => setNextStep(option.value)} className={`min-h-[44px] rounded-[10px] border px-3 text-sm font-semibold ${nextStep === option.value ? 'border-[#1A1A2E] bg-[#1A1A2E] text-white' : 'border-[#E2E8F0] bg-white text-[#1A1A2E]'}`}>{option.label}</button>
                  ))}
                  <p className="text-xs text-[#B45309]">This lead has no other open task. Select a next step to continue.</p>
                </div>
              ) : liveTask?.is_recurring ? (
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { value: 'none', label: 'No Extra Task' },
                    { value: 'create', label: 'Create Extra Follow-up' },
                  ] as const).map((option) => (
                    <button key={option.value} type="button" onClick={() => setNextStep(option.value)} className={`min-h-[44px] rounded-[10px] border px-3 text-xs font-semibold ${nextStep === option.value ? 'border-[#1A1A2E] bg-[#1A1A2E] text-white' : 'border-[#E2E8F0] bg-white text-[#1A1A2E]'}`}>{option.label}</button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { value: 'none', label: 'No Next Task (Just Complete)' },
                    { value: 'create', label: 'Create Next Task' },
                  ] as const).map((option) => (
                    <button key={option.value} type="button" onClick={() => setNextStep(option.value)} className={`min-h-[44px] rounded-[10px] border px-3 text-xs font-semibold ${nextStep === option.value ? 'border-[#1A1A2E] bg-[#1A1A2E] text-white' : 'border-[#E2E8F0] bg-white text-[#1A1A2E]'}`}>{option.label}</button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {shouldCreateFollowUp && canEditTasks ? (
            <div className="space-y-2 rounded-[12px] border border-[#E2E8F0] bg-[#F8F9FA] p-3">
              <div className="text-xs font-bold text-[#1A1A2E]">{target.taskId ? 'Create Next Task' : 'Follow-up Task'}</div>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#1A1A2E]">Task Type</span>
                <select value={followUpTaskType} onChange={(event) => { setFollowUpTaskType(event.target.value); if (!followUpTitleTouchedRef.current) setFollowUpTitle(getDefaultFollowUpTaskTitle(taskTypeOptions.find((option) => option.value === event.target.value)?.label ?? event.target.value, target.entityName)); }} className="min-h-[48px] w-full rounded-[10px] border border-[#E2E8F0] bg-white px-3 text-base">
                  {taskTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#1A1A2E]">Assign To</span>
                <select value={followUpAssignee} onChange={(event) => setFollowUpAssignee(event.target.value)} className="min-h-[48px] w-full rounded-[10px] border border-[#E2E8F0] bg-white px-3 text-base">
                  {assigneeOptions.map((option) => <option key={option.id} value={option.name}>{option.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#1A1A2E]">Title</span>
                <input value={followUpTitle} onChange={(event) => { followUpTitleTouchedRef.current = true; setFollowUpTitle(event.target.value); }} className="min-h-[48px] w-full rounded-[10px] border border-[#E2E8F0] bg-white px-3 text-base" />
              </label>
            </div>
          ) : null}

          {target.taskId && taskAction === 'reschedule' ? (
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#1A1A2E]">Reschedule Reason *</div>
              <div className="flex flex-wrap gap-1.5">
                {getRescheduleReasonSuggestions(outcome).map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setRescheduleReason(suggestion)} className="min-h-[44px] px-2.5 rounded-full border border-[#E2E8F0] bg-white text-xs font-medium text-[#1A1A2E]">
                    {suggestion}
                  </button>
                ))}
              </div>
              <textarea rows={2} value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} placeholder="Why is this task being rescheduled?" className="w-full min-h-[72px] p-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base" />
            </div>
          ) : null}

          {/* Quick Follow-Up Preset */}
          {canEditTasks && ((target.taskId && taskAction === 'reschedule') || shouldCreateFollowUp) && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-[#1A1A2E]">Quick Follow-Up Preset</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: '1h', label: '+1 hr' },
                    { id: '4h', label: '+4 hrs' },
                    { id: 'tomorrow', label: 'Tomorrow 10 AM' },
                    { id: 'custom', label: 'Custom' },
                  ] as const
                ).map((preset) => {
                  const active = snoozePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={`min-h-[44px] px-3 rounded-[12px] border text-xs font-semibold whitespace-nowrap ${
                        active
                          ? 'bg-[#FFFBEB] text-[#D97706] border-[#D97706]'
                          : 'bg-white text-[#1A1A2E] border-[#E2E8F0]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Next Follow-Up date/time + Set Reminder Alarm toggle */}
          {canEditTasks && ((target.taskId && taskAction === 'reschedule') || shouldCreateFollowUp) && (
            <div className="space-y-2 bg-[#F8F9FA] border border-[#E2E8F0] rounded-[12px] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#1A1A2E] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#1A1A2E] shrink-0" />
                  <span>Next Follow-Up</span>
                </span>
                <span className="font-utility text-xs font-semibold text-[#1A1A2E] whitespace-nowrap">
                  {formatDateTimeInputDisplay(scheduledIso)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Follow-up date"
                  type="date"
                  value={dateStr}
                  onChange={(event) => {
                    setDateStr(event.target.value);
                    setSnoozePreset('custom');
                  }}
                  className="w-full min-h-[44px] px-2.5 rounded-[10px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                />
                <input
                  aria-label="Follow-up time"
                  type="time"
                  value={timeStr}
                  onChange={(event) => {
                    setTimeStr(event.target.value);
                    setSnoozePreset('custom');
                  }}
                  className="w-full min-h-[44px] px-2.5 rounded-[10px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                />
              </div>

              <label className="flex items-center justify-between min-h-[44px] pt-1 border-t border-[#E2E8F0] cursor-pointer">
                <span className="text-sm font-semibold text-[#1A1A2E] flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#D97706] shrink-0" />
                  <span>Set Reminder Alarm</span>
                </span>
                <input
                  type="checkbox"
                  checked={reminderAlarm}
                  onChange={(event) => setReminderAlarm(event.target.checked)}
                  className="w-5 h-5 accent-[#1A1A2E]"
                />
              </label>
            </div>
          )}
        </div>

        {/* Sticky Bottom Gold CTA */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] shrink-0">
          <button
            type="button"
            disabled={busy || !outcome}
            onClick={() => void handleSave()}
            className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base shadow-[0_10px_20px_-3px_rgba(201,168,76,0.35)] disabled:opacity-60"
          >
            {mode === 'complete'
              ? taskAction === 'cancel'
                ? 'Cancel Task'
                : taskAction === 'reschedule'
                  ? 'Reschedule Task'
                  : 'Complete Task'
              : 'Save Call Log'}
          </button>
        </div>
      </div>
    </div>
  );
};
