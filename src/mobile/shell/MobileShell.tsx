import React, { Component, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  CloudOff,
  Home,
  MessageSquare,
  MoreHorizontal,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { useControlPanelSettings } from '@/hooks/useControlPanelSettings';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useReminders } from '@/hooks/useReminders';
import { useUnreadCounts } from '@/hooks/useChat';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useAuth } from '@/contexts/AuthContext';
import { TASK_TYPES as FALLBACK_TASK_TYPES } from '@/constants/taskConstants';

import { useWeakSignalOutbox } from '@/mobile/outbox/WeakSignalOutboxContext';
import { useVersionCheck } from '@/mobile/hooks/useVersionCheck';
import { buildMobileNotifications } from '@/mobile/lib/mobileNotifications';
import { formatShortDateTime, toLocalDateInputValue, toLocalTimeInputValue } from '@/mobile/lib/format';
import { toMobileCustomer, toMobileLead, toMobileProfessional, toMobileTask } from '@/mobile/lib/mappers';
import { resolveSafeStaffName } from '@/mobile/lib/staffAttribution';
import { useLeads } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useTasks } from '@/hooks/useTasks';

import type { EntityKind, MainTab, MobileRoute } from '@/mobile/types/crmTypes';

/* -------------------------------------------------------------------------- */
/* Error boundary                                                             */
/* -------------------------------------------------------------------------- */

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Error boundary wrapping the mobile workspace so a runtime failure never
 * leaves the field user staring at a blank screen.
 */
export class MobileErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { hasError: true, message: err?.message || 'Unexpected workspace error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-[#F8F9FA] flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white border border-[#E2E8F0] rounded-[12px] p-5 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center text-[#DC2626]">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1A1A2E]">Workspace Interrupted</h2>
              <p className="text-sm text-[#47464C] mt-1">{this.state.message}</p>
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base"
            >
              Reload Mobile Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/* Badges + headers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Entity badge. `subLabel` carries the specific role (for example
 * "Architect" or "Contractor") instead of the generic entity name.
 */
export const EntityBadge: React.FC<{
  kind: EntityKind;
  subLabel?: string;
}> = ({ kind, subLabel }) => {
  const Icon = kind === 'lead' ? UserPlus : kind === 'customer' ? UserCheck : Briefcase;
  const label = subLabel || (kind === 'lead' ? 'Lead' : kind === 'customer' ? 'Customer' : 'Pro');
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EEF2F6] text-[#1A1A2E] font-utility text-[11px] font-bold uppercase tracking-wide whitespace-nowrap shrink-0">
      <Icon className="w-3 h-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
};

export const StatusBadge: React.FC<{
  tone: 'overdue' | 'due_today' | 'connected' | 'neutral';
  label: string;
}> = ({ tone, label }) => {
  const styles =
    tone === 'overdue'
      ? 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]'
      : tone === 'due_today'
        ? 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]'
        : tone === 'connected'
          ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
          : 'bg-[#EEF2F6] text-[#1A1A2E] border-[#E2E8F0]';
  const Icon = tone === 'overdue' ? AlertCircle : tone === 'connected' ? CheckCircle2 : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border font-utility text-[11px] font-bold whitespace-nowrap shrink-0 ${styles}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
};

export const SubHeader: React.FC<{
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
}> = ({ title, subtitle, onBack, rightAction }) => {
  return (
    <header className="sticky top-0 z-30 h-14 bg-[#1A1A2E] text-white px-3 flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-white hover:bg-white/10 active:bg-white/15 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-white leading-tight truncate whitespace-nowrap">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] font-utility text-[#C6C4DF] leading-tight truncate whitespace-nowrap">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {rightAction ? <div className="shrink-0 flex items-center">{rightAction}</div> : null}
    </header>
  );
};

