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
 *  - task types and call outcomes come from the Control Panel
 *    (`getFieldOptions('tasks', 'type' | 'completion_outcome')`) and fall back
 *    to `src/constants/taskConstants.ts` — no snake_case values are invented,
 *  - reminders come from `useReminders()` and a reschedule always deletes the
 *    old row before inserting a new one so `is_dismissed` resets to false.
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
import { useProfessionals } from '@/hooks/useProfessionals';
import { useReminders } from '@/hooks/useReminders';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useTasks } from '@/hooks/useTasks';

import { normalizePhone10 } from '@/lib/phone';
import {
  isProfessionalDesignation,
  resolveProfessionalForProfessionalLead,
  type ProfessionalLeadCandidate,
} from '@/lib/professionalResolver';
import { TASK_COMPLETION_OUTCOMES, TASK_TYPES } from '@/constants/taskConstants';

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
import { requireSafeStaffName } from '@/mobile/lib/staffAttribution';
import {
  getTaskUrgency,
  isTaskActiveAndNotOrphan,
  isTaskCancelledForBin,
  sortTasksByUrgency,
  taskTypeLabel,
} from '@/mobile/lib/tasks';

import type { Customer as LiveCustomer } from '@/hooks/useCustomers';
import type { Lead as LiveLead } from '@/hooks/useLeads';
import type { Professional as LiveProfessional } from '@/hooks/useProfessionals';
import type { TaskInsert } from '@/hooks/useTasks';
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

/** A task that still needs work — neither completed nor cancelled. */
function isOpenTask(task: CrmTask): boolean {
  return task.status !== TASK_STATUS_COMPLETED && task.status !== TASK_STATUS_CANCELLED;
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
  taskTypes: { value: string; label: string }[];
  /** Call outcomes — Control Panel values, falling back to the constants. */
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
    if (controlPanel.length > 0) {
      return controlPanel.map((option) => ({
        value: option.value,
        label: getOptionLabel('tasks', 'type', option.value) || option.label,
      }));
    }
    return TASK_TYPES.map((value) => ({ value, label: value }));
  }, [getFieldOptions, getOptionLabel]);

  /**
   * The completion outcomes come straight from the shared constant.
   *
   * The desktop `TaskCompletionDialog` uses `TASK_COMPLETION_OUTCOMES`, so a
   * mobile-only Control Panel list would let the two surfaces write different
   * values into the same column.
   */
  const outcomes = useMemo(
    () => TASK_COMPLETION_OUTCOMES.map((value) => ({ value, label: value })),
    [],
  );

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
      location: liveLead?.site_location ?? task.lead.site_location ?? null,
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
}> = ({ phone, phone10, location, plusCode, fourthLabel, onCall, onFourthAction }) => {
  const hasPhone = Boolean(phone10);
  const hasLocation = Boolean(location && location.trim().length > 0);

  const tileCount = (hasPhone ? 2 : 0) + (hasLocation ? 1 : 0) + 1;
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
}> = ({
  task,
  entity,
  typeLabel,
  onOpenProfile,
  onCall,
  onFourthAction,
  fourthLabel,
  virtualise = false,
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
      />
    </article>
  );
};

/* -------------------------------------------------------------------------- */
/* Screen 1 — TodayPage                                                       */
/* -------------------------------------------------------------------------- */

