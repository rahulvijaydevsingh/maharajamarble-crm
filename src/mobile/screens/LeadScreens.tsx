/**
 * Mobile lead screens.
 *
 * Ported from the AI Studio prototype (`mobile/screens/LeadScreens.tsx`) onto
 * the live Supabase-backed hooks. The prototype used a mock CRM adapter; every
 * screen here reads and writes the real tables instead:
 *
 *  - `useLeads()` / `useCustomers()` / `useProfessionals()` / `useTasks()` for
 *    the data,
 *  - `useMobileControlPanel()` for every option list (designation,
 *    construction stage, lead source, priority, material interests and the
 *    DB-only `lost_reason` field) — no option array is ever hardcoded here,
 *  - `useActiveStaffOptions()` + `@/mobile/lib/staffAttribution` for the
 *    INVARIANT-04 attribution columns (`assigned_to` / `created_by` /
 *    `updated_by` always store a staff **full name**, never an email or UUID),
 *  - `useWeakSignalOutbox().isOnline` to block destructive actions while the
 *    device is offline.
 *
 * D9 — the duplicate-lead gate is synchronous and local: it scans the already
 * loaded `leads` array by normalised 10-digit phone, never an extra query and
 * never a capped table scan. The `forceSave` flag is threaded end-to-end
 * through the form model (`LeadFormInput.forceSave`) so "Save Anyway" really
 * persists the lead and closes the duplicate modal.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Crosshair,
  FileText,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  StickyNote,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useLeads } from '@/hooks/useLeads';
import type { Lead as LiveLead, LeadInsert } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import type { CustomerInsert } from '@/hooks/useCustomers';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useTasks } from '@/hooks/useTasks';
import { useReminders } from '@/hooks/useReminders';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useMobileControlPanel } from '@/mobile/lib/controlPanelContext';
import { useActiveStaff, useActiveStaffOptions } from '@/hooks/useActiveStaff';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

import { normalizePhone10 } from '@/lib/phone';
import {
  isProfessionalDesignation,
  mapDesignationToProfessionalType,
  resolveProfessionalForProfessionalLead,
} from '@/lib/professionalResolver';
import { buildReferralLinkInsert } from '@/lib/professionalLeadAssociations';
import {
  buildLeadProfessionalLinkInserts,
  preservedLeadProfessionalIds,
  staleLeadProfessionalIds,
} from '@/mobile/lib/professionalLinks';
import { coordinatesToPlusCode } from '@/lib/plusCode';
import { extractExifThenCompress } from '@/mobile/lib/photoPipeline';
import {
  findDuplicateLead as findDuplicateLeadCandidate,
  shouldBlockOnDuplicate,
} from '@/mobile/lib/leadDuplicates';
import { importLeadFiles } from '@/lib/customerAttachmentsApi';
import { uploadLeadAttachmentFiles } from '@/mobile/lib/leadAttachments';

import { SubHeader } from '@/mobile/shell/MobileShell';
import { useWeakSignalOutbox } from '@/mobile/outbox/WeakSignalOutboxContext';
import {
  recordCallIntent,
  useCallIntentWatcher,
  type CallIntentTarget,
} from '@/mobile/hooks/useCallIntentWatcher';
import { resolveSafeStaffName, staffNameFromOptionLabel } from '@/mobile/lib/staffAttribution';
import {
  parseAdditionalContacts,
  parseReferredBy,
  toAlternatePhoneValue,
  toCustomerInsert,
  toLeadInsert,
  toLeadUpdate,
  toMobileLead,
} from '@/mobile/lib/mappers';
import {
  LEAD_CREATE_STEPS,
  retryLeadCreateEffects,
  runLeadCreateEffects,
  type LeadCreateEffectsDeps,
  type LeadCreateEffectsInput,
  type LeadCreateEffectsResult,
} from '@/mobile/lib/leadCreateEffects';
import {
  buildMapsUrl,
  buildWhatsAppUrl,
  combineDateAndTime,
  formatFileSize,
  formatPhoneDisplay,
  extractEditablePhone10,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/mobile/lib/format';
import type {
  AdditionalContact,
  Lead,
  LeadAttachment,
  LeadFormInput,
  MobileRoute,
  ProfessionalRef,
} from '@/mobile/types/crmTypes';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/** A live professional flattened into the shape the mobile screens render. */
interface ProfessionalOption {
  id: string;
  full_name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  firm_name: string | null;
  address: string | null;
  professional_type: string;
  status: string;
}

/**
 * INVARIANT-04: the value written to `assigned_to` / `created_by` /
 * `updated_by` is always a staff **full name**.
 *
 * The explicitly chosen staff member wins; the signed-in profile full name is
 * the fallback. Both go through `resolveSafeStaffName`, so an email address or
 * a UUID can never reach an attribution column. "System" is the last resort.
 */
function resolveAttributionName(
  candidate: string | null | undefined,
  profileFullName: string | null | undefined,
): string {
  const preferred = resolveSafeStaffName(candidate, null);
  if (preferred) return preferred;
  return resolveSafeStaffName(candidate, profileFullName) ?? 'System';
}

/** A short, human readable identifier for a lead row (the prototype's code). */
function leadReference(lead: { id: string }): string {
  return `#${lead.id.slice(0, 8)}`;
}

/** Local inline validation message; do not import this across screen modules. */
const InlineError: React.FC<{ id?: string; message: string }> = ({ id, message }) => (
  <p id={id} role="alert" className="mt-1.5 text-xs font-semibold text-[#DC2626] flex items-start gap-1">
    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
    <span>{message}</span>
  </p>
);


/**
 * The invalid fields in the order they appear on the screen.
 *
 * The validation summary scrolls to and focuses the **first** invalid field,
 * so this order has to match the visual order — not the order in which the
 * validation function happens to check the fields.
 */
const VALIDATION_FIELD_ORDER: Array<{ errorKey: string; elementId: string }> = [
  { errorKey: 'designation', elementId: 'lead-designation' },
  { errorKey: 'fullName', elementId: 'lead-fullname' },
  { errorKey: 'phone', elementId: 'lead-phone' },
  { errorKey: 'siteLocation', elementId: 'lead-site' },
  { errorKey: 'materialInterests', elementId: 'lead-materials' },
];

/**
 * Scrolls to and focuses the first invalid field.
 *
 * The element is marked with `aria-invalid` by the form, so the focus moves
 * to the field the user has to fix first.
 */
function focusFirstInvalidField(errors: Record<string, string>): void {
  if (typeof document === 'undefined') return;
  const target = VALIDATION_FIELD_ORDER.find((field) => Boolean(errors[field.errorKey]));
  if (!target) return;
  const element = document.getElementById(target.elementId);
  if (!element) return;
  try {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof element.focus === 'function') element.focus();
  } catch {
    /* the browser refused to scroll — the summary banner still names the field */
  }
}

/**
 * The lead statuses that never count as a duplicate.
 *
 * A lost or a deleted lead is not a duplicate of anything — the field user
 * must not be blocked by a record that is already closed.
 */
const NON_DUPLICATE_LEAD_STATUSES = ['lost', 'deleted'];

/** True when a lead may still be shown as a duplicate candidate. */
function isDuplicateCandidateStatus(status?: string | null): boolean {
  const value = (status ?? '').trim().toLowerCase();
  if (!value) return true;
  return !NON_DUPLICATE_LEAD_STATUSES.includes(value);
}

/* -------------------------------------------------------------------------- */
/* Duplicate lead modal (z-[60])                                             */
/* -------------------------------------------------------------------------- */

interface DuplicateLeadModalProps {
  duplicate: LiveLead;
  onCancel: () => void;
  onViewExisting: () => void;
  onSaveAnyway: () => void;
}

/**
 * D9 — the duplicate-lead gate.
 *
 * "Save Anyway" forces the save (the duplicate check is skipped and the lead
 * is genuinely persisted), "Cancel" keeps the form open so the number can be
 * corrected, and "View Existing" jumps to the matching lead.
 */