/* -------------------------------------------------------------------------- */
/* Persistent top bar                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Persistent 56px `#1A1A2E` top bar.
 *
 * The message badge is wired to the live `useUnreadCounts()` hook and the bell
 * badge to the live reminder list — both are real data, never placeholders.
 */
export const PersistentTopBar: React.FC<{
  onOpenMessages: () => void;
  onOpenNotifications: () => void;
}> = ({ onOpenMessages, onOpenNotifications }) => {
  const { data: unreadCounts } = useUnreadCounts();
  const { reminders } = useReminders();

  const unreadMessagesCount = unreadCounts?.messages ?? 0;
  const unreadNotificationsCount = useMemo(
    () => reminders.filter((reminder) => !reminder.is_dismissed).length,
    [reminders],
  );

  return (
    <header className="sticky top-0 z-30 h-14 bg-[#1A1A2E] text-white px-4 flex items-center justify-between gap-3 shrink-0">
      <div className="min-w-0">
        <div className="text-base font-bold tracking-tight text-white leading-tight whitespace-nowrap">
          Maharaja Marble
        </div>
        <div className="font-utility text-[10px] font-bold uppercase tracking-[0.12em] text-[#C9A84C] leading-tight whitespace-nowrap">
          FIELD CRM
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onOpenMessages}
          aria-label={`Messages${unreadMessagesCount > 0 ? `, ${unreadMessagesCount} unread` : ''}`}
          className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-white hover:bg-white/10 active:bg-white/15"
        >
          <MessageSquare className="w-5 h-5" />
          {unreadMessagesCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C9A84C] text-[#1A1A2E] font-utility text-[10px] font-bold flex items-center justify-center">
              {unreadMessagesCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label={`Notifications${unreadNotificationsCount > 0 ? `, ${unreadNotificationsCount} unread` : ''}`}
          className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-white hover:bg-white/10 active:bg-white/15"
        >
          <Bell className="w-5 h-5" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-white font-utility text-[10px] font-bold flex items-center justify-center">
              {unreadNotificationsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

/* -------------------------------------------------------------------------- */
/* Version banner                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Banner shown when the server is serving a newer build than the one loaded.
 *
 * It never reloads on its own — the field user taps "Update", and the update
 * is refused while a form holds unsaved input.
 */
export const VersionCheckBanner: React.FC<{ isDirty?: boolean }> = ({ isDirty = false }) => {
  const { updateAvailable, blockedByUnsavedChanges, dismiss, applyUpdate } =
    useVersionCheck({ isDirty });

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="bg-[#EEF2F6] border-b border-[#E2E8F0] px-4 py-2 flex items-center justify-between gap-2"
    >
      <div className="flex items-center gap-2 min-w-0">
        <RefreshCw className="w-4 h-4 text-[#1A1A2E] shrink-0" />
        <span className="text-xs font-semibold text-[#1A1A2E] truncate">
          {blockedByUnsavedChanges
            ? 'New version available — save your changes first'
            : 'New CRM version available'}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={applyUpdate}
          disabled={blockedByUnsavedChanges}
          className="min-h-[44px] px-3 rounded-[10px] bg-[#1A1A2E] text-white text-xs font-semibold whitespace-nowrap disabled:opacity-50"
        >
          Update
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss update banner"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#47464C]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Weak signal strip                                                          */
/* -------------------------------------------------------------------------- */

/** Conditional strip that surfaces offline state and queued mutations. */
export const WeakSignalSyncStrip: React.FC<{ onOpenOutbox: () => void }> = ({ onOpenOutbox }) => {
  const { isOnline, outbox, isSyncingOutbox } = useWeakSignalOutbox();
  const conflictCount = outbox.filter((mutation) => mutation.status === 'needs_review').length;

  if (isOnline && !isSyncingOutbox && outbox.length === 0) return null;

  const isConflict = isOnline && !isSyncingOutbox && conflictCount > 0;
  const isOfflineMode = !isOnline;

  return (
    <div
      role="status"
      className={`px-4 py-1.5 border-b flex items-center justify-between gap-2 ${
        isOfflineMode
          ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]'
          : isConflict
            ? 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
            : 'bg-[#EEF2F6] border-[#E2E8F0] text-[#1A1A2E]'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isOfflineMode ? (
          <CloudOff className="w-4 h-4 shrink-0" />
        ) : isSyncingOutbox ? (
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
        ) : (
          <AlertCircle className="w-4 h-4 shrink-0" />
        )}
        <span className="font-utility text-xs font-semibold truncate">
          {isOfflineMode
            ? `Offline · ${outbox.length} update${outbox.length === 1 ? '' : 's'} saved on device`
            : isSyncingOutbox
              ? 'Syncing…'
              : `${conflictCount} offline update${conflictCount === 1 ? '' : 's'} need review`}
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenOutbox}
        className="min-h-[44px] px-3 rounded-[10px] font-utility text-xs font-bold underline underline-offset-2 whitespace-nowrap shrink-0"
      >
        View
      </button>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Bottom navigation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Fixed 5-slot bottom navigation.
 *
 * The centre action is an elevated gold FAB. The prototype used Tailwind v4's
 * `w-13 h-13`, which emits no CSS in this repository's Tailwind v3 build, so
 * the explicit `w-[52px] h-[52px]` is used instead.
 */
export const BottomTabBar: React.FC<{
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  onOpenQuickAdd: () => void;
}> = ({ activeTab, onSelectTab, onOpenQuickAdd }) => {
  const tabs: { id: MainTab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'today', label: 'Today', Icon: Home },
    { id: 'work', label: 'Work', Icon: CheckCircle2 },
    { id: 'people', label: 'People', Icon: Users },
    { id: 'more', label: 'More', Icon: MoreHorizontal },
  ];

  const renderTab = ({ id, label, Icon }: (typeof tabs)[number]) => {
    const active = activeTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelectTab(id)}
        aria-current={active ? 'page' : undefined}
        className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-[10px] transition-colors ${
          active ? 'text-[#1A1A2E]' : 'text-[#47464C]'
        }`}
      >
        <span
          className={`w-8 h-1 rounded-full mb-0.5 ${
            active ? 'bg-[#C9A84C]' : 'bg-transparent'
          }`}
        />
        <Icon className="w-5 h-5" />
        <span
          className={`font-utility text-[11px] whitespace-nowrap ${
            active ? 'font-bold' : 'font-medium'
          }`}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Primary Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 w-full z-40 bg-white border-t border-[#E2E8F0] px-2 pt-1 pb-[calc(0.35rem+env(safe-area-inset-bottom))] grid grid-cols-5 items-center"
    >
      {tabs.slice(0, 2).map(renderTab)}

      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onOpenQuickAdd}
          aria-label="Quick Add"
          className="w-[52px] h-[52px] -mt-5 rounded-full bg-[#C9A84C] text-[#1A1A2E] flex items-center justify-center shadow-[0_10px_20px_-3px_rgba(201,168,76,0.35)] border-4 border-white active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>

      {tabs.slice(2).map(renderTab)}
    </nav>
  );
};

/* -------------------------------------------------------------------------- */
/* Quick add sheet                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Inline quick creation sheet: new task, add note, add reminder.
 *
 * Task types come from the live Control Panel (`tasks.type`, excluding the
 * `KIT*` entries) and fall back to `TASK_TYPES` from
 * `src/constants/taskConstants.ts` — the exact desktop contract.
 */
export const QuickAddSheet: React.FC<{
  open: boolean;
  initialMode?: 'menu' | 'task' | 'note' | 'reminder';
  preselectedEntity?: { entityType: EntityKind; entityId: string };
  onClose: () => void;
  onNavigate: (route: MobileRoute) => void;
  onOpenCallLogPicker: () => void;
}> = ({
  open,
  initialMode = 'menu',
  preselectedEntity,
  onClose,
  onNavigate,
  onOpenCallLogPicker,
}) => {
  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { professionals } = useProfessionals();
  const { addTask } = useTasks();
  const { addReminder } = useReminders();
  const { logActivity } = useLogActivity();
  const { getFieldOptions } = useControlPanelSettings();
  const { defaultRemindersEnabled } = useSystemSettings();
  const { profile } = useAuth();

  const [mode, setMode] = useState<'menu' | 'task' | 'note' | 'reminder'>(initialMode);
  const [selectedEntityKey, setSelectedEntityKey] = useState<string>('');
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState('');
  const [dateStr, setDateStr] = useState(() =>
    toLocalDateInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()),
  );
  const [timeStr, setTimeStr] = useState(() =>
    toLocalTimeInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()),
  );
  const [isRecurring, setIsRecurring] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(defaultRemindersEnabled);
  const [noteContent, setNoteContent] = useState('');
  const [formError, setFormError] = useState('');

  const taskTypeOptions = useMemo(() => {
    const controlPanel = getFieldOptions('tasks', 'type').filter(
      (option) => !option.value.startsWith('KIT'),
    );
    if (controlPanel.length > 0) return controlPanel.map((option) => option.value);
    return FALLBACK_TASK_TYPES;
  }, [getFieldOptions]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setFormError('');
    setTitle('');
    setNoteContent('');
    setTaskType((current) => current || taskTypeOptions[0] || '');
    if (preselectedEntity) {
      setSelectedEntityKey(`${preselectedEntity.entityType}:${preselectedEntity.entityId}`);
    } else if (leads[0]) {
      setSelectedEntityKey(`lead:${leads[0].id}`);
    }
  }, [open, initialMode, preselectedEntity, leads, taskTypeOptions]);

  useEffect(() => {
    if (open) setReminderEnabled(defaultRemindersEnabled);
  }, [open, defaultRemindersEnabled]);

  if (!open) return null;

  const entityChoices = [
    ...leads
      .filter((lead) => lead.status !== 'lost')
      .map((lead) => ({
        key: `lead:${lead.id}`,
        label: `${lead.name} (Lead)`,
        entityType: 'lead' as EntityKind,
        entityId: lead.id,
      })),
    ...customers.map((customer) => ({
      key: `customer:${customer.id}`,
      label: `${customer.name} (Customer)`,
      entityType: 'customer' as EntityKind,
      entityId: customer.id,
    })),
    ...professionals.map((professional) => ({
      key: `professional:${professional.id}`,
      label: `${professional.name} (Pro)`,
      entityType: 'professional' as EntityKind,
      entityId: professional.id,
    })),
  ];

  const resolvedChoice =
    entityChoices.find((entity) => entity.key === selectedEntityKey) ?? entityChoices[0];

  const staffName = resolveSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null);

  const handleCreateTask = async () => {
    if (!title.trim()) {
      setFormError('Please enter a task title');
      return;
    }
    if (!resolvedChoice) return;
    if (!taskType) {
      setFormError('Please select a task type');
      return;
    }
    try {
      const dueAt = new Date(`${dateStr}T${timeStr}:00`);
      await addTask({
        title: title.trim(),
        type: taskType,
        due_date: dateStr,
        due_time: timeStr,
        status: 'Pending',
        priority: 'Medium',
        assigned_to: staffName ?? 'System',
        reminder: reminderEnabled,
        is_recurring: isRecurring,
        recurrence_frequency: isRecurring ? 'weekly' : null,
        lead_id: resolvedChoice.entityType === 'lead' ? resolvedChoice.entityId : null,
        related_entity_type:
          resolvedChoice.entityType === 'lead' ? null : resolvedChoice.entityType,
        related_entity_id:
          resolvedChoice.entityType === 'lead' ? null : resolvedChoice.entityId,
        created_by: staffName ?? 'System',
      });
      onClose();
    } catch {
      setFormError('Could not save the task. Please try again.');
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) {
      setFormError('Please enter note text');
      return;
    }
    if (!resolvedChoice) return;
    try {
      await logActivity({
        lead_id: resolvedChoice.entityType === 'lead' ? resolvedChoice.entityId : undefined,
        customer_id:
          resolvedChoice.entityType === 'customer' ? resolvedChoice.entityId : undefined,
        activity_type: 'custom_note',
        activity_category: 'note',
        title: 'Note added from mobile',
        description: noteContent.trim(),
      });
      onClose();
    } catch {
      setFormError('Could not save the note. Please try again.');
    }
  };

  const handleAddReminder = async () => {
    if (!title.trim()) {
      setFormError('Please enter a reminder title');
      return;
    }
    if (!resolvedChoice) return;
    const dueAt = new Date(`${dateStr}T${timeStr}:00`);
    try {
      await addReminder({
        title: title.trim(),
        reminder_datetime: dueAt.toISOString(),
        entity_type: resolvedChoice.entityType,
        entity_id: resolvedChoice.entityId,
        is_recurring: isRecurring,
        recurrence_pattern: isRecurring ? 'weekly' : null,
        assigned_to: staffName ?? 'System',
      });
      onClose();
    } catch {
      setFormError('Could not save the reminder. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick Add"
        className="w-full bg-white rounded-t-[20px] p-5 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1A1A2E]">
            {mode === 'menu' ? 'Quick Add' : mode === 'task' ? 'New Task' : mode === 'note' ? 'Add Note' : 'New Reminder'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick add"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C] hover:bg-[#F3F4F5]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === 'menu' ? (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setMode('task')}
              className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center gap-2.5 text-sm font-semibold text-[#1A1A2E]"
            >
              <CheckCircle2 className="w-4 h-4 text-[#1A1A2E]" />
              <span>New Task</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('note')}
              className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center gap-2.5 text-sm font-semibold text-[#1A1A2E]"
            >
              <Search className="w-4 h-4 text-[#1A1A2E]" />
              <span>Add Note</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('reminder')}
              className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center gap-2.5 text-sm font-semibold text-[#1A1A2E]"
            >
              <Clock className="w-4 h-4 text-[#1A1A2E]" />
              <span>Set Reminder Alarm</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCallLogPicker();
              }}
              className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center gap-2.5 text-sm font-semibold text-[#1A1A2E]"
            >
              <PhoneCall className="w-4 h-4 text-[#1A1A2E]" />
              <span>Log a Call</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigate({ name: 'lead_form', mode: 'create' });
              }}
              className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center gap-2.5 text-sm font-semibold text-[#1A1A2E]"
            >
              <UserPlus className="w-4 h-4 text-[#1A1A2E]" />
              <span>New Lead</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigate({ name: 'entity_profile', entityType: 'customer', entityId: '' });
              }}
              className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center justify-between text-sm font-semibold text-[#1A1A2E]"
            >
              <span className="flex items-center gap-2.5">
                <UserCheck className="w-4 h-4 text-[#1A1A2E]" />
                <span>New Customer (Full CRM)</span>
              </span>
              <span className="font-utility text-xs text-[#47464C]">Desktop →</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigate({
                  name: 'full_crm_handoff',
                  targetLabel: 'New Professional (Full CRM)',
                  targetCode: 'professionals/new',
                });
              }}
              className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center justify-between text-sm font-semibold text-[#1A1A2E]"
            >
              <span className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-[#1A1A2E]" />
                <span>New Professional (Full CRM)</span>
              </span>
              <span className="font-utility text-xs text-[#47464C]">Desktop →</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {formError && (
              <div className="p-3 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="quick-entity-select"
                className="block text-xs font-semibold text-[#1A1A2E] mb-1"
              >
                Related Person *
              </label>
              <select
                id="quick-entity-select"
                value={selectedEntityKey}
                onChange={(event) => setSelectedEntityKey(event.target.value)}
                className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
              >
                {entityChoices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>

            {mode === 'note' ? (
              <div>
                <label
                  htmlFor="quick-note-text"
                  className="block text-xs font-semibold text-[#1A1A2E] mb-1"
                >
                  Note *
                </label>
                <textarea
                  id="quick-note-text"
                  rows={4}
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  placeholder="Enter site update, slab preference, or client feedback..."
                  className="w-full p-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                />
              </div>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="quick-title"
                    className="block text-xs font-semibold text-[#1A1A2E] mb-1"
                  >
                    {mode === 'task' ? 'Task Title *' : 'Reminder Title *'}
                  </label>
                  <input
                    id="quick-title"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={
                      mode === 'task'
                        ? 'e.g., Share Makrana quote breakdown'
                        : 'e.g., Call back before 5 PM'
                    }
                    className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                  />
                </div>

                {mode === 'task' && (
                  <div>
                    <label
                      htmlFor="quick-task-type"
                      className="block text-xs font-semibold text-[#1A1A2E] mb-1"
                    >
                      Task Type
                    </label>
                    <select
                      id="quick-task-type"
                      value={taskType}
                      onChange={(event) => setTaskType(event.target.value)}
                      className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                    >
                      {taskTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="quick-date"
                      className="block text-xs font-semibold text-[#1A1A2E] mb-1"
                    >
                      Date
                    </label>
                    <input
                      id="quick-date"
                      type="date"
                      value={dateStr}
                      onChange={(event) => setDateStr(event.target.value)}
                      className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="quick-time"
                      className="block text-xs font-semibold text-[#1A1A2E] mb-1"
                    >
                      Time
                    </label>
                    <input
                      id="quick-time"
                      type="time"
                      value={timeStr}
                      onChange={(event) => setTimeStr(event.target.value)}
                      className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                    />
                  </div>
                </div>

                {mode === 'task' && (
                  <div className="space-y-2">
                    <label className="flex items-center justify-between min-h-[44px] px-3 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0]">
                      <span className="text-sm font-medium text-[#1A1A2E]">Set Reminder Alarm</span>
                      <input
                        type="checkbox"
                        checked={reminderEnabled}
                        onChange={(event) => setReminderEnabled(event.target.checked)}
                        className="w-5 h-5 accent-[#1A1A2E]"
                      />
                    </label>
                    <label className="flex items-center justify-between min-h-[44px] px-3 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0]">
                      <span className="text-sm font-medium text-[#1A1A2E]">Weekly Recurring Task</span>
                      <input
                        type="checkbox"
                        checked={isRecurring}
                        onChange={(event) => setIsRecurring(event.target.checked)}
                        className="w-5 h-5 accent-[#1A1A2E]"
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              onClick={
                mode === 'task'
                  ? handleCreateTask
                  : mode === 'note'
                    ? handleAddNote
                    : handleAddReminder
              }
              className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base"
            >
              {mode === 'task'
                ? 'Save Task'
                : mode === 'note'
                  ? 'Save Note'
                  : 'Set Reminder Alarm'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Notifications drawer                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Notification drawer, backed by the live reminder list.
 *
 * Reminders are the only mobile-safe notification source; there is no
 * hallucinated content.
 */
export const NotificationsDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onNavigate: (route: MobileRoute) => void;
}> = ({ open, onClose, onNavigate }) => {
  const { reminders, dismissReminder } = useReminders();
  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { professionals } = useProfessionals();

  const notifications = useMemo(
    () =>
      buildMobileNotifications(
        reminders,
        toMobileLead,
        toMobileCustomer,
        toMobileProfessional,
      ),
    [reminders, leads, customers, professionals],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="w-full bg-white rounded-t-[20px] max-h-[85dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1A1A2E]">Notifications</h2>
            <p className="text-xs text-[#47464C]">Reminders & follow-ups</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#F1F5F9]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#47464C]">No notifications yet.</div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (notification.target_route) {
                    onClose();
                    onNavigate(notification.target_route);
                  }
                }}
                className={`w-full text-left p-4 flex items-start gap-3 transition-colors ${
                  notification.read ? 'bg-white' : 'bg-[#FFFBEB]/60'
                }`}
              >
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 bg-[#FFFBEB] text-[#D97706]">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#1A1A2E]">
                      {notification.title}
                    </span>
                    <span className="font-utility text-[11px] text-[#47464C] whitespace-nowrap shrink-0">
                      {notification.time_label}
                    </span>
                  </div>
                  <p className="text-xs text-[#47464C] mt-0.5 leading-relaxed">
                    {notification.body}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => {
              notifications.forEach((notification) => {
                const reminderId = notification.id.replace('reminder-', '');
                void dismissReminder(reminderId);
              });
            }}
            className="w-full min-h-[48px] rounded-[12px] border border-[#E2E8F0] bg-white text-[#1A1A2E] font-semibold text-base"
          >
            Mark all read
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Pending outbox drawer                                                      */
/* -------------------------------------------------------------------------- */

/** Drawer listing the durable mutation queue and its conflicts. */
export const PendingOutboxDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { outbox, isOnline, isSyncingOutbox, syncOutboxNow, resolveOutboxConflict } =
    useWeakSignalOutbox();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pending Sync Outbox"
        className="w-full bg-white rounded-t-[20px] max-h-[85dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1A1A2E]">Pending Sync Outbox</h2>
            <p className="font-utility text-xs text-[#47464C]">
              FIFO queue ({outbox.length}/50 device limit)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close outbox drawer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {outbox.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-[#059669] mx-auto" />
              <div className="text-sm font-semibold text-[#1A1A2E]">All updates synced</div>
              <p className="text-xs text-[#47464C]">No pending mutations on this device.</p>
            </div>
          ) : (
            outbox.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-[12px] border space-y-2 ${
                  item.status === 'needs_review'
                    ? 'bg-[#FEF2F2] border-[#FECACA]'
                    : 'bg-[#F8F9FA] border-[#E2E8F0]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#1A1A2E]">{item.label}</div>
                    <div className="font-utility text-[11px] text-[#47464C] mt-0.5">
                      Queued {formatShortDateTime(item.createdAt)}
                      {item.attempts > 0 ? ` · attempt ${item.attempts}` : ''}
                    </div>
                  </div>
                  <StatusBadge
                    tone={item.status === 'needs_review' ? 'overdue' : 'due_today'}
                    label={item.status === 'needs_review' ? 'Needs Review' : 'Queued'}
                  />
                </div>
                {item.conflictMessage && (
                  <p className="text-xs font-medium text-[#DC2626]">{item.conflictMessage}</p>
                )}
                {item.status === 'needs_review' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void resolveOutboxConflict(item.id, 'merge_discard')}
                      className="min-h-[44px] rounded-[10px] border border-[#E2E8F0] bg-white text-xs font-semibold text-[#1A1A2E]"
                    >
                      Discard Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => void resolveOutboxConflict(item.id, 'force_create')}
                      className="min-h-[44px] rounded-[10px] bg-[#1A1A2E] text-white text-xs font-semibold"
                    >
                      Keep Anyway
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-[#E2E8F0]">
          <button
            type="button"
            disabled={!isOnline || outbox.length === 0 || isSyncingOutbox}
            onClick={() => void syncOutboxNow()}
            className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] disabled:opacity-50 text-[#1A1A2E] font-semibold text-base flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingOutbox ? 'animate-spin' : ''}`} />
            <span>
              {!isOnline
                ? 'Offline — Waiting for Network'
                : isSyncingOutbox
                  ? 'Syncing Queue…'
                  : 'Sync Outbox Now'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