export const TodayPage: React.FC<{
  onNavigate: (route: MobileRoute) => void;
  onOpenClockModal: () => void;
  onOpenCallOutcome: (target: MobileCallTarget) => void;
  /**
   * Called when the user taps the Call tile. It only records the intent to
   * call; the sheet then opens once the user comes back from the dialer.
   * `onOpenCallOutcome` is reserved for a manual "Log" tap.
   */
  onBeginCall?: (target: MobileCallTarget) => void;
  attendanceBanner?: React.ReactNode;
}> = ({ onNavigate, onOpenClockModal, onOpenCallOutcome, onBeginCall, attendanceBanner }) => {
  const { tasks, updateTask } = useTasks();
  const { isOnline, enqueue } = useWeakSignalOutbox();
  const { toast } = useToast();
  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { professionals } = useProfessionals();
  const { reminders, snoozeReminder, dismissReminder } = useReminders();
  const control = useControlPanelView();
  const resolveEntity = useTaskEntityResolver(control.getOptionLabel);
  const recentActivity = useRecentActivity(6);

  const remindersSectionRef = useRef<HTMLElement | null>(null);

  const mobileTasks = useMemo(() => tasks.map(toMobileTask), [tasks]);

  const activeTasks = useMemo(
    () => mobileTasks.filter((task) => isTaskActiveAndNotOrphan(task) && isOpenTask(task)),
    [mobileTasks],
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

  return (
    <div className="p-4 space-y-5">
      {attendanceBanner}

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
        <span>Clock In / Clock Out</span>
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
                  onFourthAction={() => {
                    const updates = { status: TASK_STATUS_COMPLETED };
                    if (!isOnline) {
                      // The device is offline — the write is parked on the
                      // device and replayed by the outbox.
                      enqueue({
                        kind: 'task_action',
                        label: `Complete task · ${task.title}`,
                        payload: { taskId: task.id, updates },
                      });
                      toast({
                        title: 'Saved offline',
                        description: 'This update is stored on the device and will sync automatically.',
                      });
                      return;
                    }
                    void updateTask(task.id, updates);
                  }}
                  fourthLabel="Done"
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
  const control = useControlPanelView();
  const resolveEntity = useTaskEntityResolver(control.getOptionLabel);

  const [filter, setFilter] = useState<WorkFilter>(initialFilter);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const mobileTasks = useMemo(() => tasks.map(toMobileTask), [tasks]);

  /** The orphan-safe universe: deleted-lead orphans and cancelled tasks are out. */
  const visibleTasks = useMemo(
    () => mobileTasks.filter((task) => isTaskActiveAndNotOrphan(task)),
    [mobileTasks],
  );

  /**
   * Cancelled tasks are excluded from the orphan-safe universe on purpose, so
   * the "Cancelled" view derives from the raw universe instead — otherwise
   * the chip could never show a row.
   */
  const cancelledTasks = useMemo(
    () => mobileTasks.filter((task) => isTaskCancelledForBin(task)),
    [mobileTasks],
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

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1A1A2E]">Work Queue</h1>
        <span className="font-utility text-xs font-semibold text-[#47464C] whitespace-nowrap">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </span>
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
          {filteredTasks.map((task) => {
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
  /** Records the intent to call; the sheet opens on return from the dialer. */
  onBeginCall?: (target: MobileCallTarget) => void;
}> = ({ open, taskId, onClose, onNavigate, onOpenCallOutcome, onBeginCall }) => {
  const { tasks, updateTask } = useTasks();
  const { defaultRemindersEnabled } = useSystemSettings();
  const { addReminder, deleteReminder, reminders } = useReminders(
    taskId ? 'task' : undefined,
    taskId ?? undefined,
  );
  const { profile } = useAuth();
  const { isOnline, enqueue } = useWeakSignalOutbox();
  const { toast } = useToast();
  const control = useControlPanelView();
  const resolveEntity = useTaskEntityResolver(control.getOptionLabel);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
    // The toggle starts from the task's own value — the system default must
    // not silently switch a task's reminder on.
    setReminderOn(task.reminder_enabled);
    setRescheduleOpen(false);
  }, [open, task, defaultRemindersEnabled]);

  if (!open || !task) return null;

  const entity = resolveEntity(task);
  const urgency = getTaskUrgency(task);
  const typeLabel = taskTypeLabel(task.task_type, control.typeLabelMap);
  const staffName = requireSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null);

  /**
   * Delete-then-insert: the old reminder row is removed first so the new row
   * starts with `is_dismissed = false` again.
   */
  const rescheduleReminder = async (dueIso: string, withReminder: boolean) => {
    const scoped = reminders.filter(
      (reminder) => reminder.entity_type === 'task' && reminder.entity_id === task.id,
    );
    for (const reminder of scoped) {
      await deleteReminder(reminder.id);
    }
    if (withReminder) {
      await addReminder({
        title: task.title,
        description: `Follow-up for ${entity.name}`,
        reminder_datetime: dueIso,
        entity_type: 'task',
        entity_id: task.id,
        assigned_to: staffName,
      });
    }
  };

  const handleReschedule = async () => {
    if (!liveTask) return;
    setBusy(true);
    try {
      const dueIso = localIsoFromInputs(dateStr, timeStr);
      const updates: Partial<TaskInsert> & { completed_at?: string | null } = {
        due_date: dateStr,
        due_time: timeStr,
        reminder: reminderOn,
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

      await updateTask(task.id, updates);
      await rescheduleReminder(dueIso, reminderOn);
      onClose();
    } catch {
      /* keep the sheet open so the user can retry */
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (status: string) => {
    if (!liveTask) return;
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

      await updateTask(task.id, { status });
      onClose();
    } catch {
      /* keep the sheet open so the user can retry */
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

          <button
            type="button"
            onClick={() => setRescheduleOpen((value) => !value)}
            className="min-h-[48px] rounded-[12px] border-[1.5px] border-[#E2E8F0] bg-white text-sm font-semibold text-[#1A1A2E] flex items-center justify-center gap-1.5"
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span>Reschedule</span>
          </button>

          {task.status === TASK_STATUS_COMPLETED ? (
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
                onClick={() => void handleStatus(TASK_STATUS_COMPLETED)}
                className="min-h-[48px] rounded-[12px] bg-[#C9A84C] text-sm font-semibold text-[#1A1A2E] flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Complete Task</span>
              </button>
            </>
          )}
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
  openedAfterCall: boolean;
  target: MobileCallTarget | null;
  onDismiss: () => void;
}> = ({ open, openedAfterCall, target, onDismiss }) => {
  const { tasks, updateTask } = useTasks();
  const { logActivity } = useLogActivity();
  const { defaultRemindersEnabled } = useSystemSettings();
  const { profile } = useAuth();
  const control = useControlPanelView();

  const scopeType = target?.taskId ? 'task' : target?.entityType;
  const scopeId = target?.taskId ?? target?.entityId;
  const { addReminder, deleteReminder, reminders } = useReminders(scopeType, scopeId);

  /**
   * "Tomorrow 10 AM" — recomputed every time the sheet opens.
   *
   * It used to be computed once at mount, so a sheet opened after midnight
   * still pointed at yesterday.
   */
  const defaultTomorrow = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    return date.toISOString();
  }, [open]);

  const [outcome, setOutcome] = useState<CallOutcomeValue>('');
  const [note, setNote] = useState('');
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

  useEffect(() => {
    if (!open) return;
    setNote('');
    // Without a task there is nothing to reschedule — the call only logs.
    setTaskAction(target?.taskId ? 'reschedule' : 'keep_open');
    setSnoozePreset('tomorrow');
    setDateStr(toLocalDateInputValue(defaultTomorrow));
    setTimeStr(toLocalTimeInputValue(defaultTomorrow));
    setReminderAlarm(defaultRemindersEnabled);
    setSaveError(null);
  }, [open, defaultTomorrow, defaultRemindersEnabled, target?.taskId]);

  useEffect(() => {
    if (!open) return;
    setOutcome((current) =>
      control.outcomes.some((option) => option.value === current)
        ? current
        : (control.outcomes[0]?.value ?? ''),
    );
  }, [open, control.outcomes]);

  if (!open || !target) return null;

  const scheduledIso = combineDateAndTime(dateStr, timeStr);
  const outcomeLabel =
    control.outcomes.find((option) => option.value === outcome)?.label ?? outcome;
  const staffName = requireSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null);
  const liveTask = target.taskId ? tasks.find((item) => item.id === target.taskId) ?? null : null;

  const taskActions: { value: CallOutcomeAction; label: string }[] = [
    { value: 'keep_open', label: 'Keep Open' },
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
      setTaskAction('reschedule');
    } else if (preset === '4h') {
      const date = new Date(Date.now() + 4 * 60 * 60 * 1000);
      setDateStr(toLocalDateInputValue(date.toISOString()));
      setTimeStr(toLocalTimeInputValue(date.toISOString()));
      setTaskAction('reschedule');
    } else if (preset === 'tomorrow') {
      setDateStr(toLocalDateInputValue(defaultTomorrow));
      setTimeStr('10:00');
      setTaskAction('reschedule');
    }
  };

  const handleSave = async () => {
    if (!target) return;
    setBusy(true);
    setSaveError(null);
    try {
      const noteText = note.trim();

      // 1 — write the outcome onto the live task.
      if (target.taskId) {
        const updates: Partial<TaskInsert> & { completed_at?: string | null } = {
          completion_outcome: outcome,
          completion_notes: noteText || null,
        };

        if (taskAction === 'complete') {
          updates.status = TASK_STATUS_COMPLETED;
        } else if (taskAction === 'cancel') {
          updates.status = TASK_STATUS_CANCELLED;
        } else if (taskAction === 'reschedule') {
          updates.due_date = dateStr;
          updates.due_time = timeStr;
          updates.reminder = reminderAlarm;
          if (liveTask?.status === TASK_STATUS_COMPLETED) {
            updates.status = TASK_STATUS_PENDING;
            updates.completed_at = null;
          }
        }

        await updateTask(target.taskId, updates);
      }

      // 2 — log the call.
      await logActivity({
        lead_id: target.entityType === 'lead' ? target.entityId : undefined,
        customer_id: target.entityType === 'customer' ? target.entityId : undefined,
        activity_type: 'phone_call',
        activity_category: 'communication',
        title: `Call logged — ${outcomeLabel}`,
        description: noteText || undefined,
        metadata: {
          task_id: target.taskId ?? null,
          outcome,
          task_action: taskAction,
          scheduled_at: scheduledIso,
        },
        related_entity_type: target.entityType,
        related_entity_id: target.entityId,
      });

      // 3 — reschedule: delete the old reminder, then insert a fresh one so
      //     `is_dismissed` starts from false again.
      //
      //     Only reminders that belong to the *task* are replaced. A call that
      //     is not attached to a task must never wipe the entity's other
      //     reminders.
      if (taskAction === 'reschedule' && scopeType && scopeId) {
        const scoped = reminders.filter(
          (reminder) => reminder.entity_type === scopeType && reminder.entity_id === scopeId,
        );
        if (target.taskId) {
          for (const reminder of scoped) {
            await deleteReminder(reminder.id);
          }
        }
        if (reminderAlarm) {
          await addReminder({
            title: liveTask?.title ?? `Follow-up: ${target.entityName}`,
            description: `Call follow-up for ${target.entityName}`,
            reminder_datetime: localIsoFromInputs(dateStr, timeStr),
            entity_type: scopeType,
            entity_id: scopeId,
            assigned_to: staffName,
          });
        }
      }

      onDismiss();
    } catch (error) {
      // The sheet stays open and the reason is shown inline — a silent
      // failure looked like a successful save.
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
        aria-label="Log Call Outcome"
        className="w-full bg-white rounded-t-[20px] max-h-[95dvh] flex flex-col"
      >
        {/* Sheet Header */}
        <div className="px-4 py-2.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="font-utility text-[11px] font-bold uppercase tracking-wider text-[#059669]">
              {openedAfterCall ? 'Opened after call' : 'Call Log'}
            </div>
            <h2 className="text-base font-bold text-[#1A1A2E] leading-tight truncate">
              {target.entityName}
            </h2>
            <div className="font-utility text-xs text-[#47464C]">
              {formatPhoneDisplay(target.phone)}
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

          {/* 4-way Task Action */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#1A1A2E]">Task Action</div>
            <div className="grid grid-cols-2 gap-1.5">
              {taskActions.map((action) => {
                const active = taskAction === action.value;
                return (
                  <button
                    key={action.value}
                    type="button"
                    onClick={() => setTaskAction(action.value)}
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

          {/* Quick Follow-Up Preset */}
          {taskAction !== 'complete' && taskAction !== 'cancel' && (
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
          {taskAction !== 'complete' && taskAction !== 'cancel' && (
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
            disabled={busy}
            onClick={() => void handleSave()}
            className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base shadow-[0_10px_20px_-3px_rgba(201,168,76,0.35)] disabled:opacity-60"
          >
            Save Call Log
          </button>
        </div>
      </div>
    </div>
  );
};