const DuplicateLeadModal: React.FC<DuplicateLeadModalProps> = ({
  duplicate,
  onCancel,
  onViewExisting,
  onSaveAnyway,
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Duplicate Lead Warning"
      className="w-full max-w-sm bg-white rounded-[16px] border border-[#E2E8F0] p-5 space-y-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-[#1A1A2E]">Duplicate Phone Detected</h3>
          <p className="text-xs text-[#47464C] mt-1">
            This 10-digit number already belongs to an existing lead in the CRM.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0] space-y-1">
        <div className="text-sm font-bold text-[#1A1A2E]">
          {duplicate.name} ({leadReference(duplicate)})
        </div>
        <div className="text-xs text-[#47464C]">
          {duplicate.site_location || duplicate.address || 'No site location recorded'}
        </div>
        <div className="font-utility text-xs text-[#47464C]">
          Assigned to: {duplicate.assigned_to || 'Unassigned'}
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onViewExisting}
          className="w-full min-h-[48px] rounded-[12px] bg-[#1A1A2E] text-white font-semibold text-sm"
        >
          View Existing
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-[12px] border border-[#E2E8F0] bg-white text-xs font-semibold text-[#1A1A2E]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSaveAnyway}
            className="min-h-[44px] rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] text-xs font-semibold text-[#D97706]"
          >
            Save Anyway
          </button>
        </div>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Professional search combobox + pill                                        */
/* -------------------------------------------------------------------------- */

interface ProfessionalComboboxProps {
  inputId: string;
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: ProfessionalOption[];
  onSelect: (professional: ProfessionalOption) => void;
  emptyMessage: string;
}

/** The "Search Existing Professional" combobox used by the primary contact and
 *  by every additional contact (desktop parity). */
const ProfessionalCombobox: React.FC<ProfessionalComboboxProps> = ({
  inputId,
  label,
  placeholder,
  query,
  onQueryChange,
  open,
  onOpenChange,
  candidates,
  onSelect,
  emptyMessage,
}) => {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.firm_name || '').toLowerCase().includes(q) ||
        p.phone.includes(q),
    );
  }, [candidates, query]);

  return (
    <div className="relative">
      <label htmlFor={inputId} className="block text-xs font-semibold text-[#1A1A2E] mb-1">
        {label}
      </label>
      <div className="relative">
        <Search className="w-4 h-4 text-[#47464C] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={inputId}
          type="text"
          value={query}
          onFocus={() => onOpenChange(true)}
          onChange={(e) => {
            onQueryChange(e.target.value);
            onOpenChange(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full min-h-[48px] pl-9 pr-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-white border border-[#E2E8F0] rounded-[12px] shadow-lg max-h-56 overflow-y-auto divide-y divide-[#F1F5F9]">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-[#47464C]">{emptyMessage}</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-[#F8F9FA]"
              >
                <div className="text-sm font-semibold text-[#1A1A2E]">{p.full_name}</div>
                <div className="text-xs text-[#47464C]">
                  {p.firm_name || 'Independent'} · {formatPhoneDisplay(p.phone)}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

interface ProfessionalPillProps {
  professional: ProfessionalOption;
  onClear: () => void;
  onChange: () => void;
  onViewProfile: () => void;
}

/** The linked professional pill — Clear / Change / View Profile. */
const ProfessionalPill: React.FC<ProfessionalPillProps> = ({
  professional,
  onClear,
  onChange,
  onViewProfile,
}) => (
  <div className="p-3 rounded-[12px] bg-[#ECFDF5] border border-[#A7F3D0] space-y-2">
    <div className="flex items-start gap-2">
      <UserCheck className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-[#047857] truncate">{professional.full_name}</div>
        <div className="text-xs text-[#065F46] truncate">
          {professional.firm_name || 'Independent'} · {formatPhoneDisplay(professional.phone)}
        </div>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onViewProfile}
        className="min-h-[44px] px-3 rounded-[10px] bg-white border border-[#A7F3D0] text-xs font-semibold text-[#047857]"
      >
        View Profile
      </button>
      <button
        type="button"
        onClick={onChange}
        className="min-h-[44px] px-3 rounded-[10px] bg-white border border-[#A7F3D0] text-xs font-semibold text-[#047857]"
      >
        Change
      </button>
      <button
        type="button"
        onClick={onClear}
        className="min-h-[44px] px-3 rounded-[10px] bg-white border border-[#FECACA] text-xs font-semibold text-[#DC2626]"
      >
        Clear
      </button>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* MobileLeadForm                                                             */
/* -------------------------------------------------------------------------- */

export const MobileLeadForm: React.FC<{
  mode: 'create' | 'edit';
  leadId?: string;
  onCancel: () => void;
  onNavigate: (route: MobileRoute) => void;
  onOpenQuickAddMode: (mode: 'task' | 'note' | 'reminder', leadId: string) => void;
  /** Records the intent to call — shared with the mobile shell. */
  onBeginCall?: (target: CallIntentTarget) => void;
}> = ({ mode, leadId, onCancel, onNavigate, onOpenQuickAddMode, onBeginCall }) => {
  const { leads, loading: leadsLoading, addLead, updateLead } = useLeads();
  const { professionals } = useProfessionals();
  const { addTask } = useTasks();
  const { addReminder } = useReminders();
  const { getFieldOptions } = useMobileControlPanel();
  const { defaultRemindersEnabled } = useSystemSettings();
  const { options: staffOptions } = useActiveStaffOptions();
  const { staffMembers } = useActiveStaff();
  const { hasPermission } = usePermissions();
  const { profile } = useAuth();
  const { logActivity } = useLogActivity();
  const { isOnline, enqueue } = useWeakSignalOutbox();
  const { toast } = useToast();

  /**
   * Permission gating.
   *
   * A read-only role (`sales_viewer`) gets a clean read-only experience: the
   * write CTAs are hidden instead of failing at the API.
   */
  const canCreateLead = hasPermission('leads.create');
  const canEditLead = hasPermission('leads.edit');
  const canWriteThisLead = mode === 'create' ? canCreateLead : canEditLead;

  /* ----------------------------- option lists ---------------------------- */

  const designationOptions = getFieldOptions('leads', 'designation');
  const stageOptions = getFieldOptions('leads', 'construction_stage');
  const sourceOptions = getFieldOptions('leads', 'source');
  const priorityOptions = getFieldOptions('leads', 'priority');
  const materialOptions = getFieldOptions('materials', 'materials');
  const hasMaterialOptions = materialOptions.length > 0;
  const hasPriorityOptions = priorityOptions.length > 0;

  const defaultDesignation =
    designationOptions.find((o) => o.isDefault)?.value ?? designationOptions[0]?.value ?? '';
  const defaultStage =
    stageOptions.find((o) => o.isDefault)?.value ?? stageOptions[0]?.value ?? '';
  const defaultSource =
    sourceOptions.find((o) => o.isDefault)?.value ?? sourceOptions[0]?.value ?? '';
  const defaultPriority =
    priorityOptions.find((o) => o.isDefault)?.value ?? priorityOptions[0]?.value ?? '';

  /**
   * The default material list.
   *
   * `getFieldOptions()` returns a fresh array on every render, so the default
   * is derived from the *content* of the option list — otherwise the array
   * identity changes on every render and the defaults effect below re-runs on
   * every render.
   */
  const defaultMaterial = materialOptions.find((option) => option.isDefault)?.value
    ?? materialOptions[0]?.value
    ?? '';
  const defaultMaterials = useMemo(
    () => defaultMaterial ? [defaultMaterial] : [],
    [defaultMaterial],
  );

  /* ------------------------------- lead data ----------------------------- */

  const editingLead = useMemo(
    () => (mode === 'edit' && leadId ? leads.find((l) => l.id === leadId) : undefined),
    [mode, leadId, leads],
  );

  const professionalCandidates = useMemo<ProfessionalOption[]>(
    () =>
      professionals.map((p) => ({
        id: p.id,
        full_name: p.name ?? '',
        phone: p.phone ?? '',
        alternate_phone: p.alternate_phone ?? null,
        email: p.email ?? null,
        firm_name: p.firm_name ?? null,
        address: p.address ?? null,
        professional_type: p.professional_type ?? '',
        status: p.status ?? 'active',
      })),
    [professionals],
  );

  /** The exact shape `resolveProfessionalForProfessionalLead` expects. */
  const resolverCandidates = useMemo(
    () =>
      professionalCandidates.map((p) => ({
        id: p.id,
        phone: p.phone,
        alternate_phone: p.alternate_phone ?? undefined,
        status: p.status,
      })),
    [professionalCandidates],
  );

  /* --------------------------------- state ------------------------------- */

  const defaultNextActionIso = useMemo(
    () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    [],
  );

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [firmName, setFirmName] = useState('');
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [professionalSearchQuery, setProfessionalSearchQuery] = useState('');
  const [professionalDropdownOpen, setProfessionalDropdownOpen] = useState(false);

  const [siteLocation, setSiteLocation] = useState('');
  const [plusCode, setPlusCode] = useState('');
  const [siteLat, setSiteLat] = useState<number | null>(null);
  const [siteLng, setSiteLng] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [materialInterests, setMaterialInterests] = useState<string[]>([]);
  const [constructionStage, setConstructionStage] = useState('');
  const [estimatedQtySqft, setEstimatedQtySqft] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [referredBy, setReferredBy] = useState<string | ProfessionalRef | null>(null);
  const [referrerSearchQuery, setReferrerSearchQuery] = useState('');
  const [referrerDropdownOpen, setReferrerDropdownOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState(Number.NaN);
  const [dateStr, setDateStr] = useState(() => toLocalDateInputValue(defaultNextActionIso));
  const [timeStr, setTimeStr] = useState(() => toLocalTimeInputValue(defaultNextActionIso));
  const [reminderEnabled, setReminderEnabled] = useState(defaultRemindersEnabled);
  const [assignedStaffId, setAssignedStaffId] = useState('');

  const [additionalContacts, setAdditionalContacts] = useState<AdditionalContact[]>([]);
  const [stagedAttachments, setStagedAttachments] = useState<LeadAttachment[]>([]);
  /** Per additional-contact professional search query / dropdown state. */
  const [acQueries, setAcQueries] = useState<Record<string, string>>({});
  const [acOpen, setAcOpen] = useState<Record<string, boolean>>({});

  const [showOptionalContact, setShowOptionalContact] = useState(false);
  const [showOptionalQty, setShowOptionalQty] = useState(false);
  const [showOptionalSourceNote, setShowOptionalSourceNote] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  /** The duplicate shown in the modal — only ever opened by a Submit. */
  const [duplicateWarning, setDuplicateWarning] = useState<LiveLead | null>(null);
  /** The calm inline hint under the phone field while the user is typing. */
  const [duplicateHint, setDuplicateHint] = useState<LiveLead | null>(null);
  /** True once the user pressed Save — the validation summary shows then. */
  const [submitAttempted, setSubmitAttempted] = useState(false);
  /** The post-create effects that failed — the lead itself was saved. */
  const [effectsFailure, setEffectsFailure] = useState<LeadCreateEffectsResult | null>(null);
  const [retryingEffects, setRetryingEffects] = useState(false);
  const [savedPostLead, setSavedPostLead] = useState<Lead | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /** Object URLs created for the staged previews — every one is revoked again. */
  const objectUrlsRef = useRef<string[]>([]);
  /** D9: true while the user explicitly asked to save despite a duplicate. */
  const forceSaveRef = useRef(false);
  const hydratedLeadIdRef = useRef<string | null>(null);
  const materialDefaultsAppliedRef = useRef(false);
  const priorityDefaultAppliedRef = useRef(false);
  /**
   * The `referred_by` value the lead was hydrated with.
   *
   * An Edit save compares the current value against this one: when nothing
   * changed, the JSONB column is left alone instead of being rewritten.
   */
  const originalReferredByRef = useRef<string | ProfessionalRef | null>(null);
  /** The designation + phone the auto-match already ran for. */
  const autoMatchKeyRef = useRef<string | null>(null);
  /** True once the user picked an assignee by hand. */
  const assignedStaffTouchedRef = useRef(false);

  /* ------------------------------ derivations ---------------------------- */

  const isProfRole = isProfessionalDesignation(designation);
  const normalizedPrimaryPhone = normalizePhone10(phone);
  /**
   * The alternate phone is stored EXACTLY as it was typed unless it is a valid
   * 10-digit Indian mobile.
   *
   * A landline (`011-23456789`) or an international number must never be
   * turned into `null` — that silently dropped a contact detail on the last
   * edit. `toAlternatePhoneValue()` owns that rule.
   */
  const alternatePhoneValue = alternatePhone.trim()
    ? toAlternatePhoneValue(alternatePhone)
    : null;

  const linkedProfessional = useMemo(
    () => professionalCandidates.find((p) => p.id === professionalId) ?? null,
    [professionalCandidates, professionalId],
  );

  const attributionName = useMemo(() => {
    const label = staffOptions.find((o) => o.id === assignedStaffId)?.label ?? null;
    return resolveAttributionName(staffNameFromOptionLabel(label, null), profile?.full_name);
  }, [staffOptions, assignedStaffId, profile?.full_name]);

  /**
   * INVARIANT-04 — the signed-in actor.
   *
   * `created_by` / `updated_by` always record the person who performed the
   * write, never the staff member the record is assigned to.
   */
  const actorName = useMemo(
    () => resolveSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null) ?? 'System',
    [profile?.full_name],
  );

  /* -------------------------------- helpers ------------------------------ */

  const revokeObjectUrl = (url?: string | null) => {
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore — the browser already dropped it */
    }
    objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== url);
  };

  const revokeAllObjectUrls = () => {
    objectUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    });
    objectUrlsRef.current = [];
  };

  const resetFormState = () => {
    revokeAllObjectUrls();
    setFullName('');
    setPhone('');
    setAlternatePhone('');
    setEmail('');
    setDesignation('');
    setFirmName('');
    setProfessionalId(null);
    setProfessionalSearchQuery('');
    setProfessionalDropdownOpen(false);
    setSiteLocation('');
    setPlusCode('');
    setSiteLat(null);
    setSiteLng(null);
    setMaterialInterests([]);
    setConstructionStage('');
    setEstimatedQtySqft('');
    setLeadSource('');
    setReferredBy('');
    setNotes('');
    setPriority(Number.NaN);
    setDateStr(toLocalDateInputValue(defaultNextActionIso));
    setTimeStr(toLocalTimeInputValue(defaultNextActionIso));
    setReminderEnabled(defaultRemindersEnabled);
    setAssignedStaffId('');
    setAdditionalContacts([]);
    setStagedAttachments([]);
    setAcQueries({});
    setAcOpen({});
    setShowOptionalContact(false);
    setShowOptionalQty(false);
    setShowOptionalSourceNote(false);
    setErrors({});
    setDuplicateWarning(null);
    setDuplicateHint(null);
    setSubmitAttempted(false);
    setEffectsFailure(null);
    forceSaveRef.current = false;
    hydratedLeadIdRef.current = null;
    materialDefaultsAppliedRef.current = false;
    priorityDefaultAppliedRef.current = false;
    autoMatchKeyRef.current = null;
    originalReferredByRef.current = null;
    assignedStaffTouchedRef.current = false;
  };

  /* --------------------------- lifecycle effects ------------------------- */

  // Revoke every preview URL when the screen goes away — the prototype leaked
  // them, this one does not.
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
      objectUrlsRef.current = [];
    };
  }, []);

  // Hydrate the form once the edited lead has arrived.
  useEffect(() => {
    if (mode !== 'edit' || !editingLead) return;
    if (hydratedLeadIdRef.current === editingLead.id) return;
    hydratedLeadIdRef.current = editingLead.id;

    const rawAdditional = parseAdditionalContacts(editingLead.additional_contacts);

    setFullName(editingLead.name ?? '');
    setPhone(extractEditablePhone10(editingLead.phone ?? ''));
    // A landline (or any other non-10-digit number) is preserved exactly as
    // it is stored — `normalizePhone10` would throw it away.
    setAlternatePhone(editingLead.alternate_phone ?? '');
    setEmail(editingLead.email ?? '');
    setDesignation(editingLead.designation || defaultDesignation);
    setFirmName(editingLead.firm_name ?? '');
    setProfessionalId(null);
    setProfessionalSearchQuery('');
    setSiteLocation(editingLead.site_location || editingLead.address || '');
    setPlusCode(editingLead.site_plus_code ?? '');
    setSiteLat(null);
    setSiteLng(null);
    setMaterialInterests(
      Array.isArray(editingLead.material_interests) ? editingLead.material_interests : [],
    );
    setConstructionStage(editingLead.construction_stage || defaultStage);
    setEstimatedQtySqft(
      editingLead.estimated_quantity ? String(editingLead.estimated_quantity) : '',
    );
    setLeadSource(editingLead.source || defaultSource);
    const parsedReferrer = parseReferredBy(editingLead.referred_by);
    setReferredBy(parsedReferrer);
    originalReferredByRef.current = parsedReferrer;
    setNotes(editingLead.notes ?? '');
    setPriority(typeof editingLead.priority === 'number' ? editingLead.priority : Number.NaN);
    setDateStr(toLocalDateInputValue(editingLead.next_follow_up ?? defaultNextActionIso));
    setTimeStr(toLocalTimeInputValue(editingLead.next_follow_up ?? defaultNextActionIso));
    setReminderEnabled(Boolean(editingLead.next_follow_up));
    setAdditionalContacts(
      rawAdditional.map((contact) => ({
        ...contact,
        id: contact.id || `ac-${Date.now()}`,
        is_professional:
          contact.is_professional ?? isProfessionalDesignation(contact.designation),
      })),
    );
    setStagedAttachments([]);
    setShowOptionalContact(Boolean(editingLead.alternate_phone || editingLead.email || rawAdditional.length));
    setShowOptionalQty(Boolean(editingLead.estimated_quantity));
    setShowOptionalSourceNote(Boolean(editingLead.referred_by || editingLead.notes));
    setErrors({});
    setDuplicateWarning(null);

    assignedStaffTouchedRef.current = false;
  }, [mode, editingLead, defaultDesignation, defaultStage, defaultSource, defaultNextActionIso]);

  /**
   * The junction rows are read on Edit.
   *
   * The mobile form used to write `lead_professionals` but never read it, so
   * the professional link of an existing lead was lost as soon as the form
   * was opened — the additional contacts only matched by phone.
   */
  useEffect(() => {
    if (mode !== 'edit' || !editingLead) return;
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from('lead_professionals')
        .select('professional_id, is_primary_contact')
        .eq('lead_id', editingLead.id);
      if (cancelled || error || !data || data.length === 0) return;

      const rows = data as Array<{
        professional_id: string;
        is_primary_contact: boolean;
      }>;
      const primary = rows.find((row) => row.is_primary_contact);
      if (primary?.professional_id) {
        setProfessionalId(primary.professional_id);
      }

      const additionalIds = rows
        .filter((row) => !row.is_primary_contact)
        .map((row) => row.professional_id);

      if (additionalIds.length === 0) return;
      setAdditionalContacts((prev) =>
        prev.map((contact, index) =>
          index < additionalIds.length && !contact.professional_id
            ? { ...contact, professional_id: additionalIds[index] }
            : contact,
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, editingLead]);

  // Keep the current assignee when it still matches an active staff member.
  // The staff list arrives asynchronously, so this runs on its own and never
  // overwrites a choice the user already made.
  useEffect(() => {
    if (mode !== 'edit' || !editingLead) return;
    if (assignedStaffTouchedRef.current) return;
    const match = staffOptions.find((o) => o.name === editingLead.assigned_to);
    const nextId = match?.id ?? '';
    setAssignedStaffId((prev) => (prev === nextId ? prev : nextId));
  }, [mode, editingLead, staffOptions]);

  // Apply the Control Panel defaults for a brand new lead. The values follow
  // whatever the panel actually offers, so a late-loading panel never leaves a
  // stale option behind.
  useEffect(() => {
    if (mode !== 'create') return;
    setDesignation((prev) =>
      designationOptions.some((o) => o.value === prev) ? prev : defaultDesignation,
    );
    setConstructionStage((prev) =>
      stageOptions.some((o) => o.value === prev) ? prev : defaultStage,
    );
    setLeadSource((prev) => (sourceOptions.some((o) => o.value === prev) ? prev : defaultSource));

    if (!materialDefaultsAppliedRef.current && hasMaterialOptions) {
      materialDefaultsAppliedRef.current = true;
      setMaterialInterests((prev) => (prev.length === 0 ? defaultMaterials : prev));
    }
    if (!priorityDefaultAppliedRef.current && hasPriorityOptions) {
      priorityDefaultAppliedRef.current = true;
      const configuredPriority = Number(defaultPriority);
      setPriority((prev) =>
        Number.isFinite(prev)
          ? prev
          : Number.isFinite(configuredPriority)
            ? configuredPriority
            : Number.NaN,
      );
    }
  }, [
    mode,
    designationOptions,
    stageOptions,
    sourceOptions,
    hasMaterialOptions,
    hasPriorityOptions,
    defaultDesignation,
    defaultStage,
    defaultSource,
    defaultMaterials,
    defaultPriority,
  ]);

  // Desktop parity (b): auto-match an existing ACTIVE professional when the
  // primary phone reaches 10 digits and the designation is a canonical
  // professional designation. Resolution runs against the already loaded
  // professionals array — no extra query, no capped scan.
  useEffect(() => {
    if (!isProfRole) return;
    if (professionalId) return;
    if (!normalizedPrimaryPhone) return;
    // The professionals list arrives asynchronously. The match key is only
    // consumed once the list actually holds candidates — otherwise a late
    // loading list would never match anything.
    if (professionals.length === 0) return;
    const matchKey = `${designation}|${normalizedPrimaryPhone}`;
    // The match is attempted once per designation + phone so that an explicit
    // "Clear" is not undone by the next render.
    if (autoMatchKeyRef.current === matchKey) return;
    autoMatchKeyRef.current = matchKey;
    const matched = resolveProfessionalForProfessionalLead(
      designation,
      normalizedPrimaryPhone,
      resolverCandidates,
    );
    if (!matched) return;
    const professional = professionalCandidates.find((p) => p.id === matched);
    setProfessionalId(matched);
    if (professional) {
      setFullName((prev) => prev || professional.full_name);
      setFirmName((prev) => prev || professional.firm_name || '');
      setEmail((prev) => prev || professional.email || '');
    }
  }, [
    isProfRole,
    professionalId,
    normalizedPrimaryPhone,
    designation,
    professionals.length,
    resolverCandidates,
    professionalCandidates,
  ]);

  /* ------------------------------ interactions --------------------------- */

  /**
   * D9 — synchronous, local duplicate detection over the already loaded leads.
   *
   * The check skips:
   *  - the lead that is being edited (it never matches itself),
   *  - leads that are lost or deleted (they are closed records),
   *  - professional designations (a professional legitimately shares the
   *    number with the professional record it links to).
   */
  const findDuplicateLead = (
    phone10: string | null,
    excludeId?: string,
    designationValue: string = designation,
  ): LiveLead | null => {
    if (!phone10) return null;
    // The matching rules live in `@/mobile/lib/leadDuplicates` so they are
    // unit tested: exact 10-digit match, professional designations excluded,
    // and the lead being edited never matches itself.
    const candidate = findDuplicateLeadCandidate(
      leads
        .filter((lead) => isDuplicateCandidateStatus(lead.status))
        .map((lead) => ({
          id: lead.id,
          full_name: lead.name,
          phone: lead.phone,
          designation: lead.designation,
          status: lead.status,
          assigned_to: lead.assigned_to,
        })),
      phone10,
      { designation: designationValue || null, excludeLeadId: excludeId ?? null },
    );
    if (!candidate) return null;
    return leads.find((lead) => lead.id === candidate.id) ?? null;
  };

  /**
   * The calm inline hint under the phone field.
   *
   * The modal is never opened while the user is typing — it only ever opens
   * on a Submit.
   */
  const refreshDuplicateHint = (
    phone10: string | null,
    designationValue: string = designation,
  ) => {
    const clean = normalizePhone10(phone10);
    if (!clean || isProfessionalDesignation(designationValue)) {
      setDuplicateHint(null);
      return;
    }
    setDuplicateHint(findDuplicateLead(clean, editingLead?.id, designationValue));
  };

  const handlePrimaryPhoneChange = (raw: string) => {
    const digits = extractEditablePhone10(raw);
    setPhone(digits);
    setErrors((prev) => ({ ...prev, phone: '' }));
    // Editing the number cancels a forced save.
    forceSaveRef.current = false;
    refreshDuplicateHint(digits);
  };

  const handleAlternatePhoneChange = (raw: string) => {
    // The number is kept exactly as it is typed — a landline must survive.
    setAlternatePhone(raw);
  };

  const handleDesignationChange = (next: string) => {
    setDesignation(next);
    setErrors((prev) => ({ ...prev, designation: '' }));
    if (!isProfessionalDesignation(next)) {
      setProfessionalId(null);
      setProfessionalSearchQuery('');
      setProfessionalDropdownOpen(false);
    }
    const clean = normalizePhone10(phone);
    if (!isProfessionalDesignation(next) && clean) {
      refreshDuplicateHint(clean, next);
    } else {
      setDuplicateHint(null);
    }
  };

  const handleSelectExistingProfessional = (professional: ProfessionalOption) => {
    setProfessionalId(professional.id);
    setFullName(professional.full_name);
    setPhone(extractEditablePhone10(professional.phone));
    setAlternatePhone(professional.alternate_phone ?? '');
    setEmail(professional.email ?? '');
    setFirmName(professional.firm_name ?? '');
    if (!siteLocation.trim() && professional.address) {
      setSiteLocation(professional.address);
    }
    setProfessionalSearchQuery(professional.full_name);
    setProfessionalDropdownOpen(false);
    setErrors((prev) => ({ ...prev, fullName: '', phone: '' }));
  };

  const handleClearProfessional = () => {
    setProfessionalId(null);
    setProfessionalSearchQuery('');
    setProfessionalDropdownOpen(false);
  };

  const handleChangeProfessional = () => {
    setProfessionalSearchQuery('');
    setProfessionalDropdownOpen(true);
  };

  const handleViewProfessionalProfile = (professionalIdValue: string) => {
    onNavigate({ name: 'entity_profile', entityType: 'professional', entityId: professionalIdValue });
  };

  const toggleMaterial = (value: string) => {
    setMaterialInterests((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
    setErrors((prev) => ({ ...prev, materialInterests: '' }));
  };

  const handleUseCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast({
        title: 'Location unavailable',
        description: 'This device does not expose a GPS location.',
        variant: 'destructive',
      });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        try {
          setPlusCode(coordinatesToPlusCode(latitude, longitude));
          setSiteLat(latitude);
          setSiteLng(longitude);
          setErrors((prev) => ({ ...prev, siteLocation: '' }));
        } catch {
          /* the coordinates were out of range — keep the manual address */
        }
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        toast({
          title: 'Location unavailable',
          description: 'Could not read the GPS position. Enter the address manually.',
          variant: 'destructive',
        });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  /**
   * Strict 2-step photo pipeline.
   *
   * STEP 1 — the EXIF GPS block is read from the *raw* file, because the
   *          compression in step 2 strips the metadata.
   * STEP 2 — the raw file is compressed to a 1024px / <=200KB JPEG.
   */
  const handleSitePhotoPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = event.target.files?.[0];
    event.target.value = '';
    if (!rawFile) return;

    setPhotoBusy(true);
    try {
      // `extractExifThenCompress` guarantees the order: the EXIF GPS block is
      // read from the RAW file first, because the compression in step 2 strips
      // the metadata. The file is compressed to 1024px / <=200KB JPEG.
      const { file: compressed, exifGps } = await extractExifThenCompress(rawFile);

      const previewUrl = URL.createObjectURL(compressed);
      objectUrlsRef.current.push(previewUrl);

      const exifPlusCode = exifGps?.plusCode;
      if (exifGps) {
        if (!plusCode) {
          setPlusCode(exifPlusCode ?? '');
          setSiteLat(exifGps.latitude);
          setSiteLng(exifGps.longitude);
        }
      }

      const attachment: LeadAttachment = {
        id: `latt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: compressed.name || rawFile.name,
        type: rawFile.type === 'application/pdf' ? 'pdf' : 'image',
        sizeLabel: formatFileSize(compressed.size),
        url: previewUrl,
        // The compressed file travels with the staged attachment so it can be
        // uploaded once the lead is saved. The `blob:` preview above is never
        // persisted.
        localFile: compressed,
        uploadedAt: new Date().toISOString(),
        uploadedBy: attributionName,
        exifGps:
          exifGps && exifPlusCode
            ? { lat: exifGps.latitude, lng: exifGps.longitude, plusCode: exifPlusCode }
            : undefined,
      };
      setStagedAttachments((prev) => [...prev, attachment]);
    } catch {
      toast({
        title: 'Photo not added',
        description: 'The image could not be processed. Try another photo.',
        variant: 'destructive',
      });
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeStagedAttachment = (id: string) => {
    const target = stagedAttachments.find((a) => a.id === id);
    revokeObjectUrl(target?.url);
    setStagedAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const addAdditionalContact = () => {
    setAdditionalContacts((prev) => [
      ...prev,
      {
        id: `ac-${Date.now()}-${prev.length}`,
        name: '',
        phone: '',
        relation: '',
        designation: defaultDesignation,
        is_professional: false,
      },
    ]);
  };

  const updateAdditionalContact = (index: number, patch: Partial<AdditionalContact>) => {
    setAdditionalContacts((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  /**
   * The phone of an additional contact.
   *
   * A professional contact whose phone reaches 10 digits is auto-matched
   * against the existing professionals — the same rule the primary contact
   * uses.
   */
  const handleAdditionalContactPhoneChange = (index: number, raw: string) => {
    const digits = extractEditablePhone10(raw);
    const contact = additionalContacts[index];
    const patch: Partial<AdditionalContact> = { phone: digits };

    const isProfessionalContact =
      contact?.is_professional ?? isProfessionalDesignation(contact?.designation);
    const phone10 = normalizePhone10(digits);

    if (isProfessionalContact && phone10) {
      const matched = professionalCandidates.find((professional) => {
        if ((professional.status ?? 'active').toLowerCase() !== 'active') return false;
        return (
          normalizePhone10(professional.phone) === phone10 ||
          normalizePhone10(professional.alternate_phone) === phone10
        );
      });
      if (matched) {
        patch.professional_id = matched.id;
        patch.is_professional = true;
        patch.name = contact?.name || matched.full_name;
        patch.firm_name = contact?.firm_name || matched.firm_name || '';
        patch.email = contact?.email || matched.email || undefined;
      }
    }

    updateAdditionalContact(index, patch);
  };

  const removeAdditionalContact = (index: number) => {
    setAdditionalContacts((prev) => prev.filter((_, i) => i !== index));
  };

  /* --------------------------------- saving ------------------------------ */

  /** Builds the form model. `forceSave` is threaded into the model so the
   *  duplicate gate and the write both see the same decision. */
  const buildFormInput = (forceSave: boolean): LeadFormInput => ({
    id: editingLead?.id,
    full_name: fullName.trim(),
    phone: normalizedPrimaryPhone ?? '',
    alternate_phone: alternatePhoneValue,
    email: email.trim() || null,
    designation,
    firm_name: firmName.trim() || null,
    professional_id: professionalId,
    site_location: siteLocation.trim(),
    address: siteLocation.trim() || null,
    plus_code: plusCode.trim() || null,
    site_lat: siteLat,
    site_lng: siteLng,
    material_interests: materialInterests,
    construction_stage: constructionStage,
    estimated_qty_sqft: estimatedQtySqft ? Number(estimatedQtySqft) : null,
    lead_source: leadSource,
    referred_by: referredBy,
    notes: notes.trim() || null,
    priority,
    next_action_at: combineDateAndTime(dateStr, timeStr),
    reminder_enabled: reminderEnabled,
    additional_contacts: additionalContacts.map((contact) => ({
      ...contact,
      is_professional:
        contact.is_professional ?? isProfessionalDesignation(contact.designation),
    })),
    attachments: stagedAttachments,
    forceSave,
  });

  const validate = (formInput: LeadFormInput): Record<string, string> => {
    const nextErrors: Record<string, string> = {};
    if (!formInput.full_name) nextErrors.fullName = 'Full Name is required';
    if (!normalizePhone10(formInput.phone)) {
      nextErrors.phone = 'Enter a valid 10-digit mobile number';
    }
    if (!formInput.designation) nextErrors.designation = 'Select a designation';
    if (!Number.isFinite(formInput.priority) || !priorityOptions.some((option) => Number(option.value) === formInput.priority)) {
      nextErrors.priority = 'Select a priority configured in Control Panel';
    }
    if (!formInput.site_location) nextErrors.siteLocation = 'Site address is required';
    if (formInput.material_interests.length === 0) {
      nextErrors.materialInterests = 'Select at least one material interest';
    }
    return nextErrors;
  };

  /**
   * Group 1 — the site professionals of a lead.
   *
   * Desktop parity (PR #150):
   *  - the primary contact plus every professional additional contact reuse an
   *    existing **active** professional with the same normalised 10-digit
   *    phone, or auto-create a new `professionals` row,
   *  - the junction rows are de-duplicated by `professional_id` (the primary
   *    contact wins) — Postgres refuses an `ON CONFLICT DO UPDATE` that
   *    touches the same row twice (`21000`).
   *
   * The professional ids that are now linked are returned, so the Group 3
   * referral link knows which rows it must not demote.
   */
  const syncGroup1Professionals = async (savedLeadId: string): Promise<string[]> => {
    type Group1Candidate = {
      name: string;
      phone: string;
      email?: string | null;
      firmName?: string | null;
      designation?: string | null;
    };

    /** Reuses an existing active professional, or creates one (desktop parity). */
    const resolveProfessional = async (
      candidate: Group1Candidate,
    ): Promise<string | null> => {
      const phone10 = normalizePhone10(candidate.phone);
      if (!phone10) return null;

      const existing = professionals.find((professional) => {
        if ((professional.status ?? 'active').toLowerCase() !== 'active') return false;
        return (
          normalizePhone10(professional.phone) === phone10 ||
          normalizePhone10(professional.alternate_phone) === phone10
        );
      });
      if (existing) return existing.id;

      const { data, error } = await supabase
        .from('professionals')
        .insert({
          name: candidate.name.trim() || 'Professional',
          phone: phone10,
          alternate_phone: null,
          email: candidate.email ?? null,
          firm_name: candidate.firmName ?? null,
          address: siteLocation.trim() || null,
          professional_type: mapDesignationToProfessionalType(candidate.designation),
          status: 'active',
          priority: 3,
          assigned_to: attributionName,
          created_by: actorName,
          site_plus_code: plusCode.trim() || null,
          added_via_lead_id: savedLeadId,
        })
        .select('id')
        .maybeSingle();

      if (error) {
        console.warn('[mobile lead] Unable to create the professional.', error);
        return null;
      }
      return data?.id ?? null;
    };

    /** One entry per professional — the primary contact wins a duplicate id. */
    const group1Drafts: Array<{
      professional_id: string;
      is_primary_contact: boolean;
      contact_designation: string;
    }> = [];

    const register = (
      professionalId: string | null | undefined,
      isPrimary: boolean,
      designationValue: string,
    ) => {
      if (!professionalId) return;
      group1Drafts.push({
        professional_id: professionalId,
        is_primary_contact: isPrimary,
        contact_designation: designationValue,
      });
    };

    // A professional that was picked from the existing list always wins over
    // the phone-based resolution.
    const primaryProfessionalId =
      professionalId ??
      (await resolveProfessional({
        name: fullName.trim(),
        phone,
        email: email.trim() || null,
        firmName: firmName.trim() || null,
        designation,
      }));
    register(primaryProfessionalId, true, designation);

    for (const contact of additionalContacts) {
      const isProfessionalContact =
        contact.is_professional ?? isProfessionalDesignation(contact.designation);
      if (!isProfessionalContact) continue;
      // A contact that is already linked to a professional keeps that link.
      const contactProfessionalId =
        contact.professional_id ??
        (await resolveProfessional({
          name: contact.name,
          phone: contact.phone,
          email: contact.email ?? null,
          firmName: contact.firm_name ?? null,
          designation: contact.designation ?? null,
        }));
      register(contactProfessionalId, false, contact.designation ?? '');
    }

    // The duplicates are removed before the upsert — Postgres refuses an
    // `ON CONFLICT DO UPDATE` that touches the same row twice (`21000`).
    const links = buildLeadProfessionalLinkInserts(savedLeadId, group1Drafts);
    const group1Ids = links.map((link) => link.professional_id);

    if (links.length > 0) {
      // supabase-js does NOT throw on a database error — the `{ error }` has to
      // be inspected explicitly or a failed upsert looks like a success.
      const { error: group1Error } = await supabase
        .from('lead_professionals')
        .upsert(links, { onConflict: 'lead_id,professional_id' });
      if (group1Error) {
        console.warn('[mobile lead] Unable to link professionals.', group1Error);
        throw group1Error;
      }
    }

    return group1Ids;
  };

  /**
   * Group 3 — the referrer.
   *
   * It is written after every Group 1 upsert so a referrer that is also a
   * Group 1 contact keeps the Group 1 flags.
   */
  const syncReferralLink = async (
    savedLeadId: string,
    group1Ids: string[] = [],
  ): Promise<void> => {
    const referralLink = buildReferralLinkInsert(savedLeadId, referredBy);
    if (!referralLink) return;

    const isAlsoGroup1 = group1Ids.includes(referralLink.professional_id);
    const { error: referralError } = await supabase
      .from('lead_professionals')
      .upsert([referralLink], {
        onConflict: 'lead_id,professional_id',
        // On create the referrer is never demoted; on edit a removed Group 1
        // contact must be demoted to the referrer role instead.
        ...(mode === 'edit' && !isAlsoGroup1 ? {} : { ignoreDuplicates: true }),
      });
    if (referralError) {
      console.warn('[mobile lead] The referral link was not saved.', referralError);
      throw referralError;
    }
  };

  /**
   * On Edit, the junction rows that are no longer referenced are deleted.
   */
  const cleanupStaleProfessionalLinks = async (
    savedLeadId: string,
    group1Ids: string[],
  ): Promise<void> => {
    const referralLink = buildReferralLinkInsert(savedLeadId, referredBy);
    const preserved = preservedLeadProfessionalIds(
      group1Ids,
      referralLink?.professional_id ?? null,
    );
    const { data: existingLinks, error: existingLinksError } = await supabase
      .from('lead_professionals')
      .select('professional_id')
      .eq('lead_id', savedLeadId);
    if (existingLinksError) {
      console.warn('[mobile lead] Unable to read the professional links.', existingLinksError);
      return;
    }
    const staleIds = staleLeadProfessionalIds(
      (existingLinks ?? []).map((row) => row.professional_id as string),
      preserved,
    );
    if (staleIds.length > 0) {
      const { error: staleError } = await supabase
        .from('lead_professionals')
        .delete()
        .eq('lead_id', savedLeadId)
        .in('professional_id', staleIds);
      if (staleError) {
        console.warn('[mobile lead] Unable to remove the stale professional links.', staleError);
      }
    }
  };

  /**
   * The dependencies of the post-create effects.
   *
   * Every side effect arrives through this object, so the whole flow can be
   * driven by fakes in a unit test.
   */
  const buildLeadCreateDeps = (): LeadCreateEffectsDeps => ({
    syncProfessionals: async (leadId: string) => {
      await syncGroup1Professionals(leadId);
    },
    linkReferral: async (leadId: string) => {
      await syncReferralLink(leadId, []);
    },
    addTask: async (task) => {
      const created = await addTask({
        title: task.title,
        description: task.description ?? null,
        type: task.type,
        priority: task.priority,
        status: task.status,
        assigned_to: task.assigned_to,
        due_date: task.due_date,
        due_time: task.due_time,
        lead_id: task.lead_id,
        created_by: task.created_by,
        reminder: task.reminder,
        ...(task.related_entity_type && task.related_entity_id
          ? {
              related_entity_type: task.related_entity_type,
              related_entity_id: task.related_entity_id,
            }
          : {}),
      });
      return created ? { id: created.id } : null;
    },
    addReminder: async (reminder) => {
      await addReminder({
        title: reminder.title,
        description: reminder.description,
        reminder_datetime: reminder.reminder_datetime,
        entity_type: reminder.entity_type,
        entity_id: reminder.entity_id,
        assigned_to: reminder.assigned_to,
      });
    },
    notifyAssignee: async (notification) => {
      // supabase-js does not throw — the error has to be inspected explicitly.
      const { error } = await supabase.from('notifications').insert({
        user_id: notification.user_id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        entity_type: notification.entity_type,
        entity_id: notification.entity_id,
      });
      if (error) throw error;
    },
    toast: (message) => {
      toast({
        title: message.title,
        description: message.description,
        variant: message.variant,
      });
    },
  });

  /** The input of the post-create effects of a new lead. */
  const buildLeadCreateInput = (leadId: string): LeadCreateEffectsInput => {
    const assigneeEmail =
      staffMembers.find((member) => member.id === assignedStaffId)?.email ?? null;
    return {
      leadId,
      leadName: fullName.trim(),
      assignedTo: attributionName,
      assignedToEmail: assigneeEmail,
      actorName,
      dueDate: dateStr,
      dueTime: timeStr,
      reminderEnabled,
      taskDescription: notes.trim() || null,
      relatedEntityType: professionalId ? 'professional' : null,
      relatedEntityId: professionalId,
      notificationTitle: priority === 1 ? 'Hot Lead Assigned' : 'New Lead Assigned',
      notificationMessage: `${fullName.trim() || phone} — visit at ${
        siteLocation.trim() || 'site location not set'
      }.`,
    };
  };

  /**
   * Re-runs only the steps that failed after the lead was saved.
   *
   * The lead is never created a second time — the retry only repairs the
   * missing effects.
   */
  const handleRetryFailedSteps = async () => {
    if (!effectsFailure) return;
    setRetryingEffects(true);
    try {
      const result = await retryLeadCreateEffects(
        {
          ...buildLeadCreateInput(effectsFailure.leadId),
          taskId: effectsFailure.createdTaskId,
        },
        buildLeadCreateDeps(),
        effectsFailure.failedSteps,
      );
      if (result.failedSteps.length === 0) {
        setEffectsFailure(null);
        toast({
          title: 'Everything is saved now',
          description: 'The failed steps were completed.',
        });
        return;
      }
      setEffectsFailure({
        ...effectsFailure,
        completedSteps: [...effectsFailure.completedSteps, ...result.completedSteps],
        failedSteps: result.failedSteps,
        errors: result.errors,
      });
    } catch (error) {
      console.warn('[mobile lead] The retry failed.', error);
    } finally {
      setRetryingEffects(false);
    }
  };

  /**
   * Validates and saves the lead.
   *
   * @param forceSave when true the duplicate-lead gate is skipped entirely and
   * the lead is genuinely persisted (D9).
   */
  const runSave = async (forceSave: boolean) => {
    forceSaveRef.current = forceSave;
    const formInput = buildFormInput(forceSave);

    const nextErrors = validate(formInput);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      // The summary banner names every problem and the first invalid field is
      // scrolled to and focused.
      setSubmitAttempted(true);
      focusFirstInvalidField(nextErrors);
      forceSaveRef.current = false;
      return;
    }
    setErrors({});
    setSubmitAttempted(false);

    // D9 duplicate gate — the modal is opened by the Submit only, never
    // while the user is typing. It applies to Create **and** Edit.
    if (!formInput.forceSave && !isProfRole) {
      const duplicate = findDuplicateLead(normalizePhone10(formInput.phone), editingLead?.id);
      // `shouldBlockOnDuplicate` is the shared D9 decision: a duplicate blocks
      // the save unless the user explicitly chose "Save Anyway".
      if (shouldBlockOnDuplicate(duplicate, formInput.forceSave)) {
        setDuplicateWarning(duplicate);
        forceSaveRef.current = false;
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = toLeadInsert(formInput, attributionName, actorName);

      // On Edit only the **changed** fields are written: `created_by` is never
      // touched and an untouched `referred_by` JSONB is left alone.
      const updatePayload =
        mode === 'edit' && editingLead
          ? toLeadUpdate(
              {
                name: editingLead.name,
                phone: editingLead.phone,
                alternate_phone: editingLead.alternate_phone,
                email: editingLead.email,
                designation: editingLead.designation,
                firm_name: editingLead.firm_name,
                additional_contacts: editingLead.additional_contacts,
                site_location: editingLead.site_location,
                site_plus_code: editingLead.site_plus_code,
                address: editingLead.address,
                construction_stage: editingLead.construction_stage,
                estimated_quantity: editingLead.estimated_quantity,
                material_interests: editingLead.material_interests,
                source: editingLead.source,
                referred_by: originalReferredByRef.current,
                notes: editingLead.notes,
                assigned_to: editingLead.assigned_to,
                priority: editingLead.priority,
              },
              formInput,
              attributionName,
              actorName,
            )
          : null;

      // Offline first: the write is parked on the device and replayed by the
      // outbox as soon as the connection is back. The user is told what
      // happened instead of being shown a failure.
      if (!isOnline) {
        enqueue({
          kind: mode === 'create' ? 'create_lead' : 'update_lead',
          label: mode === 'create' ? `New lead · ${formInput.full_name}` : `Lead update · ${formInput.full_name}`,
          payload:
            mode === 'create'
              ? { lead: { ...payload, status: 'new' } }
              : { leadId: editingLead?.id, updates: updatePayload ?? payload },
        });
        toast({
          title: 'Saved offline',
          description: 'This lead is stored on the device and will sync automatically.',
        });
        setDuplicateWarning(null);
        forceSaveRef.current = false;
        onCancel();
        return;
      }

      let savedLead: LiveLead | null = null;

      try {
        if (mode === 'create') {
          savedLead = await addLead({
            ...payload,
            status: 'new',
          } as unknown as LeadInsert);
        } else if (editingLead && updatePayload) {
          savedLead = await updateLead(
            editingLead.id,
            updatePayload as unknown as Partial<LeadInsert>,
          );
        }
      } catch (saveError) {
        // The lead write itself failed — this is the only failure that may
        // report "Lead not saved".
        toast({
          title: 'Lead not saved',
          description:
            saveError instanceof Error ? saveError.message : 'Please try again in a moment.',
          variant: 'destructive',
        });
        return;
      }

      if (!savedLead) throw new Error('The lead could not be saved.');

      if (mode === 'create') {
        // Desktop parity: the lead is saved first, then the professionals, the
        // referral, the follow-up task, the reminder and the notification.
        // A failing step never loses the lead — it is reported and can be
        // retried on its own.
        const effects = await runLeadCreateEffects(
          buildLeadCreateInput(savedLead.id),
          buildLeadCreateDeps(),
        );
        if (effects.failedSteps.length > 0) {
          setEffectsFailure(effects);
        }
      } else {
        // Edit — the junction rows are refreshed and the stale ones removed.
        try {
          const group1Ids = await syncGroup1Professionals(savedLead.id);
          await syncReferralLink(savedLead.id, group1Ids);
          await cleanupStaleProfessionalLinks(savedLead.id, group1Ids);
        } catch (linkError) {
          console.warn('[mobile lead] Unable to refresh the professional links.', linkError);
          toast({
            title: 'Lead saved, but the professional links were not saved',
            description:
              'The lead was updated, but its professional associations failed. Edit the lead later to retry.',
            variant: 'destructive',
          });
        }
      }

      // The lead is saved. A failed activity log must never claim otherwise.
      try {
        await logActivity({
          lead_id: savedLead.id,
          activity_type: mode === 'create' ? 'lead_created' : 'lead_updated',
          activity_category: mode === 'create' ? 'system' : 'follow_up',
          title: mode === 'create' ? 'Lead Created' : 'Lead Updated',
          description:
            mode === 'create'
              ? `${savedLead.name} was added as a lead.`
              : `${savedLead.name} lead details were updated.`,
          metadata: {
            designation,
            source: leadSource,
            priority,
            force_save: forceSave,
          },
        });
      } catch (logError) {
        console.warn('[mobile lead] The activity log entry failed.', logError);
        toast({
          title: 'Lead saved',
          description: 'The lead was saved, but the activity entry could not be logged.',
          variant: 'destructive',
        });
      }

      // The staged site photos are uploaded through the real attachment
      // storage. A temporary `blob:` preview URL is NEVER written to
      // `leads.site_photo_url`.
      const stagedFiles = stagedAttachments
        .map((attachment) => attachment.localFile)
        .filter((file): file is File => Boolean(file));
      if (stagedFiles.length > 0) {
        const upload = await uploadLeadAttachmentFiles(savedLead.id, stagedFiles);
        if (upload.failed > 0) {
          toast({
            title: 'Lead saved, but some photos did not upload',
            description: `${upload.failed} photo(s) could not be uploaded. Add them again from the lead profile.`,
            variant: 'destructive',
          });
        }
      }

      // The duplicate modal must always be closed once the write succeeded.
      setDuplicateWarning(null);
      forceSaveRef.current = false;

      const mobileLead = toMobileLead(savedLead);

      if (mode === 'create') {
        setSavedPostLead(mobileLead);
      } else {
        onNavigate({ name: 'entity_profile', entityType: 'lead', entityId: savedLead.id });
      }
    } catch (error) {
      toast({
        title: 'Lead not saved',
        description:
          error instanceof Error ? error.message : 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
      forceSaveRef.current = false;
    }
  };

  const handleCancel = () => {
    resetFormState();
    onCancel();
  };

  /* --------------------------------- render ------------------------------ */

  /**
   * An edit deep link to a lead that no longer resolves must not render an
   * empty form — the user gets a clean "Lead Not Found" screen, exactly like
   * the Customer and Professional edit forms.
   */
  if (mode === 'edit' && leadId && !leadsLoading && !editingLead) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col">
        <SubHeader title="Edit Lead" subtitle="Lead not found" onBack={handleCancel} />
        <div className="flex-1 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-6 text-center space-y-3 shadow-[0_1px_3px_rgba(26,26,46,0.05)]">
            <AlertCircle className="w-8 h-8 text-[#DC2626] mx-auto" />
            <h2 className="text-base font-bold text-[#1A1A2E]">Lead Not Found</h2>
            <p className="text-sm text-[#47464C]">
              This lead no longer exists — it may have been deleted, or the link may be out of date.
            </p>
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[48px] px-4 rounded-[12px] bg-[#1A1A2E] text-white font-semibold text-sm"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col">
      <SubHeader
        title={mode === 'create' ? 'New Lead' : 'Edit Lead'}
        subtitle={editingLead ? editingLead.name : 'Capture a new enquiry'}
        onBack={handleCancel}
        rightAction={
          mode === 'create' ? (
            <button
              type="button"
              onClick={resetFormState}
              className="min-h-[44px] px-3 rounded-[10px] text-xs font-semibold text-[#C9A84C] hover:bg-white/10 whitespace-nowrap"
            >
              Reset
            </button>
          ) : null
        }
      />

      <div className="flex-1 p-4 pb-32 space-y-4">
        {/* A read-only role gets a clean, honest screen instead of a form
            that fails at the API. */}
        {!canWriteThisLead && (
          <div
            role="alert"
            className="rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] p-3 text-xs font-semibold"
          >
            {mode === 'create'
              ? 'Your role does not allow creating leads. You can still review the form.'
              : 'Your role does not allow editing leads. You can still review the details.'}
          </div>
        )}

        {/* The validation summary names every problem at the top of the form.
            The first invalid field was already scrolled to and focused. */}
        {submitAttempted && Object.keys(errors).length > 0 && (
          <div
            role="alert"
            className="rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] p-3 space-y-1.5"
          >
            <p className="text-xs font-bold">Please fix the following before saving</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {VALIDATION_FIELD_ORDER.filter((field) => errors[field.errorKey]).map((field) => (
                <li key={field.errorKey} className="text-xs font-semibold">
                  {errors[field.errorKey]}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* -------------------------- 1. Contact details ------------------- */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-[0_1px_3px_rgba(26,26,46,0.05)] space-y-3.5">
          <h2 className="text-sm font-bold text-[#1A1A2E] uppercase tracking-wide font-utility">
            1. Contact Details
          </h2>

          <div>
            <label htmlFor="lead-designation" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Designation *
            </label>
            <select
              id="lead-designation"
              value={designation}
              onChange={(e) => handleDesignationChange(e.target.value)}
              aria-invalid={Boolean(errors.designation)}
              className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            >
              {designationOptions.length === 0 && <option value="">Loading…</option>}
              {designationOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.designation && (
              <p className="text-xs font-semibold text-[#DC2626] mt-1">{errors.designation}</p>
            )}
          </div>

          {isProfRole && (
            <div className="p-3 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0] space-y-3">
              <ProfessionalCombobox
                inputId="search-existing-pro"
                label="Search Existing Professional"
                placeholder="Type architect, contractor, or firm…"
                query={professionalSearchQuery}
                onQueryChange={setProfessionalSearchQuery}
                open={professionalDropdownOpen}
                onOpenChange={setProfessionalDropdownOpen}
                candidates={professionalCandidates}
                onSelect={handleSelectExistingProfessional}
                emptyMessage="No matching professional. Enter new details below."
              />

              {linkedProfessional && (
                <ProfessionalPill
                  professional={linkedProfessional}
                  onClear={handleClearProfessional}
                  onChange={handleChangeProfessional}
                  onViewProfile={() => handleViewProfessionalProfile(linkedProfessional.id)}
                />
              )}

              <div>
                <label htmlFor="lead-firm" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
                  Firm Name
                </label>
                <input
                  id="lead-firm"
                  type="text"
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                  placeholder="e.g., Mehta & Associates"
                  className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="lead-fullname" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Full Name *
            </label>
            <input
              id="lead-fullname"
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              placeholder="Client or specifier full name"
              aria-invalid={Boolean(errors.fullName)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            />
            {errors.fullName && (
              <p className="text-xs font-semibold text-[#DC2626] mt-1">{errors.fullName}</p>
            )}
          </div>

          <div>
            <label htmlFor="lead-phone" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Primary Phone (10 digits) *
            </label>
            <input
              id="lead-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => handlePrimaryPhoneChange(e.target.value)}
              placeholder="98290 00000"
              aria-invalid={Boolean(errors.phone)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base font-utility text-[#191C1D]"
            />
            {errors.phone && (
              <p className="text-xs font-semibold text-[#DC2626] mt-1">{errors.phone}</p>
            )}
            {/* A calm inline hint while the user types. The blocking
                DuplicateLeadModal is opened by the SUBMIT only. */}
            {duplicateHint && !duplicateWarning && (
              <p className="mt-1.5 px-2.5 py-1.5 rounded-[10px] bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] text-xs font-semibold">
                This number already belongs to {duplicateHint.name || 'another lead'} — you will be
                asked to confirm when you save.
              </p>
            )}
            {/* The emerald badge belongs to the PRIMARY phone only, and only
                when a professional is ACTUALLY linked — a professional
                designation alone is not a link. */}
            {linkedProfessional && normalizedPrimaryPhone && (
              <div className="mt-1.5 px-2.5 py-1.5 rounded-[10px] bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Associated Site Professional · Duplicate check bypassed</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowOptionalContact((v) => !v)}
            className="w-full min-h-[44px] px-3 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] flex items-center justify-between text-xs font-semibold text-[#1A1A2E]"
          >
            <span>Optional: Alternate Phone, Email &amp; Additional Contacts</span>
            {showOptionalContact ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {showOptionalContact && (
            <div className="space-y-3 pt-1">
              <div>
                <label htmlFor="lead-alt-phone" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
                  Alternate Phone
                </label>
                <input
                  id="lead-alt-phone"
                  type="tel"
                  inputMode="numeric"
                  value={alternatePhone}
                  onChange={(e) => handleAlternatePhoneChange(e.target.value)}
                  placeholder="Optional 10-digit number"
                  className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base font-utility text-[#191C1D]"
                />
              </div>

              <div>
                <label htmlFor="lead-email" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
                  Email Address
                </label>
                <input
                  id="lead-email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.in"
                  className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                />
              </div>

              {/* Additional contacts — desktop parity (a). */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#1A1A2E]">Additional Contacts</span>
                  <button
                    type="button"
                    onClick={addAdditionalContact}
                    className="min-h-[44px] px-2.5 rounded-[10px] text-xs font-semibold text-[#1A1A2E] flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Contact</span>
                  </button>
                </div>

                {additionalContacts.map((contact, index) => {
                  const contactIsProfessional = isProfessionalDesignation(contact.designation);
                  const contactProfessional = professionalCandidates.find(
                    (p) => p.id === contact.professional_id,
                  );
                  return (
                    <div
                      key={contact.id}
                      className="p-2.5 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={contact.name}
                          onChange={(e) => updateAdditionalContact(index, { name: e.target.value })}
                          placeholder="Contact name"
                          aria-label={`Additional contact ${index + 1} name`}
                          className="flex-1 min-h-[44px] px-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                        />
                        <button
                          type="button"
                          onClick={() => removeAdditionalContact(index)}
                          aria-label="Remove additional contact"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#DC2626]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <select
                        value={contact.designation ?? ''}
                        onChange={(e) =>
                          updateAdditionalContact(index, {
                            designation: e.target.value,
                            is_professional: isProfessionalDesignation(e.target.value),
                            professional_id: isProfessionalDesignation(e.target.value)
                              ? contact.professional_id ?? null
                              : null,
                          })
                        }
                        aria-label={`Additional contact ${index + 1} designation`}
                        className="w-full min-h-[48px] px-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                      >
                        {designationOptions.length === 0 && <option value="">Loading…</option>}
                        {designationOptions.map((opt) => (
                          <option key={opt.id} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="tel"
                        inputMode="numeric"
                        value={contact.phone}
                        onChange={(e) =>
                          handleAdditionalContactPhoneChange(index, e.target.value)
                        }
                        placeholder="10-digit phone"
                        aria-label={`Additional contact ${index + 1} phone`}
                        className="w-full min-h-[44px] px-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base font-utility text-[#191C1D]"
                      />

                      <input
                        type="text"
                        value={contact.firm_name ?? ''}
                        onChange={(e) => updateAdditionalContact(index, { firm_name: e.target.value })}
                        placeholder="Firm name"
                        aria-label={`Additional contact ${index + 1} firm`}
                        className="w-full min-h-[44px] px-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                      />

                      {contactIsProfessional && (
                        <div className="space-y-2">
                          <ProfessionalCombobox
                            inputId={`ac-prof-${contact.id}`}
                            label="Search Existing Professional"
                            placeholder="Type a name or firm…"
                            query={acQueries[contact.id] ?? ''}
                            onQueryChange={(value) =>
                              setAcQueries((prev) => ({ ...prev, [contact.id]: value }))
                            }
                            open={Boolean(acOpen[contact.id])}
                            onOpenChange={(open) =>
                              setAcOpen((prev) => ({ ...prev, [contact.id]: open }))
                            }
                            candidates={professionalCandidates}
                            onSelect={(professional) => {
                              updateAdditionalContact(index, {
                                professional_id: professional.id,
                                is_professional: true,
                                designation: isProfessionalDesignation(professional.professional_type)
                                  ? professional.professional_type
                                  : contact.designation,
                                name: contact.name || professional.full_name,
                                phone: contact.phone || extractEditablePhone10(professional.phone),
                                firm_name: contact.firm_name || professional.firm_name || '',
                                email: contact.email || professional.email || undefined,
                              });
                              setAcQueries((prev) => ({ ...prev, [contact.id]: '' }));
                              setAcOpen((prev) => ({ ...prev, [contact.id]: false }));
                            }}
                            emptyMessage="No matching professional."
                          />
                          {contactProfessional && (
                            <ProfessionalPill
                              professional={contactProfessional}
                              onClear={() =>
                                updateAdditionalContact(index, { professional_id: null })
                              }
                              onChange={() => {
                                updateAdditionalContact(index, { professional_id: null });
                                setAcQueries((prev) => ({ ...prev, [contact.id]: '' }));
                                setAcOpen((prev) => ({ ...prev, [contact.id]: true }));
                              }}
                              onViewProfile={() =>
                                handleViewProfessionalProfile(contactProfessional.id)
                              }
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* --------------------------- 2. Site details --------------------- */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-[0_1px_3px_rgba(26,26,46,0.05)] space-y-3.5">
          <h2 className="text-sm font-bold text-[#1A1A2E] uppercase tracking-wide font-utility">
            2. Site Details
          </h2>

          <div>
            <label htmlFor="lead-site" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Site Address *
            </label>
            <input
              id="lead-site"
              type="text"
              value={siteLocation}
              onChange={(e) => {
                setSiteLocation(e.target.value);
                setErrors((prev) => ({ ...prev, siteLocation: '' }));
              }}
              placeholder="Plot / Villa / Sector, City"
              aria-invalid={Boolean(errors.siteLocation)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            />
            {errors.siteLocation && (
              <p className="text-xs font-semibold text-[#DC2626] mt-1">{errors.siteLocation}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="min-h-[44px] px-3.5 rounded-[12px] bg-[#EEF2F6] text-[#1A1A2E] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
              <span>{isLocating ? 'Acquiring GPS…' : 'Use Current Location'}</span>
            </button>

            <div>
              <label htmlFor="lead-pluscode" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
                Google Plus Code
              </label>
              <input
                id="lead-pluscode"
                type="text"
                value={plusCode}
                onChange={(e) => setPlusCode(e.target.value)}
                placeholder="e.g., 7JRQWR7M+4C"
                className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base font-utility text-[#191C1D]"
              />
            </div>

            {(siteLocation || plusCode) && (
              <a
                href={buildMapsUrl(siteLocation, plusCode)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-3.5 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0] text-[#1A1A2E] text-sm font-semibold flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                <span>Open Site in Maps</span>
              </a>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1A1A2E] mb-1.5">
              Site Photo
            </label>
            <label className="min-h-[48px] px-4 rounded-[12px] border border-dashed border-[#1A1A2E] bg-[#F8F9FA] flex items-center justify-center gap-2 text-sm font-semibold text-[#1A1A2E] cursor-pointer">
              {photoBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              <span>{photoBusy ? 'Processing…' : 'Add Site Photo'}</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleSitePhotoPicked}
                className="hidden"
              />
            </label>

            {stagedAttachments.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {stagedAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="p-2.5 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {att.url && att.type === 'image' ? (
                        <img
                          src={att.url}
                          alt={att.name}
                          className="w-10 h-10 rounded-[8px] object-cover border border-[#E2E8F0] shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-[8px] bg-[#EEF2F6] flex items-center justify-center text-[#1A1A2E] shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#1A1A2E] truncate">{att.name}</div>
                        <div className="font-utility text-[11px] text-[#47464C]">
                          {att.sizeLabel}
                          {att.exifGps ? ` · EXIF ${att.exifGps.plusCode}` : ''}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStagedAttachment(att.id)}
                      aria-label={`Remove ${att.name}`}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#DC2626]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---------------------- 3. Requirements & stage ------------------- */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-[0_1px_3px_rgba(26,26,46,0.05)] space-y-3.5">
          <h2 className="text-sm font-bold text-[#1A1A2E] uppercase tracking-wide font-utility">
            3. Requirements &amp; Stage
          </h2>

          <div id="lead-materials" tabIndex={-1} aria-invalid={Boolean(errors.materialInterests)}>
            <div className="text-xs font-semibold text-[#1A1A2E] mb-2">Material Interests *</div>
            {materialOptions.length === 0 ? (
              <p className="text-xs text-[#47464C]">Loading material options…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {materialOptions.map((opt) => {
                  const selected = materialInterests.includes(opt.value);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleMaterial(opt.value)}
                      className={`min-h-[44px] px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                        selected
                          ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                          : 'bg-white text-[#1A1A2E] border-[#E2E8F0]'
                      }`}
                    >
                      {selected && <Check className="w-3.5 h-3.5 text-[#C9A84C]" />}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {errors.materialInterests && (
              <p className="text-xs font-semibold text-[#DC2626] mt-1">
                {errors.materialInterests}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="lead-stage" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Construction Stage *
            </label>
            <select
              id="lead-stage"
              value={constructionStage}
              onChange={(e) => setConstructionStage(e.target.value)}
              className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            >
              {stageOptions.length === 0 && <option value="">Loading…</option>}
              {stageOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowOptionalQty((v) => !v)}
            className="w-full min-h-[44px] px-3 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] flex items-center justify-between text-xs font-semibold text-[#1A1A2E]"
          >
            <span>Optional: Estimated Quantity (sq.ft)</span>
            {showOptionalQty ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {showOptionalQty && (
            <div>
              <label htmlFor="lead-qty" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
                Estimated Area (sq.ft)
              </label>
              <input
                id="lead-qty"
                type="number"
                inputMode="numeric"
                value={estimatedQtySqft}
                onChange={(e) => setEstimatedQtySqft(e.target.value)}
                placeholder="e.g., 3500"
                className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base font-utility text-[#191C1D]"
              />
            </div>
          )}
        </section>

        {/* --------------------- 4. Source, priority & next action ---------- */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-[0_1px_3px_rgba(26,26,46,0.05)] space-y-3.5">
          <h2 className="text-sm font-bold text-[#1A1A2E] uppercase tracking-wide font-utility">
            4. Source &amp; Next Action
          </h2>

          <div>
            <label htmlFor="lead-source" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Lead Source *
            </label>
            <select
              id="lead-source"
              value={leadSource}
              onChange={(e) => setLeadSource(e.target.value)}
              className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            >
              {sourceOptions.length === 0 && <option value="">Loading…</option>}
              {sourceOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lead-assigned" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Assigned To
            </label>
            <select
              id="lead-assigned"
              value={assignedStaffId}
              onChange={(e) => {
                assignedStaffTouchedRef.current = true;
                setAssignedStaffId(e.target.value);
              }}
              className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            >
              <option value="">{attributionName}</option>
              {staffOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lead-priority" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Priority
            </label>
            <select
              id="lead-priority"
              value={Number.isFinite(priority) ? String(priority) : ''}
              onChange={(e) => setPriority(e.target.value ? Number(e.target.value) : Number.NaN)}
              className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            >
              <option value="">{priorityOptions.length === 0 ? 'No priority options configured' : 'Select priority'}</option>
              {priorityOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.priority ? <InlineError id="lead-priority-error" message={errors.priority} /> : null}
          </div>

          <div>
            <div className="text-xs font-semibold text-[#1A1A2E] mb-1.5">
              Next Action Date &amp; Time *
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="Next action date"
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
              />
              <input
                aria-label="Next action time"
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
              />
            </div>
          </div>

          <label className="flex items-center justify-between min-h-[44px] px-3 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0] cursor-pointer">
            <span className="text-sm font-semibold text-[#1A1A2E] flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#D97706]" />
              <span>Set Reminder Alarm</span>
            </span>
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              className="w-5 h-5 accent-[#1A1A2E]"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowOptionalSourceNote((v) => !v)}
            className="w-full min-h-[44px] px-3 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] flex items-center justify-between text-xs font-semibold text-[#1A1A2E]"
          >
            <span>Optional: Referred By &amp; Notes</span>
            {showOptionalSourceNote ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {showOptionalSourceNote && (
            <div className="space-y-3 pt-1">
              <div>
                <label htmlFor="lead-ref" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
                  Referred By
                </label>
                <input
                  id="lead-ref"
                  type="text"
                  value={
                    typeof referredBy === 'string'
                      ? referredBy
                      : (referredBy?.name ?? '')
                  }
                  onChange={(e) => {
                    const next = e.target.value;
                    // Typing over the name of a linked professional must not
                    // throw the structured reference away — the desktop stores
                    // `leads.referred_by` as an object.
                    setReferredBy((current) =>
                      current && typeof current !== 'string' && current.name === next
                        ? current
                        : next,
                    );
                  }}
                  placeholder="Name of referring architect or client"
                  className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                />
                <div className="mt-2">
                  <ProfessionalCombobox
                    inputId="search-referrer-pro"
                    label="Link an existing professional as referrer"
                    placeholder="Search professionals…"
                    query={referrerSearchQuery}
                    onQueryChange={setReferrerSearchQuery}
                    open={referrerDropdownOpen}
                    onOpenChange={setReferrerDropdownOpen}
                    candidates={professionalCandidates}
                    onSelect={(professional) => {
                      setReferredBy({
                        id: professional.id,
                        name: professional.full_name,
                        firmName: professional.firm_name,
                        type: professional.professional_type,
                        phone: professional.phone,
                        email: professional.email,
                      });
                      setReferrerSearchQuery('');
                      setReferrerDropdownOpen(false);
                    }}
                    emptyMessage="No matching professional."
                  />
                </div>
              </div>
              <div>
                <label htmlFor="lead-note" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
                  Notes
                </label>
                <textarea
                  id="lead-note"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Site observations, preferred stone lot…"
                  className="w-full p-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E2E8F0] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleCancel}
          className="min-h-[48px] rounded-[12px] border-[1.5px] border-[#E2E8F0] bg-white text-[#1A1A2E] font-semibold text-base"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void runSave(forceSaveRef.current)}
          disabled={isSaving || !canWriteThisLead}
          className="min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base shadow-[0_10px_20px_-3px_rgba(201,168,76,0.35)] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>
            {isSaving
              ? 'Saving…'
              : canWriteThisLead
                ? 'Save Lead'
                : mode === 'create'
                  ? 'No permission to create leads'
                  : 'No permission to edit leads'}
          </span>
        </button>
      </div>

      {/* D9 duplicate gate */}
      {duplicateWarning && (
        <DuplicateLeadModal
          duplicate={duplicateWarning}
          onCancel={() => {
            forceSaveRef.current = false;
            setDuplicateWarning(null);
          }}
          onViewExisting={() => {
            const id = duplicateWarning.id;
            forceSaveRef.current = false;
            setDuplicateWarning(null);
            resetFormState();
            onNavigate({ name: 'entity_profile', entityType: 'lead', entityId: id });
          }}
          onSaveAnyway={() => {
            // Close the modal and force the write — the duplicate check is
            // skipped and the lead is genuinely persisted.
            setDuplicateWarning(null);
            void runSave(true);
          }}
        />
      )}

      {savedPostLead && (
        <PostSaveQuickActions
          lead={savedPostLead}
          onNavigate={onNavigate}
          onClose={() => {
            setSavedPostLead(null);
            onNavigate({ name: 'today' });
          }}
          onOpenQuickAddMode={onOpenQuickAddMode}
          onBeginCall={onBeginCall}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* PostSaveQuickActions                                                       */
/* -------------------------------------------------------------------------- */

export const PostSaveQuickActions: React.FC<{
  lead: Lead;
  onNavigate: (route: MobileRoute) => void;
  onClose: () => void;
  onOpenQuickAddMode: (mode: 'task' | 'note' | 'reminder', leadId: string) => void;
  /**
   * Records the intent to call.
   *
   * It is passed down from the mobile shell: a second
   * `useCallIntentWatcher()` inside this sheet meant the intent was recorded
   * twice and the outcome sheet could open twice.
   */
  onBeginCall?: (target: CallIntentTarget) => void;
}> = ({ lead, onNavigate, onClose, onOpenQuickAddMode, onBeginCall }) => {
  const beginCall = (target: CallIntentTarget) => {
    if (onBeginCall) {
      onBeginCall(target);
      return;
    }
    recordCallIntent(target);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lead Saved Quick Actions"
        className="w-full bg-white rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-[#1A1A2E]">Lead Saved</h2>
              <p className="text-xs text-[#47464C] truncate">
                {lead.full_name} · {leadReference(lead)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() =>
              beginCall({
                entityType: 'lead',
                entityId: lead.id,
                entityName: lead.full_name,
                phone: lead.phone,
              })
            }
            className="min-h-[48px] px-3 rounded-[12px] bg-[#EEF2F6] text-[#1A1A2E] font-semibold text-sm flex items-center justify-center gap-2"
          >
            <Phone className="w-4 h-4" />
            <span>Call</span>
          </button>

          <a
            href={buildWhatsAppUrl(lead.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-3 rounded-[12px] bg-[#ECFDF5] text-[#059669] font-semibold text-sm flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            <span>WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={() => onOpenQuickAddMode('task', lead.id)}
            className="min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-[#1A1A2E] font-semibold text-sm flex items-center justify-center gap-2"
          >
            <CheckSquare className="w-4 h-4" />
            <span>Add Task</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQuickAddMode('note', lead.id)}
            className="min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-[#1A1A2E] font-semibold text-sm flex items-center justify-center gap-2"
          >
            <StickyNote className="w-4 h-4" />
            <span>Add Note</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQuickAddMode('reminder', lead.id)}
            className="min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-[#1A1A2E] font-semibold text-sm flex items-center justify-center gap-2"
          >
            <Bell className="w-4 h-4 text-[#D97706]" />
            <span>Add Reminder</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate({ name: 'entity_profile', entityType: 'lead', entityId: lead.id })}
          className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base"
        >
          Open Lead Profile
        </button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* MarkLostSheet                                                              */
/* -------------------------------------------------------------------------- */

export const MarkLostSheet: React.FC<{
  open: boolean;
  lead: Lead | null;
  excludeTaskId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, lead, excludeTaskId, onClose, onSaved }) => {
  const { getFieldOptions, getOptionLabel, loading: panelLoading } = useMobileControlPanel();
  const { updateLead } = useLeads();
  const { tasks, updateTask } = useTasks();
  const { logActivity } = useLogActivity();
  const { isOnline } = useWeakSignalOutbox();
  const { toast } = useToast();

  const lostReasons = getFieldOptions('leads', 'lost_reason');

  const [lostReason, setLostReason] = useState('');
  const [lostNotes, setLostNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLostReason('');
    setLostNotes('');
    setSubmitting(false);
    setErrorMsg(null);
  }, [open, lead?.id]);

  /** Open follow-up tasks that belong to this lead. */
  const openLeadTasks = useMemo(() => {
    if (!lead) return [];
    return tasks.filter(
      (task) =>
        !task.is_deleted &&
        task.id !== excludeTaskId &&
        task.status !== 'Completed' &&
        task.status !== 'Cancelled' &&
        (task.lead_id === lead.id ||
          (task.related_entity_type === 'lead' && task.related_entity_id === lead.id)),
    );
  }, [tasks, lead, excludeTaskId]);

  if (!open || !lead) return null;

  const reasonLabel = lostReason ? getOptionLabel('leads', 'lost_reason', lostReason) : '';

  const handleConfirm = async () => {
    if (!isOnline) {
      setErrorMsg('Internet required — Retry');
      return;
    }
    if (!lostReason) {
      setErrorMsg('Select a loss reason before continuing.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      // Desktop parity — a lost request moves the lead to "pending_lost" and
      // keeps the previous status so a manager can restore it.
      await updateLead(lead.id, {
        status: 'pending_lost',
        lost_reason: lostReason,
        lost_reason_notes: lostNotes.trim() || null,
        previous_status: lead.status,
        pending_lost_since: new Date().toISOString(),
      } as unknown as Partial<LeadInsert>);

      // The activity log stores the human readable reason label, not the key.
      await logActivity({
        lead_id: lead.id,
        activity_type: 'status_change',
        activity_category: 'status_change',
        title: 'Lost Request Submitted',
        description: `Lead marked as Pending Lost. Reason: ${reasonLabel || lostReason}${
          lostNotes.trim() ? ` — ${lostNotes.trim()}` : ''
        }`,
        metadata: {
          old_status: lead.status,
          new_status: 'pending_lost',
          lost_reason: lostReason,
          lost_reason_label: reasonLabel || lostReason,
        },
      });

      // Desktop parity — the open site tasks are ALWAYS cancelled with the
      // lost request. There is no opt-out on mobile: the desktop never
      // offered one either.
      if (openLeadTasks.length > 0) {
        for (const task of openLeadTasks) {
          try {
            await updateTask(task.id, {
              status: 'Cancelled',
              completion_notes: 'Cancelled — Lead marked Pending Lost',
            });
          } catch (error) {
            console.warn('[mobile mark lost] Unable to cancel a task.', error);
          }
        }
      }

      toast({
        title: 'Lost request submitted',
        description: 'Awaiting manager approval.',
      });
      onSaved();
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'The lead could not be marked as lost.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mark Lead Lost"
        className="w-full bg-white rounded-t-[20px] max-h-[90dvh] flex flex-col"
      >
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#1A1A2E]">Mark Lead as Lost</h2>
            <p className="text-xs text-[#47464C] truncate">
              {lead.full_name} · {leadReference(lead)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Mark Lost"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {(!isOnline || errorMsg) && (
            <div className="p-3 rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg || 'Internet required — Retry'}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-bold text-[#1A1A2E]">Select Loss Reason *</div>
            {lostReasons.length === 0 ? (
              <div className="p-3 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0] text-xs text-[#47464C]">
                {panelLoading
                  ? 'Loading loss reasons…'
                  : 'No loss reasons are configured yet. Add them in Settings → Control Panel → Leads.'}
              </div>
            ) : (
              <div className="space-y-2">
                {lostReasons.map((opt) => {
                  const selected = lostReason === opt.value;
                  return (
                    <label
                      key={opt.id}
                      className={`min-h-[48px] px-3.5 py-2.5 rounded-[12px] border flex items-center gap-3 cursor-pointer ${
                        selected
                          ? 'bg-[#FEF2F2] border-[#DC2626] text-[#1A1A2E]'
                          : 'bg-white border-[#E2E8F0] text-[#1A1A2E]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="lost_reason"
                        value={opt.value}
                        checked={selected}
                        onChange={() => setLostReason(opt.value)}
                        className="w-5 h-5 accent-[#DC2626]"
                      />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="lost-notes" className="block text-xs font-bold text-[#1A1A2E] mb-1">
              Optional Reason Notes
            </label>
            <textarea
              id="lost-notes"
              rows={2}
              value={lostNotes}
              onChange={(e) => setLostNotes(e.target.value)}
              placeholder="Competitor quoted rate, timeline notes…"
              className="w-full p-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            />
          </div>

          <div className="p-3.5 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] space-y-2">
            <div className="text-xs font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Task &amp; Approval Impact ({openLeadTasks.length} open site task
                {openLeadTasks.length === 1 ? '' : 's'})
              </span>
            </div>
            <p className="text-xs text-[#191C1D] leading-relaxed">
              {lead.professional_id
                ? 'Open site tasks will be suspended and linked architect follow-ups transferred for manager review. Requires live connection.'
                : 'All open site follow-up tasks for this lead will be suspended and logged for manager review.'}
            </p>
            {openLeadTasks.length > 0 ? (
              <p className="text-xs font-bold text-[#191C1D]">
                The {openLeadTasks.length} open task{openLeadTasks.length === 1 ? '' : 's'} for
                this lead will be cancelled automatically.
              </p>
            ) : null}
          </div>
        </div>

        <div className="p-4 border-t border-[#E2E8F0] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || !isOnline || lostReasons.length === 0}
            className="w-full min-h-[48px] rounded-[12px] bg-[#DC2626] text-white font-semibold text-base disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {!isOnline
                ? 'Internet required — Retry'
                : submitting
                  ? 'Submitting…'
                  : 'Confirm Mark Lost'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* ConvertToCustomerSheet                                                      */
/* -------------------------------------------------------------------------- */

export const ConvertToCustomerSheet: React.FC<{
  open: boolean;
  lead: Lead | null;
  excludeTaskId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, lead, excludeTaskId, onClose, onSaved }) => {
  const { customers, addCustomer } = useCustomers();
  const { updateLead } = useLeads();
  const { tasks, updateTask } = useTasks();
  const { logActivity } = useLogActivity();
  const { options: staffOptions } = useActiveStaffOptions();
  const { profile } = useAuth();
  const { isOnline } = useWeakSignalOutbox();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [assignedStaffId, setAssignedStaffId] = useState('');
  const [importFiles, setImportFiles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** True once the user picked an assignee by hand. */
  const assignedStaffTouchedRef = useRef(false);
  /**
   * The lead is read through a ref so the form can be seeded ONCE per lead.
   *
   * The effect below is keyed on the lead id: a refreshed lead object (the
   * realtime channel pushes a new object on every edit) must not wipe what the
   * user already typed into the sheet.
   */
  const leadRef = useRef(lead);
  leadRef.current = lead;

  useEffect(() => {
    const current = leadRef.current;
    if (!open || !current) return;
    setFullName(current.full_name ?? '');
    setPhone(extractEditablePhone10(current.phone ?? ''));
    setAddress(current.address || current.site_location || '');
    setImportFiles(true);
    setSubmitting(false);
    setErrorMsg(null);
    assignedStaffTouchedRef.current = false;
    // Keyed on the lead id only — a refreshed lead object must not wipe what
    // the user already typed into the sheet.
  }, [open, lead?.id]);

  // The staff list arrives asynchronously — keep the lead's assignee selected
  // without ever overwriting a choice the user already made.
  useEffect(() => {
    if (!open || !lead) return;
    if (assignedStaffTouchedRef.current) return;
    const match = staffOptions.find((o) => o.name === lead.assigned_to);
    const nextId = match?.id ?? '';
    setAssignedStaffId((prev) => (prev === nextId ? prev : nextId));
  }, [open, lead, staffOptions]);

  /** INVARIANT-04 — the staff picker is never written verbatim. */
  const assignedName = useMemo(() => {
    const label = staffOptions.find((o) => o.id === assignedStaffId)?.label ?? null;
    return resolveAttributionName(staffNameFromOptionLabel(label, null), profile?.full_name);
  }, [staffOptions, assignedStaffId, profile?.full_name]);

  /**
   * INVARIANT-04 — the signed-in actor.
   *
   * The customer record is *assigned* to `assignedName`, but it was *created*
   * by whoever performed the conversion, so `created_by` / `updated_by` record
   * the actor and never the assignee.
   */
  const actorName = useMemo(
    () => resolveSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null) ?? 'System',
    [profile?.full_name],
  );

  const openLeadTasks = useMemo(() => {
    if (!lead) return [];
    return tasks.filter(
      (task) =>
        !task.is_deleted &&
        task.id !== excludeTaskId &&
        task.status !== 'Completed' &&
        task.status !== 'Cancelled' &&
        (task.lead_id === lead.id ||
          (task.related_entity_type === 'lead' && task.related_entity_id === lead.id)),
    );
  }, [tasks, lead, excludeTaskId]);

  /**
   * The customer that already owns this phone number.
   *
   * The desktop conversion dialog offers to link an existing customer instead
   * of creating a duplicate. The mobile sheet does the same.
   */
  const existingCustomer = useMemo(() => {
    const phone10 = normalizePhone10(phone);
    if (!phone10) return null;
    return customers.find((customer) => normalizePhone10(customer.phone) === phone10) ?? null;
  }, [customers, phone]);

  /**
   * Links the lead to the customer that already owns the phone number.
   *
   * The open tasks are relinked to that customer — their `lead_id` stays
   * INTACT (the desktop never nulls it), so the history of the lead is kept.
   */
  const handleLinkExistingCustomer = async () => {
    if (!isOnline) {
      setErrorMsg('Internet required — Retry');
      return;
    }
    if (!existingCustomer) {
      setErrorMsg('This customer could not be found any more. Please try again.');
      return;
    }
    if (!lead) {
      setErrorMsg('This lead could not be found any more. Please try again.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await updateLead(lead.id, {
        status: 'won',
        is_converted: true,
        converted_to_customer_id: existingCustomer.id,
        converted_at: new Date().toISOString(),
        updated_by: actorName,
      } as unknown as Partial<LeadInsert>);

      // The open lead tasks move to the existing customer. Their `lead_id`
      // stays intact — only the customer link changes.
      for (const task of openLeadTasks) {
        try {
          await updateTask(task.id, {
            related_entity_type: 'customer',
            related_entity_id: existingCustomer.id,
          });
        } catch (error) {
          console.warn('[mobile convert] Unable to relink a task.', error);
        }
      }

      await logActivity({
        lead_id: lead.id,
        customer_id: existingCustomer.id,
        activity_type: 'lead_converted',
        activity_category: 'conversion',
        title: 'Lead Linked to Existing Customer',
        description: `${lead.full_name} was linked to the existing customer ${existingCustomer.name}.`,
        metadata: {
          customer_id: existingCustomer.id,
          conversion_type: 'link_existing_customer',
        },
      });

      toast({
        title: 'Lead linked',
        description: `${lead.full_name} is now linked to ${existingCustomer.name}.`,
      });
      onSaved();
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'The lead could not be linked to the customer.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !lead) return null;

  const fileCount = Array.isArray(lead.attachments) ? lead.attachments.length : 0;

  const handleConvert = async () => {
    if (!isOnline) {
      setErrorMsg('Internet required — Retry');
      return;
    }
    const phone10 = normalizePhone10(phone);
    if (!fullName.trim() || !phone10 || !address.trim()) {
      setErrorMsg('Please verify the customer name, 10-digit phone and address.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const base = toCustomerInsert(
        {
          full_name: fullName.trim(),
          phone: phone10,
          alternate_phone: lead.alternate_phone ?? null,
          email: lead.email ?? null,
          firm_name: lead.firm_name ?? null,
          address: address.trim(),
          city: null,
          plus_code: lead.plus_code ?? null,
          notes: lead.notes ?? null,
          additional_contacts: lead.additional_contacts ?? [],
        },
        assignedName,
        actorName,
      );

      const payload = {
        ...base,
        created_from_lead_id: lead.id,
        source: lead.lead_source || 'lead_conversion',
        customer_type: 'individual',
        status: 'active',
        priority: 3,
        materials_purchased: lead.material_interests ?? [],
        referred_by: lead.referred_by ?? null,
      };

      const created = await addCustomer(payload as unknown as CustomerInsert);
      const customerId = created?.id;
      if (!customerId) throw new Error('The customer record could not be created.');

      // The `import_lead_files` toggle is wired to the live conversion flow.
      if (importFiles) {
        try {
          const summary = await importLeadFiles(lead.id, customerId);
          if (summary.failed) {
            toast({
              title: 'Lead files not copied',
              description:
                'The customer was saved, but the lead files could not be copied to the secure vault.',
              variant: 'destructive',
            });
          } else if (summary.imported > 0) {
            toast({
              title: 'Files Copied',
              description: `${summary.imported} file(s) from the lead were added to the customer.`,
            });
          }
        } catch (error) {
          console.warn('[mobile convert] Unable to copy the lead files.', error);
        }
      }

      // Desktop parity: the conversion writes `status: 'won'` — never
      // `'converted'` — plus the conversion columns.
      await updateLead(lead.id, {
        status: 'won',
        is_converted: true,
        converted_to_customer_id: customerId,
        converted_at: new Date().toISOString(),
        updated_by: actorName,
      } as unknown as Partial<LeadInsert>);

      // Open lead tasks move to the new customer.
      for (const task of openLeadTasks) {
        try {
          await updateTask(task.id, {
            related_entity_type: 'customer',
            related_entity_id: customerId,
          });
        } catch (error) {
          console.warn('[mobile convert] Unable to relink a task.', error);
        }
      }

      await logActivity({
        lead_id: lead.id,
        customer_id: customerId,
        activity_type: 'lead_converted',
        activity_category: 'conversion',
        title: 'Lead Converted to Customer',
        description: `${lead.full_name} was converted to a customer record.`,
        metadata: {
          customer_id: customerId,
          conversion_type: 'convert_and_remove',
          import_lead_files: importFiles,
        },
      });

      toast({
        title: 'Conversion successful',
        description: `${lead.full_name} is now a customer.`,
      });
      onSaved();
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'The lead could not be converted.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Convert Lead to Customer"
        className="w-full bg-white rounded-t-[20px] max-h-[90dvh] flex flex-col"
      >
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#1A1A2E]">Convert to Customer</h2>
            <p className="text-xs text-[#47464C] truncate">
              Promote {leadReference(lead)} · {lead.designation}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Convert Sheet"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {(!isOnline || errorMsg) && (
            <div className="p-3 rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg || 'Internet required — Retry'}</span>
            </div>
          )}

          <div>
            <label htmlFor="conv-name" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Customer Name *
            </label>
            <input
              id="conv-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            />
          </div>

          <div>
            <label htmlFor="conv-phone" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Primary Phone *
            </label>
            <input
              id="conv-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(extractEditablePhone10(e.target.value))}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base font-utility text-[#191C1D]"
            />
          </div>

          {/* An existing customer owns this phone number — offer to link it
              instead of creating a duplicate (desktop parity). */}
          {existingCustomer && (
            <div className="p-3.5 rounded-[12px] bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] space-y-2.5">
              <p className="text-xs font-bold">This phone number already belongs to a customer</p>
              <p className="text-xs text-[#1E3A8A]">
                {existingCustomer.name}
                {existingCustomer.company_name ? ` · ${existingCustomer.company_name}` : ''}
              </p>
              <button
                type="button"
                onClick={() => void handleLinkExistingCustomer()}
                disabled={submitting}
                className="w-full min-h-[44px] px-3 rounded-[10px] bg-[#1D4ED8] text-white font-semibold text-sm disabled:opacity-60"
              >
                Link to existing customer
              </button>
              <p className="text-[11px] text-[#1E3A8A]">
                The open tasks are relinked to that customer — the lead link on them stays intact.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="conv-address" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Site / Billing Address *
            </label>
            <input
              id="conv-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            />
          </div>

          <div>
            <label htmlFor="conv-staff" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Assigned Staff
            </label>
            <select
              id="conv-staff"
              value={assignedStaffId}
              onChange={(e) => {
                assignedStaffTouchedRef.current = true;
                setAssignedStaffId(e.target.value);
              }}
              className="w-full min-h-[48px] px-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D]"
            >
              <option value="">{assignedName}</option>
              {staffOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <label className="p-3.5 rounded-[12px] bg-[#EEF2F6] border border-[#E2E8F0] flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-[#1A1A2E] shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-[#1A1A2E]">
                  Copy {fileCount} lead {fileCount === 1 ? 'file' : 'files'} to Encrypted Vault
                </div>
                <div className="text-xs text-[#47464C]">
                  AES-256 protected customer attachment vault
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={importFiles}
              onChange={(e) => setImportFiles(e.target.checked)}
              className="w-5 h-5 accent-[#1A1A2E] shrink-0"
            />
          </label>

          <div className="p-3 rounded-[12px] bg-[#F8F9FA] border border-[#E2E8F0] text-xs text-[#47464C] flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#1A1A2E] shrink-0" />
            <span>
              Live internet connection required.{' '}
              {openLeadTasks.length > 0
                ? `${openLeadTasks.length} open task(s) will transfer to this customer.`
                : 'Open lead tasks will transfer to this customer.'}
            </span>
          </div>
        </div>

        <div className="p-4 border-t border-[#E2E8F0] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void handleConvert()}
            disabled={submitting || !isOnline}
            className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base shadow-[0_10px_20px_-3px_rgba(201,168,76,0.35)] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {!isOnline ? 'Internet required — Retry' : submitting ? 'Converting…' : 'Convert to Customer'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
