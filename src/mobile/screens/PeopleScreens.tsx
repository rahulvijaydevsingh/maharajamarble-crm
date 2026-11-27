/**
 * People screens for the mobile workspace.
 *
 * Ported from the AI Studio prototype
 * (`studio/src/mobile/screens/PeopleScreens.tsx`) onto the live, RLS-scoped
 * Supabase data layer:
 *
 *  - `useLeads()`, `useCustomers()`, `useProfessionals()` power the directory
 *    (no extra queries are issued by the screens themselves),
 *  - `useTasks()` powers the task tab,
 *  - `useActivityLog()` powers the notes tab,
 *  - `useEntityAttachments()` powers the files tab,
 *  - `useCustomerSecureAttachments()` + `useCanManageCustomerAttachments()`
 *    power the encrypted Customer Vault (RPC gated — stricter than the
 *    `customers.manage_attachments` permission string).
 *
 * There is no mock adapter, no hardcoded staff name, no dark mode and no
 * quotation anywhere in this file.
 */

import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FolderOpen,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Navigation,
  Paperclip,
  Phone,
  Plus,
  Search,
  Shield,
  StickyNote,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';

import { useLeads } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useTasks } from '@/hooks/useTasks';
import { useReminders } from '@/hooks/useReminders';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useMobileControlPanel } from '@/mobile/lib/controlPanelContext';
import { useEntityAttachments } from '@/hooks/useEntityAttachments';
import { useCustomerSecureAttachments } from '@/hooks/useCustomerSecureAttachments';
import { useCanManageCustomerAttachments } from '@/hooks/useCanManageCustomerAttachments';
import {
  CUSTOMER_VAULT_PRIVACY_NOTICE,
  canUploadAttachments,
  canViewAttachmentList,
  resolveCustomerVaultAccess,
} from '@/mobile/lib/vaultAccess';
import { useActiveStaffOptions } from '@/hooks/useActiveStaff';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useWeakSignalOutbox } from '@/mobile/outbox/WeakSignalOutboxContext';
import { usePermissions } from '@/hooks/usePermissions';

import { SecureAttachmentUploader } from '@/components/customers/SecureAttachmentUploader';

import { supabase } from '@/integrations/supabase/client';
import { normalizePhone10 } from '@/lib/phone';
import { getLeadConversionAction, isLeadConverted } from '@/lib/leadConversionEligibility';
import { getProfessionalLeadRoleBadges } from '@/lib/professionalLeadAssociations';
import { resolveProfessionalForProfessionalLead } from '@/lib/professionalResolver';
import { extractReferredBy } from '@/lib/referredBy';

import { EntityBadge, StatusBadge, SubHeader } from '@/mobile/shell/MobileShell';
import { ConvertToCustomerSheet, MarkLostSheet } from '@/mobile/screens/LeadScreens';
import {
  parseAdditionalContacts,
  toCustomerInsert,
  toMobileCustomer,
  toMobileLead,
  toMobileProfessional,
  toMobileTask,
  toProfessionalInsert,
} from '@/mobile/lib/mappers';
import { isSafeStaffName, resolveSafeStaffName } from '@/mobile/lib/staffAttribution';
import {
  buildMapsUrl,
  buildTelUrl,
  buildWhatsAppUrl,
  formatFileSize,
  formatPhoneDisplay,
  formatShortDateTime,
} from '@/mobile/lib/format';
import {
  getTaskUrgency,
  isTaskActiveAndNotOrphan,
  sortTasksByUrgency,
} from '@/mobile/lib/tasks';

import type {
  CrmTask,
  EntityKind,
  EntityProfileTab,
  MobileRoute,
  PeopleFilter,
} from '@/mobile/types/crmTypes';

/* -------------------------------------------------------------------------- */
/* Local types + helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How many rows the people directory renders before the user asks for more.
 *
 * The directory can run into the hundreds of contacts — the list is windowed
 * so the phone stays responsive.
 */
const PEOPLE_LIST_WINDOW_CHUNK = 40;

/** The call-outcome target the shell hands to this screen. */
interface CallOutcomeTargetPayload {
  entityType: EntityKind;
  entityId: string;
  entityName: string;
  phone: string;
  taskId?: string | null;
}

interface UnifiedPersonItem {
  key: string;
  entityType: EntityKind;
  entityId: string;
  fullName: string;
  phone: string;
  alternatePhone: string;
  firmName: string;
  location: string;
  subtitle: string;
  /** The *specific* role shown on the badge ("Architect", "Homeowner", …). */
  roleLabel: string;
  statusTag?: string;
  updatedAt: string;
}

interface FormErrors {
  name?: string;
  phone?: string;
  address?: string;
  professionalType?: string;
}

/** `site_supervisor` → `Site Supervisor`. */
function humanizeToken(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * The badge label for a lead. It is always a *role* ("Architect",
 * "Homeowner", "Site Contact"), never the generic word "Lead".
 */
function leadRoleLabel(designation: string | null | undefined, label: string): string {
  const raw = (designation || '').trim();
  if (!raw) return 'Site Contact';
  if (raw.toLowerCase() === 'owner') return 'Homeowner';
  return label || humanizeToken(raw) || 'Site Contact';
}

/** The badge label for a professional — always its type, never "Pro". */
function professionalRoleLabel(professionalType: string | null | undefined, label: string): string {
  const raw = (professionalType || '').trim();
  if (!raw) return 'Site Professional';
  return label || humanizeToken(raw) || 'Site Professional';
}

/** A read-only key/value row used across the overview panels. */
const DetailRow: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0 border-[#F1F5F9]">
    <span className="text-xs font-semibold text-[#47464C] shrink-0">{label}</span>
    <span className="text-sm text-[#1A1A2E] text-right min-w-0 break-words">{value ?? '—'}</span>
  </div>
);

/** A visible inline validation message. Never rendered as a silent no-op. */
const InlineError: React.FC<{ id?: string; message: string }> = ({ id, message }) => (
  <p id={id} role="alert" className="mt-1.5 text-xs font-semibold text-[#DC2626] flex items-start gap-1">
    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
    <span>{message}</span>
  </p>
);

/** A soft "nothing here yet" panel. */
const EmptyPanel: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-5 text-center space-y-1">
    <p className="text-sm font-bold text-[#1A1A2E]">{title}</p>
    {hint ? <p className="text-xs text-[#47464C]">{hint}</p> : null}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Screen 8 — PeoplePage                                                      */
/* -------------------------------------------------------------------------- */

export const PeoplePage: React.FC<{
  initialFilter?: PeopleFilter;
  onNavigate: (route: MobileRoute) => void;
  onOpenCallOutcome: (target: CallOutcomeTargetPayload) => void;
  /**
   * Called when the user taps a Call link. It only records the intent to
   * call; the outcome sheet opens once the user comes back from the dialer.
   */
  onBeginCall?: (target: CallOutcomeTargetPayload) => void;
}> = ({ initialFilter = 'recent', onNavigate, onOpenCallOutcome, onBeginCall }) => {
  const { leads, loading: leadsLoading } = useLeads();
  const { customers, loading: customersLoading } = useCustomers();
  const { professionals, loading: professionalsLoading } = useProfessionals();
  const { getOptionLabel } = useMobileControlPanel();

  const [filter, setFilter] = useState<PeopleFilter>(initialFilter);
  const [rawSearch, setRawSearch] = useState('');
  /** The long directory is windowed — the first chunk is rendered. */
  const [visibleCount, setVisibleCount] = useState(PEOPLE_LIST_WINDOW_CHUNK);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  // Deferred value keeps typing responsive on long directories.
  const deferredSearch = useDeferredValue(rawSearch);
  const searchTerm = useMemo(() => deferredSearch.trim().toLowerCase(), [deferredSearch]);

  const allPeople = useMemo<UnifiedPersonItem[]>(() => {
    const leadItems: UnifiedPersonItem[] = leads
      .map((row) => toMobileLead(row))
      .filter((lead) => !lead.is_deleted)
      .map((lead) => {
        const designationLabel =
          getOptionLabel('leads', 'designation', lead.designation) || humanizeToken(lead.designation);
        return {
          key: `lead:${lead.id}`,
          entityType: 'lead' as EntityKind,
          entityId: lead.id,
          fullName: lead.full_name,
          phone: lead.phone ?? '',
          alternatePhone: lead.alternate_phone ?? '',
          firmName: lead.firm_name ?? '',
          location: lead.site_location ?? '',
          subtitle: [designationLabel, lead.firm_name].filter(Boolean).join(' · '),
          roleLabel: leadRoleLabel(lead.designation, designationLabel),
          statusTag:
            lead.status === 'lost'
              ? 'Lost'
              : // The desktop writes `status: 'won'` for a converted lead, so
                // the conversion has to be read from the conversion columns.
                isLeadConverted(lead)
                ? 'Converted'
                : undefined,
          updatedAt: lead.updated_at ?? '',
        };
      });

    const customerItems: UnifiedPersonItem[] = customers.map((row) => {
      const customer = toMobileCustomer(row);
      const statusLabel =
        getOptionLabel('customers', 'customer_status', customer.customer_status) ||
        humanizeToken(customer.customer_status);
      const materials = customer.material_interests
        .map((value) => getOptionLabel('materials', 'materials', value) || humanizeToken(value))
        .filter(Boolean);
      return {
        key: `customer:${customer.id}`,
        entityType: 'customer' as EntityKind,
        entityId: customer.id,
        fullName: customer.full_name,
        phone: customer.phone ?? '',
        alternatePhone: customer.alternate_phone ?? '',
        firmName: customer.firm_name ?? '',
        location: customer.address ?? '',
        subtitle: [statusLabel, customer.firm_name, materials.slice(0, 2).join(', ')]
          .filter(Boolean)
          .join(' · '),
        roleLabel: 'Homeowner',
        updatedAt: customer.updated_at ?? '',
      };
    });

    const professionalItems: UnifiedPersonItem[] = professionals.map((row) => {
      const professional = toMobileProfessional(row);
      const typeLabel =
        getOptionLabel('professionals', 'professional_type', professional.professional_type) ||
        humanizeToken(professional.professional_type);
      return {
        key: `professional:${professional.id}`,
        entityType: 'professional' as EntityKind,
        entityId: professional.id,
        fullName: professional.full_name,
        phone: professional.phone ?? '',
        alternatePhone: professional.alternate_phone ?? '',
        firmName: professional.firm_name ?? '',
        location: professional.office_location ?? '',
        subtitle: [typeLabel, professional.firm_name].filter(Boolean).join(' · '),
        roleLabel: professionalRoleLabel(professional.professional_type, typeLabel),
        updatedAt: professional.updated_at ?? '',
      };
    });

    return [...leadItems, ...customerItems, ...professionalItems].sort((a, b) => {
      const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return right - left;
    });
  }, [leads, customers, professionals, getOptionLabel]);

  const filtered = useMemo(() => {
    return allPeople.filter((item) => {
      if (filter === 'leads' && item.entityType !== 'lead') return false;
      if (filter === 'customers' && item.entityType !== 'customer') return false;
      if (filter === 'professionals' && item.entityType !== 'professional') return false;

      if (!searchTerm) return true;
      const haystack = [
        item.fullName,
        item.phone,
        item.alternatePhone,
        item.firmName,
        item.location,
        item.subtitle,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [allPeople, filter, searchTerm]);

  const filterPills: { id: PeopleFilter; label: string; count: number }[] = [
    { id: 'recent', label: 'Recent', count: allPeople.length },
    {
      id: 'leads',
      label: 'Leads',
      count: allPeople.filter((person) => person.entityType === 'lead').length,
    },
    {
      id: 'customers',
      label: 'Customers',
      count: allPeople.filter((person) => person.entityType === 'customer').length,
    },
    {
      id: 'professionals',
      label: 'Professionals',
      count: allPeople.filter((person) => person.entityType === 'professional').length,
    },
  ];

  // A new filter or a new search starts from the top of the list again.
  useEffect(() => {
    setVisibleCount(PEOPLE_LIST_WINDOW_CHUNK);
  }, [filter, searchTerm]);

  const isLoading = leadsLoading || customersLoading || professionalsLoading;

  return (
    <div className="flex-1 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-[#1A1A2E]">People Directory</h1>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'lead_form', mode: 'create' })}
          className="min-h-[44px] px-3 rounded-[10px] bg-[#1A1A2E] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4 text-[#C9A84C]" />
          <span>New Lead</span>
        </button>
      </div>

      {/* Search — always 16px so the on-screen keyboard behaves. */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#47464C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          aria-label="Search people"
          value={rawSearch}
          onChange={(event) => setRawSearch(event.target.value)}
          placeholder="Search name, phone, firm, or site..."
          className="w-full min-h-[48px] pl-10 pr-10 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
        />
        {rawSearch ? (
          <button
            type="button"
            onClick={() => setRawSearch('')}
            aria-label="Clear search"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center absolute right-0.5 top-1/2 -translate-y-1/2 text-[#47464C]"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* Filter pills — no "All" pill. */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {filterPills.map((pill) => {
          const active = filter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setFilter(pill.id)}
              className={`min-h-[44px] px-3.5 rounded-full font-utility text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 border ${
                active
                  ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                  : 'bg-white text-[#1A1A2E] border-[#E2E8F0]'
              }`}
            >
              <span>{pill.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] ${
                  active ? 'bg-[#C9A84C] text-[#1A1A2E]' : 'bg-[#EEF2F6] text-[#1A1A2E]'
                }`}
              >
                {pill.count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-6 text-center">
          <Loader2 className="w-5 h-5 mx-auto text-[#47464C] animate-spin" />
          <p className="mt-2 text-sm font-bold text-[#1A1A2E]">Loading people…</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyPanel title="No matching contacts" hint="Try another name, phone, or filter pill." />
      ) : (
        <div className="space-y-2.5">
          {filtered.slice(0, visibleCount).map((person) => (
            <article
              key={person.key}
              style={{ contentVisibility: 'auto' }}
              className="[content-visibility:auto] [contain-intrinsic-size:auto_180px] bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-[0_1px_3px_rgba(26,26,46,0.05)] space-y-3"
            >
              <button
                type="button"
                onClick={() =>
                  onNavigate({
                    name: 'entity_profile',
                    entityType: person.entityType,
                    entityId: person.entityId,
                  })
                }
                className="w-full min-h-[44px] text-left flex items-start justify-between gap-2"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[16px] font-bold text-[#1A1A2E] leading-snug">
                      {person.fullName}
                    </span>
                    <EntityBadge kind={person.entityType} subLabel={person.roleLabel} />
                    {person.statusTag ? (
                      <StatusBadge
                        tone={person.statusTag === 'Lost' ? 'overdue' : 'connected'}
                        label={person.statusTag}
                      />
                    ) : null}
                  </div>
                  {person.subtitle ? (
                    <p className="text-xs font-medium text-[#47464C] leading-snug">{person.subtitle}</p>
                  ) : null}
                  <div className="font-utility text-xs font-semibold text-[#1A1A2E]">
                    {formatPhoneDisplay(person.phone)}
                  </div>
                  {person.location ? (
                    <div className="flex items-start gap-1 text-xs text-[#47464C]">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{person.location}</span>
                    </div>
                  ) : null}
                </div>
                <ChevronRight className="w-5 h-5 text-[#47464C] shrink-0 mt-1" />
              </button>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#F1F5F9]">
                {normalizePhone10(person.phone) ? (
                  <a
                    href={buildTelUrl(person.phone)}
                    onClick={() => {
                      const target = {
                        entityType: person.entityType,
                        entityId: person.entityId,
                        entityName: person.fullName,
                        phone: person.phone,
                      };
                      // This is a `tel:` link: it must only record the intent to
                      // call. The outcome sheet opens when the user comes back.
                      if (onBeginCall) onBeginCall(target);
                      else onOpenCallOutcome(target);
                    }}
                    className="min-h-[44px] rounded-[10px] bg-[#EEF2F6] text-[#1A1A2E] text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call</span>
                  </a>
                ) : (
                  <span className="min-h-[44px] rounded-[10px] bg-[#F3F4F5] text-[#47464C] text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <Phone className="w-4 h-4" />
                    <span>No number</span>
                  </span>
                )}
                {normalizePhone10(person.phone) ? (
                  <a
                    href={buildWhatsAppUrl(person.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] rounded-[10px] bg-[#ECFDF5] text-[#059669] text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </a>
                ) : (
                  <span className="min-h-[44px] rounded-[10px] bg-[#F3F4F5] text-[#47464C] text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <MessageCircle className="w-4 h-4" />
                    <span>No number</span>
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* The rest of the directory waits for the user to ask for it. */}
      {filtered.length > visibleCount ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PEOPLE_LIST_WINDOW_CHUNK)}
          className="w-full min-h-[48px] rounded-[12px] border border-[#E2E8F0] bg-white text-[#1A1A2E] text-sm font-semibold"
        >
          Show more ({filtered.length - visibleCount} left)
        </button>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Screen 9 — EntityProfilePage                                               */
/* -------------------------------------------------------------------------- */

export const EntityProfilePage: React.FC<{
  entityType: EntityKind;
  entityId: string;
  initialTab?: EntityProfileTab;
  onBack: () => void;
  onNavigate: (route: MobileRoute) => void;
  onOpenCallOutcome: (target: CallOutcomeTargetPayload) => void;
  onOpenCompletionSheet: (target: CallOutcomeTargetPayload) => void;
  initialLeadAction?: 'convert' | 'lost' | null;
  onLeadActionHandled?: () => void;
  /** Records the intent to call; the sheet opens on return from the dialer. */
  onBeginCall?: (target: CallOutcomeTargetPayload) => void;
  onOpenQuickTask: (entityType: EntityKind, entityId: string) => void;
}> = ({
  entityType,
  entityId,
  initialTab = 'overview',
  onBack,
  onNavigate,
  onOpenCallOutcome,
  onOpenCompletionSheet,
  initialLeadAction,
  onLeadActionHandled,
  onBeginCall,
  onOpenQuickTask,
}) => {
  const { leads, loading: leadsLoading } = useLeads();
  const { customers, loading: customersLoading } = useCustomers();
  const { professionals, loading: professionalsLoading } = useProfessionals();
  const { tasks } = useTasks();
  const { getOptionLabel } = useMobileControlPanel();
  const { canManage, isLoading: vaultPermissionLoading } = useCanManageCustomerAttachments();
  // The vault access state is derived by the shared, unit-tested helper so
  // every surface applies exactly the same rule.
  const vaultAccess = resolveCustomerVaultAccess({
    canManage,
    isLoading: vaultPermissionLoading,
  });

  const { hasPermission } = usePermissions();
  const { isOnline, enqueue } = useWeakSignalOutbox();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<EntityProfileTab>(initialTab);
  const [noteText, setNoteText] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  /** The lead lifecycle sheets — both are mounted for a lead profile. */
  const [markLostOpen, setMarkLostOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  /** The `lead_professionals` junction rows of this professional. */
  const [professionalLeadLinks, setProfessionalLeadLinks] = useState<
    Array<{
      lead_id: string;
      professional_id: string;
      is_primary_contact: boolean;
      contact_designation: string | null;
    }>
  >([]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, entityType, entityId]);

  /* --- live data ------------------------------------------------------- */

  const activityLeadId = entityType === 'lead' ? entityId : undefined;
  const activityCustomerId = entityType === 'customer' ? entityId : undefined;
  const activityProfessionalId = entityType === 'professional' ? entityId : undefined;

  const {
    activities,
    loading: notesLoading,
    createActivity,
  } = useActivityLog(activityLeadId, activityCustomerId, activityProfessionalId);

  const { reminders } = useReminders(entityType, entityId);
  /**
   * The task scoped alarms live in the same table but under a different
   * entity, so the bell list is read unscoped. Only the rows that belong to
   * the task are ever dismissed.
   */

  /** Writing a task needs `tasks.edit` — a read-only role gets no CTAs. */
  const canEditTasks = hasPermission('tasks.edit');
  /** Scheduling a task needs `tasks.create`. */
  const canCreateTasks = hasPermission('tasks.create');

  // A customer may only be listed by staff whose vault permission is granted.
  const entityFileOptions = useMemo(
    () => ({ skipFetch: entityType === 'customer' && !canViewAttachmentList(vaultAccess) }),
    [entityType, vaultAccess],
  );
  const {
    attachments: entityFiles,
    loading: filesLoading,
    getSignedUrl,
  } = useEntityAttachments(entityType, entityId, entityFileOptions);

  const vaultOptions = useMemo(
    () => ({ enabled: entityType === 'customer' && canViewAttachmentList(vaultAccess) }),
    [entityType, vaultAccess],
  );
  const {
    attachments: vaultFiles,
    isLoading: vaultLoading,
    refetch: refetchVault,
    downloadFile: downloadVaultFile,
  } = useCustomerSecureAttachments(entityType === 'customer' ? entityId : '', vaultOptions);

  // Object URLs created for a vault download are revoked when the screen unmounts.
  const downloadUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = downloadUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
      urls.length = 0;
    };
  }, []);

  /* --- the record ------------------------------------------------------ */

  const lead = useMemo(() => {
    if (entityType !== 'lead') return null;
    const row = leads.find((item) => item.id === entityId);
    return row ? toMobileLead(row) : null;
  }, [entityType, entityId, leads]);

  const customer = useMemo(() => {
    if (entityType !== 'customer') return null;
    const row = customers.find((item) => item.id === entityId);
    return row ? toMobileCustomer(row) : null;
  }, [entityType, entityId, customers]);

  const professional = useMemo(() => {
    if (entityType !== 'professional') return null;
    const row = professionals.find((item) => item.id === entityId);
    return row ? toMobileProfessional(row) : null;
  }, [entityType, entityId, professionals]);

  const entity = lead || customer || professional;
  const isLoading =
    entityType === 'lead'
      ? leadsLoading
      : entityType === 'customer'
        ? customersLoading
        : professionalsLoading;

  const entityName = entity?.full_name || 'Profile';
  const entityPhone = entity?.phone || '';

  useEffect(() => {
    if (entityType !== 'lead' || !lead || !initialLeadAction) return;
    if (initialLeadAction === 'convert') setConvertOpen(true);
    else setMarkLostOpen(true);
    onLeadActionHandled?.();
  }, [entityType, lead?.id, initialLeadAction, onLeadActionHandled]);
  const entityLocation = lead?.site_location || customer?.address || professional?.office_location || '';
  const entityPlusCode = lead?.plus_code || customer?.plus_code || professional?.plus_code || null;
  const roleLabel = lead
    ? leadRoleLabel(
        lead.designation,
        getOptionLabel('leads', 'designation', lead.designation) || humanizeToken(lead.designation),
      )
    : customer
      ? 'Homeowner'
      : professionalRoleLabel(
          professional?.professional_type,
          getOptionLabel('professionals', 'professional_type', professional?.professional_type ?? '') ||
            humanizeToken(professional?.professional_type),
        );

  /* --- the lead <-> professional junction ------------------------------- */

  useEffect(() => {
    if (entityType !== 'professional') {
      setProfessionalLeadLinks([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from('lead_professionals')
      .select('lead_id, professional_id, is_primary_contact, contact_designation')
      .eq('professional_id', entityId)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setProfessionalLeadLinks(
          data as Array<{
            lead_id: string;
            professional_id: string;
            is_primary_contact: boolean;
            contact_designation: string | null;
          }>,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  /* --- linked records --------------------------------------------------- */

  const professionalCandidates = useMemo(
    () =>
      professionals.map((row) => ({
        id: row.id,
        phone: row.phone,
        alternate_phone: row.alternate_phone,
        status: row.status,
      })),
    [professionals],
  );

  const linkedProfessionalForLead = useMemo(() => {
    if (!lead) return null;
    const fromContact = lead.additional_contacts.find((contact) => contact.professional_id)
      ?.professional_id;
    const resolved =
      fromContact ||
      resolveProfessionalForProfessionalLead(
        lead.designation,
        lead.phone,
        professionalCandidates,
      );
    if (!resolved) return null;
    const row = professionals.find((item) => item.id === resolved);
    return row ? toMobileProfessional(row) : null;
  }, [lead, professionalCandidates, professionals]);

  const linkedLeadsForProfessional = useMemo(() => {
    if (!professional) return [];
    const professionalName = (professional.full_name || '').trim().toLowerCase();
    const siteRole =
      (professional.professional_type || '').toLowerCase() === 'contractor'
        ? 'Site Contractor'
        : 'Site Architect';

    const rows: { lead: ReturnType<typeof toMobileLead>; roles: string[] }[] = [];

    leads.forEach((row) => {
      const candidate = toMobileLead(row);
      if (candidate.is_deleted) return;

      // Desktop parity: the shared helper resolves every relationship label
      // for one lead (referrer + site contact) from the junction rows.
      const roles: string[] = getProfessionalLeadRoleBadges(
        professional.id,
        professional.phone,
        {
          id: row.id,
          designation: candidate.designation,
          phone: candidate.phone,
          professional_id: candidate.professional_id ?? null,
          referred_by: row.referred_by,
          additional_contacts: row.additional_contacts,
        },
        professionalLeadLinks,
      );

      // (1) The professional referred this lead.
      const referred = extractReferredBy(row.referred_by);
      const referredName = (referred.name || '').trim().toLowerCase();
      const isReferrer =
        (!!referred.id && referred.id === professional.id) ||
        (!!professionalName && !!referredName && referredName === professionalName);
      if (isReferrer && !roles.includes('Referrer')) roles.push('Referrer');

      // (2) The professional is the site contact for this lead.
      const contactProfessionalId = candidate.additional_contacts.find(
        (contact) => contact.professional_id,
      )?.professional_id;
      const resolved =
        contactProfessionalId ||
        resolveProfessionalForProfessionalLead(
          candidate.designation,
          candidate.phone,
          professionalCandidates,
        );
      if (resolved && resolved === professional.id && !roles.some((role) => role.startsWith('Site '))) {
        roles.push(siteRole);
      }

      if (roles.length > 0) rows.push({ lead: candidate, roles });
    });

    return rows;
  }, [professional, leads, professionalCandidates, professionalLeadLinks]);

  const additionalContacts = lead?.additional_contacts ?? customer?.additional_contacts ?? [];

  /* --- tasks ------------------------------------------------------------ */

  const entityTasks = useMemo(() => {
    const mapped = tasks.map((task) => toMobileTask(task)).filter(isTaskActiveAndNotOrphan);
    const filteredTasks = mapped.filter((task) => {
      if (entityType === 'lead') {
        return (
          task.lead_id === entityId ||
          (task.related_entity_type === 'lead' && task.related_entity_id === entityId)
        );
      }
      if (entityType === 'customer') {
        return task.related_entity_type === 'customer' && task.related_entity_id === entityId;
      }
      return task.related_entity_type === 'professional' && task.related_entity_id === entityId;
    });
    return sortTasksByUrgency(filteredTasks);
  }, [tasks, entityType, entityId]);

  /* --- handlers --------------------------------------------------------- */

  const handleEdit = useCallback(() => {
    if (lead) {
      onNavigate({ name: 'lead_form', mode: 'edit', leadId: lead.id });
      return;
    }
    if (customer) {
      onNavigate({ name: 'customer_edit', customerId: customer.id });
      return;
    }
    if (professional) {
      onNavigate({ name: 'professional_edit', professionalId: professional.id });
    }
  }, [lead, customer, professional, onNavigate]);

  const handleSaveNote = useCallback(async () => {
    const text = noteText.trim();
    if (!text) {
      // Never a silent no-op — the reason is always shown under the composer.
      setNoteError('Write a note before saving it.');
      return;
    }
    setNoteError(null);
    setSavingNote(true);
    try {
      await createActivity({
        activity_type: 'custom_note',
        activity_category: 'note',
        title: 'Field note',
        description: text,
        lead_id: entityType === 'lead' ? entityId : undefined,
        customer_id: entityType === 'customer' ? entityId : undefined,
        related_entity_type: entityType,
        related_entity_id: entityId,
      });
      setNoteText('');
    } catch {
      setNoteError('The note could not be saved. Check your connection and try again.');
    } finally {
      setSavingNote(false);
    }
  }, [noteText, createActivity, entityType, entityId]);

  /** Every Mark Complete tap now requires an explicit outcome in the shared sheet. */
  const handleCompleteTask = (task: CrmTask) => {
    onOpenCompletionSheet({
      entityType,
      entityId,
      entityName,
      phone: entityPhone,
      taskId: task.id,
    });
  };

  const handleOpenEntityFile = useCallback(
    async (filePath: string | null | undefined) => {
      if (!filePath) {
        setFileError('This file is unavailable because it is not stored in the CRM.');
        return;
      }
      setFileError(null);
      // iOS Safari blocks a `window.open` that happens after an await — the
      // popup is no longer "in the user gesture". The blank window is opened
      // synchronously and the signed URL is written into it afterwards.
      const popup = window.open('', '_blank', 'noopener,noreferrer');
      try {
        const url = await getSignedUrl(filePath);
        if (popup) {
          popup.location.href = url;
        } else {
          window.location.assign(url);
        }
      } catch {
        if (popup) popup.close();
        setFileError('This file could not be opened. It may have been removed from storage.');
      }
    },
    [getSignedUrl],
  );

  const handleVaultDownload = useCallback(
    async (attachmentId: string, fileName: string) => {
      setFileError(null);
      try {
        const blob = await downloadVaultFile(attachmentId);
        const url = URL.createObjectURL(blob);
        downloadUrlsRef.current.push(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
          downloadUrlsRef.current = downloadUrlsRef.current.filter((item) => item !== url);
        }, 60_000);
      } catch {
        setFileError('This file could not be downloaded. Try again in a moment.');
      }
    },
    [downloadVaultFile],
  );

  /* --- not found / loading ---------------------------------------------- */

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col">
        <SubHeader title="Profile" onBack={onBack} />
        <div className="p-6 text-center">
          <Loader2 className="w-5 h-5 mx-auto text-[#47464C] animate-spin" />
          <p className="mt-2 text-sm font-bold text-[#1A1A2E]">Loading record…</p>
        </div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col">
        <SubHeader title="Record Not Found" onBack={onBack} />
        <div className="p-6 text-center space-y-3">
          <p className="text-sm text-[#47464C]">This record may have been archived or removed.</p>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] px-5 rounded-[12px] bg-[#1A1A2E] text-white font-semibold text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const statusTag = lead
    ? lead.status === 'lost'
      ? { tone: 'overdue' as const, label: 'Lost' }
      : // The desktop writes `status: 'won'` for a converted lead — the
        // conversion lives in `is_converted` / `converted_to_customer_id`.
        isLeadConverted(lead)
        ? { tone: 'connected' as const, label: 'Converted' }
        : null
    : null;

  /**
   * The lead lifecycle actions.
   *
   * The shared desktop helper decides what is offered: a converted lead shows
   * a disabled "Converted to Customer" button, a lead that is already lost or
   * pending a decision cannot be marked lost again, and a staff member without
   * the `leads.convert` permission never sees the conversion at all.
   */
  const conversionAction = lead
    ? getLeadConversionAction(lead, hasPermission('leads.convert'), true)
    : 'hidden';
  const canMarkLost =
    Boolean(lead) &&
    lead?.status !== 'lost' &&
    lead?.status !== 'pending_lost' &&
    conversionAction !== 'converted';

  const tabs: { id: EntityProfileTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: `Tasks (${entityTasks.length})` },
    // The tab lists every logged activity, not only notes.
    { id: 'notes', label: `Activity (${activities.length})` },
    { id: 'files', label: 'Files' },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col pb-[env(safe-area-inset-bottom)]">
      <SubHeader
        title={entityName}
        subtitle={
          lead
            ? `${lead.designation ? humanizeToken(lead.designation) : 'Lead'}${lead.firm_name ? ` · ${lead.firm_name}` : ''}`
            : customer
              ? `${customer.customer_status ? humanizeToken(customer.customer_status) : 'Customer'}${customer.firm_name ? ` · ${customer.firm_name}` : ''}`
              : `${professional?.professional_type ? humanizeToken(professional.professional_type) : 'Professional'}${professional?.firm_name ? ` · ${professional.firm_name}` : ''}`
        }
        onBack={onBack}
      />

      <div className="flex-1 p-4 pb-8 space-y-4">
        {/* Summary card */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-[0_1px_3px_rgba(26,26,46,0.05)] space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <EntityBadge kind={entityType} subLabel={roleLabel} />
                {statusTag ? <StatusBadge tone={statusTag.tone} label={statusTag.label} /> : null}
              </div>
              <div className="font-utility text-sm font-bold text-[#1A1A2E] pt-1">
                {formatPhoneDisplay(entityPhone)}
              </div>
              {entityLocation ? (
                <div className="flex items-start gap-1.5 text-xs text-[#47464C]">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {entityLocation}
                    {entityPlusCode ? ` (${entityPlusCode})` : ''}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={`grid gap-1.5 pt-2.5 border-t border-[#F1F5F9] ${
              entityLocation ? 'grid-cols-4' : 'grid-cols-3'
            }`}
          >
            {normalizePhone10(entityPhone) ? (
              <a
                href={buildTelUrl(entityPhone)}
                onClick={() => {
                  const target = {
                    entityType,
                    entityId,
                    entityName,
                    phone: entityPhone,
                  };
                  // This is a `tel:` link: it must only record the intent to
                  // call. The outcome sheet opens when the user comes back.
                  if (onBeginCall) onBeginCall(target);
                  else onOpenCallOutcome(target);
                }}
                className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#EEF2F6] text-[#1A1A2E] flex flex-col items-center justify-center gap-0.5"
              >
                <Phone className="w-4 h-4 shrink-0" />
                <span className="font-utility text-[11px] font-semibold whitespace-nowrap">Call</span>
              </a>
            ) : (
              <span className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#F3F4F5] text-[#47464C] flex flex-col items-center justify-center gap-0.5">
                <Phone className="w-4 h-4 shrink-0" />
                <span className="font-utility text-[11px] font-semibold whitespace-nowrap">Call</span>
              </span>
            )}

            {normalizePhone10(entityPhone) ? (
              <a
                href={buildWhatsAppUrl(entityPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#ECFDF5] text-[#059669] flex flex-col items-center justify-center gap-0.5"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="font-utility text-[11px] font-semibold whitespace-nowrap">WA</span>
              </a>
            ) : (
              <span className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#F3F4F5] text-[#47464C] flex flex-col items-center justify-center gap-0.5">
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="font-utility text-[11px] font-semibold whitespace-nowrap">WA</span>
              </span>
            )}

            {entityLocation ? (
              <a
                href={buildMapsUrl(entityLocation, entityPlusCode)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] text-[#1A1A2E] flex flex-col items-center justify-center gap-0.5"
              >
                <Navigation className="w-4 h-4 shrink-0" />
                <span className="font-utility text-[11px] font-semibold whitespace-nowrap">Maps</span>
              </a>
            ) : null}

            <button
              type="button"
              onClick={handleEdit}
              className="min-h-[48px] px-1 py-1.5 rounded-[10px] bg-[#1A1A2E] text-white flex flex-col items-center justify-center gap-0.5"
            >
              <Edit3 className="w-4 h-4 shrink-0 text-[#C9A84C]" />
              <span className="font-utility text-[11px] font-semibold whitespace-nowrap">Edit</span>
            </button>
          </div>
        </section>

        {/* Lead lifecycle — only for a lead record. */}
        {lead && (conversionAction !== 'hidden' || canMarkLost) ? (
          <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-2.5">
            <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C]">
              Lead Lifecycle
            </h2>
            <div className="flex flex-wrap gap-2">
              {conversionAction === 'converted' ? (
                <button
                  type="button"
                  disabled
                  className="min-h-[44px] px-3 rounded-[10px] bg-[#F3F4F5] text-[#47464C] text-sm font-semibold flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Converted to Customer</span>
                </button>
              ) : conversionAction === 'parent' || conversionAction === 'fallback' ? (
                <button
                  type="button"
                  onClick={() => setConvertOpen(true)}
                  className="min-h-[44px] px-3 rounded-[10px] bg-[#1A1A2E] text-white text-sm font-semibold flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#C9A84C]" />
                  <span>Convert to Customer</span>
                </button>
              ) : null}

              {canMarkLost ? (
                <button
                  type="button"
                  onClick={() => setMarkLostOpen(true)}
                  className="min-h-[44px] px-3 rounded-[10px] border border-[#FECACA] text-[#DC2626] text-sm font-semibold flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Mark Lost</span>
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Profile sections"
          className="grid grid-cols-4 gap-1 p-1 rounded-[12px] bg-[#EEF2F6]"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] px-1 rounded-[10px] font-utility text-xs font-bold whitespace-nowrap transition-colors ${
                  active ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-[#47464C]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ---------------------------------------------------------- Overview */}
        {activeTab === 'overview' ? (
          <div className="space-y-3">
            <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4">
              <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C] mb-1">
                Details
              </h2>
              {lead ? (
                <>
                  <DetailRow label="Designation" value={humanizeToken(lead.designation) || '—'} />
                  <DetailRow label="Firm" value={lead.firm_name || '—'} />
                  <DetailRow label="Phone" value={formatPhoneDisplay(lead.phone)} />
                  <DetailRow
                    label="Alternate phone"
                    value={lead.alternate_phone ? formatPhoneDisplay(lead.alternate_phone) : '—'}
                  />
                  <DetailRow label="Email" value={lead.email || '—'} />
                  <DetailRow label="Site location" value={lead.site_location || '—'} />
                  <DetailRow label="Address" value={lead.address || '—'} />
                  <DetailRow label="Plus code" value={lead.plus_code || '—'} />
                  <DetailRow
                    label="Construction stage"
                    value={humanizeToken(lead.construction_stage) || '—'}
                  />
                  <DetailRow label="Source" value={humanizeToken(lead.lead_source) || '—'} />
                  <DetailRow
                    label="Materials"
                    value={
                      lead.material_interests.length > 0
                        ? lead.material_interests
                            .map(
                              (value) =>
                                getOptionLabel('materials', 'materials', value) ||
                                humanizeToken(value),
                            )
                            .join(', ')
                        : '—'
                    }
                  />
                  <DetailRow
                    label="Next follow-up"
                    value={lead.next_action_at ? formatShortDateTime(lead.next_action_at) : '—'}
                  />
                  <DetailRow label="Assigned to" value={lead.assigned_to || '—'} />
                  <DetailRow
                    label="Last updated"
                    value={lead.updated_at ? formatShortDateTime(lead.updated_at) : '—'}
                  />
                  <DetailRow label="Notes" value={lead.notes || '—'} />
                </>
              ) : customer ? (
                <>
                  <DetailRow label="Status" value={humanizeToken(customer.customer_status) || '—'} />
                  <DetailRow label="Firm" value={customer.firm_name || '—'} />
                  <DetailRow label="Phone" value={formatPhoneDisplay(customer.phone)} />
                  <DetailRow
                    label="Alternate phone"
                    value={
                      customer.alternate_phone ? formatPhoneDisplay(customer.alternate_phone) : '—'
                    }
                  />
                  <DetailRow label="Email" value={customer.email || '—'} />
                  <DetailRow label="Address" value={customer.address || '—'} />
                  <DetailRow label="City" value={customer.city || '—'} />
                  <DetailRow label="Plus code" value={customer.plus_code || '—'} />
                  <DetailRow
                    label="Materials"
                    value={
                      customer.material_interests.length > 0
                        ? customer.material_interests
                            .map(
                              (value) =>
                                getOptionLabel('materials', 'materials', value) ||
                                humanizeToken(value),
                            )
                            .join(', ')
                        : '—'
                    }
                  />
                  <DetailRow label="Assigned to" value={customer.assigned_to || '—'} />
                  <DetailRow
                    label="Last updated"
                    value={customer.updated_at ? formatShortDateTime(customer.updated_at) : '—'}
                  />
                  <DetailRow label="Notes" value={customer.notes || '—'} />
                </>
              ) : professional ? (
                <>
                  <DetailRow label="Professional type" value={humanizeToken(professional.professional_type) || '—'} />
                  <DetailRow label="Firm" value={professional.firm_name || '—'} />
                  <DetailRow label="Phone" value={formatPhoneDisplay(professional.phone)} />
                  <DetailRow
                    label="Alternate phone"
                    value={
                      professional.alternate_phone
                        ? formatPhoneDisplay(professional.alternate_phone)
                        : '—'
                    }
                  />
                  <DetailRow label="Email" value={professional.email || '—'} />
                  <DetailRow label="Office location" value={professional.office_location || '—'} />
                  <DetailRow label="City" value={professional.city || '—'} />
                  <DetailRow label="Plus code" value={professional.plus_code || '—'} />
                  <DetailRow
                    label="Status"
                    value={humanizeToken(professional.professional_status) || '—'}
                  />
                  <DetailRow label="Assigned to" value={professional.assigned_to || '—'} />
                  <DetailRow
                    label="Last updated"
                    value={professional.updated_at ? formatShortDateTime(professional.updated_at) : '—'}
                  />
                  <DetailRow label="Notes" value={professional.notes || '—'} />
                </>
              ) : null}
            </section>

            {/* Reminders */}
            <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-2">
              <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C]">
                Reminders ({reminders.length})
              </h2>
              {reminders.length === 0 ? (
                <p className="text-xs text-[#47464C]">No reminders scheduled for this record.</p>
              ) : (
                <div className="space-y-2">
                  {reminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="p-3 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] flex items-start gap-2.5"
                    >
                      <CalendarClock className="w-4 h-4 text-[#1A1A2E] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#1A1A2E]">{reminder.title}</div>
                        <div className="font-utility text-[11px] text-[#47464C]">
                          {formatShortDateTime(reminder.reminder_datetime)}
                          {reminder.assigned_to ? ` · ${reminder.assigned_to}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Additional contacts (lead + customer) */}
            {additionalContacts.length > 0 ? (
              <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-2.5">
                <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C]">
                  Additional Contacts ({additionalContacts.length})
                </h2>
                {additionalContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0 border-[#F1F5F9]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#1A1A2E] truncate">
                        {contact.name}
                      </div>
                      <div className="text-xs text-[#47464C]">
                        {contact.relation || contact.designation || 'Site Contact'} ·{' '}
                        {formatPhoneDisplay(contact.phone)}
                      </div>
                    </div>
                    <a
                      href={buildTelUrl(contact.phone)}
                      aria-label={`Call ${contact.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-[10px] bg-[#EEF2F6] text-[#1A1A2E] flex items-center justify-center shrink-0"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </section>
            ) : null}

            {/* Linked professional (lead) */}
            {lead ? (
              <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-2.5">
                <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C]">
                  Linked Professional
                </h2>
                {linkedProfessionalForLead ? (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate({
                        name: 'entity_profile',
                        entityType: 'professional',
                        entityId: linkedProfessionalForLead.id,
                      })
                    }
                    className="w-full min-h-[44px] p-3 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] text-left flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-bold text-[#1A1A2E] truncate">
                        {linkedProfessionalForLead.full_name}
                      </div>
                      <div className="text-xs text-[#47464C] truncate">
                        {humanizeToken(linkedProfessionalForLead.professional_type)}
                        {linkedProfessionalForLead.firm_name
                          ? ` · ${linkedProfessionalForLead.firm_name}`
                          : ''}
                      </div>
                      <div className="font-utility text-[11px] text-[#47464C]">
                        {formatPhoneDisplay(linkedProfessionalForLead.phone)}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#47464C] shrink-0" />
                  </button>
                ) : (
                  <p className="text-xs text-[#47464C]">
                    No professional is linked to this lead yet.
                  </p>
                )}
              </section>
            ) : null}

            {/* Linked leads (professional) */}
            {professional ? (
              <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-3">
                <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C]">
                  Linked Leads ({linkedLeadsForProfessional.length})
                </h2>
                {linkedLeadsForProfessional.length === 0 ? (
                  <p className="text-xs text-[#47464C]">No linked leads yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {linkedLeadsForProfessional.map(({ lead: linkedLead, roles }) => (
                      <button
                        key={linkedLead.id}
                        type="button"
                        onClick={() =>
                          onNavigate({
                            name: 'entity_profile',
                            entityType: 'lead',
                            entityId: linkedLead.id,
                          })
                        }
                        className="w-full min-h-[44px] p-3 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] text-left flex items-center justify-between gap-2"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="text-sm font-bold text-[#1A1A2E] truncate">
                            {linkedLead.full_name}
                          </div>
                          <div className="text-xs text-[#47464C] truncate">
                            {linkedLead.site_location || '—'}
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {roles.map((role) => (
                              <span
                                key={role}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EEF2F6] text-[#1A1A2E] font-utility text-[11px] font-bold whitespace-nowrap"
                              >
                                <Briefcase className="w-3 h-3" />
                                <span>{role}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#47464C] shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        ) : null}

        {/* ------------------------------------------------------------ Tasks */}
        {activeTab === 'tasks' ? (
          <div className="space-y-3">
            {canCreateTasks ? (
              <button
                type="button"
                onClick={() => onOpenQuickTask(entityType, entityId)}
                className="w-full min-h-[48px] rounded-[12px] bg-[#1A1A2E] text-white text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4 text-[#C9A84C]" />
                <span>Schedule Task for {entityName}</span>
              </button>
            ) : null}

            {entityTasks.length === 0 ? (
              <EmptyPanel
                title="No tasks scheduled for this record"
                hint="Tap the button above to schedule one."
              />
            ) : (
              entityTasks.map((task) => {
                const urgency = getTaskUrgency(task);
                const tone =
                  urgency === 'overdue'
                    ? 'overdue'
                    : urgency === 'due_today'
                      ? 'due_today'
                      : urgency === 'completed'
                        ? 'connected'
                        : 'neutral';
                const label =
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
                  <div
                    key={task.id}
                    className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge tone={tone} label={label} />
                      <span className="font-utility text-xs text-[#47464C]">
                        {formatShortDateTime(task.due_at)}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-[#1A1A2E]">{task.title}</div>
                    {task.description ? (
                      <p className="text-xs text-[#47464C] leading-relaxed">{task.description}</p>
                    ) : null}
                    <div className="font-utility text-[11px] text-[#47464C]">
                      {task.task_type || 'Task'} · {task.assigned_to || 'Unassigned'}
                    </div>
                    {task.status !== 'Completed' && task.status !== 'Cancelled' && canEditTasks ? (
                      <button
                        type="button"
                        onClick={() => handleCompleteTask(task)}
                        className="w-full min-h-[44px] rounded-[10px] bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] text-xs font-semibold"
                      >
                        Mark Complete
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {/* ------------------------------------------------------------ Notes */}
        {activeTab === 'notes' ? (
          <div className="space-y-3">
            <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-3.5 space-y-2.5">
              <label
                htmlFor="entity-note"
                className="block font-utility text-[11px] font-bold uppercase tracking-wider text-[#47464C]"
              >
                Add a field note
              </label>
              <textarea
                id="entity-note"
                rows={3}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Add a field note or measurement update..."
                className="w-full p-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FA] text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
              />
              {noteError ? <InlineError id="entity-note-error" message={noteError} /> : null}
              <button
                type="button"
                onClick={() => {
                  void handleSaveNote();
                }}
                disabled={savingNote}
                className="w-full min-h-[44px] rounded-[10px] bg-[#C9A84C] text-[#1A1A2E] text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {savingNote ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <StickyNote className="w-4 h-4" />
                )}
                <span>{savingNote ? 'Saving…' : 'Save Note'}</span>
              </button>
            </div>

            {notesLoading ? (
              <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-5 text-center">
                <Loader2 className="w-4 h-4 mx-auto text-[#47464C] animate-spin" />
                <p className="mt-1.5 text-xs text-[#47464C]">Loading notes…</p>
              </div>
            ) : activities.length === 0 ? (
              <EmptyPanel title="No notes recorded yet" />
            ) : (
              <div className="bg-white border border-[#E2E8F0] rounded-[12px] divide-y divide-[#F1F5F9]">
                {activities.map((activity) => (
                  <div key={activity.id} className="p-3.5 space-y-1">
                    <div className="flex items-start gap-2">
                      <StickyNote className="w-3.5 h-3.5 text-[#47464C] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1A1A2E]">{activity.title}</p>
                        {activity.description ? (
                          <p className="text-sm text-[#191C1D] leading-relaxed whitespace-pre-line">
                            {activity.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="font-utility text-[11px] text-[#47464C] pl-6">
                      {activity.user_name || 'System'} ·{' '}
                      {formatShortDateTime(activity.activity_timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* ------------------------------------------------------------ Files */}
        {activeTab === 'files' ? (
          <div className="space-y-3">
            {fileError ? <InlineError id="files-error" message={fileError} /> : null}

            {entityType === 'customer' && vaultAccess === 'loading' ? (
              /* The permission RPC is still in flight. A neutral spinner — never
                 the restriction notice, which flashed at admins on every load. */
              <div className="py-8 text-center">
                <Loader2 className="w-5 h-5 mx-auto text-[#47464C] animate-spin" />
                <p className="mt-2 text-xs text-[#47464C]">Checking vault access…</p>
              </div>
            ) : entityType === 'customer' && vaultAccess === 'privacy_notice' ? (
              /* Strict Customer Vault privacy: staff without vault permission see
                 the notice and may upload a file blind, but they never get the
                 list, a preview or a download. */
              <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#1A1A2E]" />
                  <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#1A1A2E]">
                    Encrypted Customer Vault
                  </h2>
                </div>
                <div className="p-3.5 rounded-[12px] bg-[#EEF2F6] border border-[#E2E8F0] flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-[#1A1A2E] shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-[#1A1A2E] leading-relaxed">
                    {CUSTOMER_VAULT_PRIVACY_NOTICE}
                  </p>
                </div>
                {customer ? (
                  <SecureAttachmentUploader
                    mode="immediate"
                    customerId={customer.id}
                    onUploaded={() => undefined}
                  />
                ) : null}
              </section>
            ) : (
              <>
                {/* Working files for the record */}
                <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C]">
                      Files ({entityFiles.length})
                    </h2>
                    <FolderOpen className="w-4 h-4 text-[#47464C]" />
                  </div>
                  {filesLoading ? (
                    <div className="py-3 text-center">
                      <Loader2 className="w-4 h-4 mx-auto text-[#47464C] animate-spin" />
                      <p className="mt-1.5 text-xs text-[#47464C]">Loading files…</p>
                    </div>
                  ) : entityFiles.length === 0 ? (
                    <p className="text-xs text-[#47464C]">No files attached to this record.</p>
                  ) : (
                    <div className="space-y-2">
                      {entityFiles.map((file) => (
                        <div
                          key={file.id}
                          className="p-3 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] flex items-center gap-3"
                        >
                          <Paperclip className="w-4 h-4 text-[#1A1A2E] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-[#1A1A2E] truncate">
                              {file.file_name}
                            </div>
                            <div className="font-utility text-[11px] text-[#47464C] truncate">
                              {formatFileSize(file.file_size)} · {file.uploaded_by} ·{' '}
                              {formatShortDateTime(file.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void handleOpenEntityFile(file.file_path);
                            }}
                            aria-label={`Open ${file.file_name}`}
                            className="min-h-[44px] min-w-[44px] rounded-[10px] bg-[#EEF2F6] text-[#1A1A2E] flex items-center justify-center shrink-0"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Encrypted Customer Vault — privileged staff only */}
                {entityType === 'customer' && customer ? (
                  <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-3.5">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#1A1A2E]" />
                      <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#1A1A2E]">
                        Encrypted Customer Vault
                      </h2>
                    </div>

                    <div className="p-3.5 rounded-[12px] bg-[#EEF2F6] border border-[#E2E8F0] flex items-start gap-2.5">
                      <Shield className="w-4 h-4 text-[#1A1A2E] shrink-0 mt-0.5" />
                      <p className="text-xs font-medium text-[#1A1A2E] leading-relaxed">
                        These documents are encrypted at rest. You have vault permission, so you can
                        upload and open them.
                      </p>
                    </div>

                    <SecureAttachmentUploader
                      mode="immediate"
                      customerId={customer.id}
                      onUploaded={() => {
                        void refetchVault();
                      }}
                    />

                    <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                      <div className="font-utility text-[11px] font-bold uppercase text-[#47464C]">
                        Secured files ({vaultFiles.length})
                      </div>
                      {vaultLoading ? (
                        <div className="py-3 text-center">
                          <Loader2 className="w-4 h-4 mx-auto text-[#47464C] animate-spin" />
                          <p className="mt-1.5 text-xs text-[#47464C]">Loading vault…</p>
                        </div>
                      ) : vaultFiles.length === 0 ? (
                        <p className="text-xs text-[#47464C]">The vault is currently empty.</p>
                      ) : (
                        vaultFiles.map((file) => (
                          <div
                            key={file.id}
                            className="p-2.5 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Lock className="w-4 h-4 text-[#059669] shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#1A1A2E] truncate">
                                  {file.file_name}
                                </div>
                                <div className="font-utility text-[11px] text-[#47464C] truncate">
                                  {formatFileSize(file.file_size)} ·{' '}
                                  {file.uploaded_by_name || 'Staff'} ·{' '}
                                  {formatShortDateTime(file.created_at)}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                void handleVaultDownload(file.id, file.file_name);
                              }}
                              aria-label={`Download ${file.file_name}`}
                              className="min-h-[44px] min-w-[44px] rounded-[10px] bg-[#EEF2F6] text-[#1A1A2E] flex items-center justify-center shrink-0"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* The lead lifecycle sheets — both are mounted for a lead profile so
          the actions above are never a dead end. */}
      {entityType === 'lead' && lead ? (
        <>
          <MarkLostSheet
            open={markLostOpen}
            lead={lead}
            onClose={() => setMarkLostOpen(false)}
            onSaved={() => setMarkLostOpen(false)}
          />
          <ConvertToCustomerSheet
            open={convertOpen}
            lead={lead}
            onClose={() => setConvertOpen(false)}
            onSaved={() => setConvertOpen(false)}
          />
        </>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Screen 10a — MobileCustomerEditForm                                         */
/* -------------------------------------------------------------------------- */

export const MobileCustomerEditForm: React.FC<{
  customerId: string;
  onCancel: () => void;
  onSaved: () => void;
}> = ({ customerId, onCancel, onSaved }) => {
  const { customers, loading, updateCustomer } = useCustomers();
  const { getFieldOptions } = useMobileControlPanel();
  const { canManage, isLoading: vaultPermissionLoading } = useCanManageCustomerAttachments();
  const vaultAccess = resolveCustomerVaultAccess({
    canManage,
    isLoading: vaultPermissionLoading,
  });
  const { profile } = useAuth();
  const { options: staffOptions } = useActiveStaffOptions();
  const {
    attachments: vaultFiles,
    isLoading: vaultLoading,
    refetch: refetchVault,
    downloadFile: downloadVaultFile,
  } = useCustomerSecureAttachments(customerId, {
    enabled: canViewAttachmentList(vaultAccess),
  });

  const customer = useMemo(
    () => customers.find((item) => item.id === customerId) ?? null,
    [customers, customerId],
  );

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [firmName, setFirmName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [plusCode, setPlusCode] = useState('');
  const [notes, setNotes] = useState('');
  const [materialInterests, setMaterialInterests] = useState<string[]>([]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const initializedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!customer) return;
    if (initializedIdRef.current === customer.id) return;
    initializedIdRef.current = customer.id;
    setFullName(customer.name ?? '');
    setPhone(customer.phone ?? '');
    setAlternatePhone(customer.alternate_phone ?? '');
    setEmail(customer.email ?? '');
    setFirmName(customer.company_name ?? '');
    setAddress(customer.address ?? '');
    setCity(customer.city ?? '');
    setPlusCode(customer.site_plus_code ?? '');
    setNotes(customer.notes ?? '');
    setMaterialInterests(Array.isArray(customer.materials_purchased) ? customer.materials_purchased : []);
  }, [customer]);

  const materialOptions = useMemo(
    () => getFieldOptions('materials', 'materials'),
    [getFieldOptions],
  );

  const staffCandidate = useMemo(() => {
    const match = staffOptions.find((option) => option.id === profile?.id);
    return match?.name ?? null;
  }, [staffOptions, profile?.id]);

  const downloadUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = downloadUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
      urls.length = 0;
    };
  }, []);

  const handleVaultDownload = useCallback(
    async (attachmentId: string, fileName: string) => {
      setFileError(null);
      try {
        const blob = await downloadVaultFile(attachmentId);
        const url = URL.createObjectURL(blob);
        downloadUrlsRef.current.push(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
          downloadUrlsRef.current = downloadUrlsRef.current.filter((item) => item !== url);
        }, 60_000);
      } catch {
        setFileError('This file could not be downloaded. Try again in a moment.');
      }
    },
    [downloadVaultFile],
  );

  const handleSave = useCallback(async () => {
    const nextErrors: FormErrors = {};
    if (!fullName.trim()) {
      nextErrors.name = 'Name is required.';
    }
    const phone10 = normalizePhone10(phone);
    if (!phone10) {
      nextErrors.phone = 'Enter a valid 10-digit phone number (it must start with 6, 7, 8 or 9).';
    }
    if (!address.trim()) {
      nextErrors.address = 'Address is required.';
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      // The reason is always visible inline — never a silent no-op.
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const staffName = resolveSafeStaffName(staffCandidate, profile?.full_name) ?? 'System';
      const assignedTo = isSafeStaffName(customer?.assigned_to)
        ? (customer?.assigned_to as string)
        : staffName;
      const alternate10 = normalizePhone10(alternatePhone);

      const payload = toCustomerInsert(
        {
          full_name: fullName,
          phone: phone10 ?? phone,
          alternate_phone: alternate10,
          email: email.trim() || null,
          firm_name: firmName.trim() || null,
          address: address.trim(),
          city: city.trim() || null,
          plus_code: plusCode.trim() || null,
          notes: notes.trim() || null,
          additional_contacts: parseAdditionalContacts(customer?.additional_contacts),
        },
        staffName,
      );

      await updateCustomer(customerId, {
        ...payload,
        // An edit must never rewrite the original creator or the assignee.
        created_by: undefined,
        assigned_to: assignedTo,
        materials_purchased: materialInterests,
      });
      onSaved();
    } catch {
      setSaveError('The customer could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [
    fullName,
    phone,
    alternatePhone,
    email,
    firmName,
    address,
    city,
    plusCode,
    notes,
    materialInterests,
    customer,
    customerId,
    staffCandidate,
    profile?.full_name,
    updateCustomer,
    onSaved,
  ]);

  if (loading && !customer) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col">
        <SubHeader title="Edit Customer" onBack={onCancel} />
        <div className="p-6 text-center">
          <Loader2 className="w-5 h-5 mx-auto text-[#47464C] animate-spin" />
          <p className="mt-2 text-sm font-bold text-[#1A1A2E]">Loading customer…</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col">
        <SubHeader title="Customer Not Found" onBack={onCancel} />
        <div className="p-6 text-center space-y-3">
          <p className="text-sm text-[#47464C]">
            This customer may have been removed. Go back and pick another record.
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] px-5 rounded-[12px] bg-[#1A1A2E] text-white font-semibold text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col pb-[env(safe-area-inset-bottom)]">
      <SubHeader
        title="Edit Customer"
        subtitle={customer.name || 'Customer'}
        onBack={onCancel}
      />

      <div className="flex-1 p-4 pb-28 space-y-4">
        {hasErrors ? (
          <div
            role="alert"
            className="p-3 rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-xs font-semibold flex items-start gap-1.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>Some details are missing. Please fix the highlighted fields below.</span>
          </div>
        ) : null}

        {saveError ? <InlineError id="customer-save-error" message={saveError} /> : null}

        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-3.5">
          <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C]">
            Customer Details
          </h2>

          <div>
            <label
              htmlFor="cust-name"
              className="block text-xs font-semibold text-[#1A1A2E] mb-1"
            >
              Full Name *
            </label>
            <input
              id="cust-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'cust-name-error' : undefined}
              className={`w-full min-h-[48px] px-3.5 rounded-[12px] border bg-white text-base text-[#191C1D] focus:outline-none ${
                errors.name ? 'border-[#DC2626]' : 'border-[#E2E8F0] focus:border-[#1A1A2E]'
              }`}
            />
            {errors.name ? <InlineError id="cust-name-error" message={errors.name} /> : null}
          </div>

          <div>
            <label
              htmlFor="cust-phone"
              className="block text-xs font-semibold text-[#1A1A2E] mb-1"
            >
              Primary Phone *
            </label>
            <input
              id="cust-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/[^\d\s+()-]/g, ''))}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'cust-phone-error' : undefined}
              className={`w-full min-h-[48px] px-3.5 rounded-[12px] border bg-white text-base font-utility text-[#191C1D] focus:outline-none ${
                errors.phone ? 'border-[#DC2626]' : 'border-[#E2E8F0] focus:border-[#1A1A2E]'
              }`}
            />
            {errors.phone ? <InlineError id="cust-phone-error" message={errors.phone} /> : null}
          </div>

          <div>
            <label htmlFor="cust-alt" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Alternate Phone
            </label>
            <input
              id="cust-alt"
              type="tel"
              inputMode="numeric"
              value={alternatePhone}
              onChange={(event) => setAlternatePhone(event.target.value.replace(/[^\d\s+()-]/g, ''))}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base font-utility text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label htmlFor="cust-email" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Email
            </label>
            <input
              id="cust-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label htmlFor="cust-firm" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Firm / Company
            </label>
            <input
              id="cust-firm"
              type="text"
              value={firmName}
              onChange={(event) => setFirmName(event.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label
              htmlFor="cust-address"
              className="block text-xs font-semibold text-[#1A1A2E] mb-1"
            >
              Site / Delivery Address *
            </label>
            <input
              id="cust-address"
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              aria-invalid={Boolean(errors.address)}
              aria-describedby={errors.address ? 'cust-address-error' : undefined}
              className={`w-full min-h-[48px] px-3.5 rounded-[12px] border bg-white text-base text-[#191C1D] focus:outline-none ${
                errors.address ? 'border-[#DC2626]' : 'border-[#E2E8F0] focus:border-[#1A1A2E]'
              }`}
            />
            {errors.address ? (
              <InlineError id="cust-address-error" message={errors.address} />
            ) : null}
          </div>

          <div>
            <label htmlFor="cust-city" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              City
            </label>
            <input
              id="cust-city"
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label htmlFor="cust-plus" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Plus Code
            </label>
            <input
              id="cust-plus"
              type="text"
              value={plusCode}
              onChange={(event) => setPlusCode(event.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label htmlFor="cust-notes" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Notes
            </label>
            <textarea
              id="cust-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full p-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-[#1A1A2E] mb-2">Material Interests</div>
            <div className="flex flex-wrap gap-2">
              {materialOptions.map((option) => {
                const selected = materialInterests.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setMaterialInterests((previous) =>
                        previous.includes(option.value)
                          ? previous.filter((value) => value !== option.value)
                          : [...previous, option.value],
                      )
                    }
                    className={`min-h-[44px] px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                      selected
                        ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                        : 'bg-white text-[#1A1A2E] border-[#E2E8F0]'
                    }`}
                  >
                    {selected ? <Check className="w-3.5 h-3.5 text-[#C9A84C]" /> : null}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Encrypted Customer Vault — strictly gated on the RPC permission. */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-3.5">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#1A1A2E]" />
            <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#1A1A2E]">
              Encrypted Customer Vault
            </h2>
          </div>

          {vaultAccess === 'loading' ? (
            /* Never flash the restriction notice at an admin while the
               permission RPC is still resolving. */
            <div className="py-6 text-center">
              <Loader2 className="w-5 h-5 mx-auto text-[#47464C] animate-spin" />
              <p className="mt-2 text-xs text-[#47464C]">Checking vault access…</p>
            </div>
          ) : canUploadAttachments(vaultAccess) ? (
            <>
              <div className="p-3.5 rounded-[12px] bg-[#EEF2F6] border border-[#E2E8F0] flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-[#1A1A2E] shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-[#1A1A2E] leading-relaxed">
                  {vaultAccess === 'manage'
                    ? 'These documents are encrypted at rest. You have vault permission, so you can upload, preview and download them.'
                    : 'These documents are encrypted at rest. You can upload a file, but only an administrator can list, preview or download the customer’s documents.'}
                </p>
              </div>

              {fileError ? <InlineError id="cust-vault-error" message={fileError} /> : null}

              <SecureAttachmentUploader
                mode="immediate"
                customerId={customer.id}
                onUploaded={() => {
                  void refetchVault();
                }}
              />

              {vaultAccess === 'manage' ? (
              <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                <div className="font-utility text-[11px] font-bold uppercase text-[#47464C]">
                  Secured files ({vaultFiles.length})
                </div>
                {vaultLoading ? (
                  <div className="py-3 text-center">
                    <Loader2 className="w-4 h-4 mx-auto text-[#47464C] animate-spin" />
                    <p className="mt-1.5 text-xs text-[#47464C]">Loading vault…</p>
                  </div>
                ) : vaultFiles.length === 0 ? (
                  <p className="text-xs text-[#47464C]">The vault is currently empty.</p>
                ) : (
                  vaultFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-2.5 rounded-[10px] bg-[#F8F9FA] border border-[#E2E8F0] flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Lock className="w-4 h-4 text-[#059669] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#1A1A2E] truncate">
                            {file.file_name}
                          </div>
                          <div className="font-utility text-[11px] text-[#47464C] truncate">
                            {formatFileSize(file.file_size)} · {file.uploaded_by_name || 'Staff'} ·{' '}
                            {formatShortDateTime(file.created_at)}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void handleVaultDownload(file.id, file.file_name);
                        }}
                        aria-label={`Download ${file.file_name}`}
                        className="min-h-[44px] min-w-[44px] rounded-[10px] bg-[#EEF2F6] text-[#1A1A2E] flex items-center justify-center shrink-0"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 w-full z-50 bg-white border-t border-[#E2E8F0] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] rounded-[12px] border-[1.5px] border-[#E2E8F0] bg-white text-[#1A1A2E] font-semibold text-base"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={saving}
          className="min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base shadow-[0_10px_20px_-3px_rgba(201,168,76,0.35)] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          <span>{saving ? 'Saving…' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Screen 10b — MobileProfessionalEditForm                                     */
/* -------------------------------------------------------------------------- */

export const MobileProfessionalEditForm: React.FC<{
  professionalId: string;
  onCancel: () => void;
  onSaved: () => void;
}> = ({ professionalId, onCancel, onSaved }) => {
  const { professionals, loading, updateProfessional } = useProfessionals();
  const { getFieldOptions } = useMobileControlPanel();
  const { profile } = useAuth();
  const { options: staffOptions } = useActiveStaffOptions();

  const professional = useMemo(
    () => professionals.find((item) => item.id === professionalId) ?? null,
    [professionals, professionalId],
  );

  const [fullName, setFullName] = useState('');
  const [professionalType, setProfessionalType] = useState('');
  const [firmName, setFirmName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');
  const [city, setCity] = useState('');
  const [plusCode, setPlusCode] = useState('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const initializedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!professional) return;
    if (initializedIdRef.current === professional.id) return;
    initializedIdRef.current = professional.id;
    setFullName(professional.name ?? '');
    setProfessionalType(professional.professional_type ?? '');
    setFirmName(professional.firm_name ?? '');
    setPhone(professional.phone ?? '');
    setAlternatePhone(professional.alternate_phone ?? '');
    setEmail(professional.email ?? '');
    setOfficeLocation(professional.address ?? '');
    setCity(professional.city ?? '');
    setPlusCode(professional.site_plus_code ?? '');
    setNotes(professional.notes ?? '');
  }, [professional]);

  const typeOptions = useMemo(
    () => getFieldOptions('professionals', 'professional_type'),
    [getFieldOptions],
  );

  const staffCandidate = useMemo(() => {
    const match = staffOptions.find((option) => option.id === profile?.id);
    return match?.name ?? null;
  }, [staffOptions, profile?.id]);

  const handleSave = useCallback(async () => {
    const nextErrors: FormErrors = {};
    if (!fullName.trim()) {
      nextErrors.name = 'Name is required.';
    }
    const phone10 = normalizePhone10(phone);
    if (!phone10) {
      nextErrors.phone = 'Enter a valid 10-digit phone number (it must start with 6, 7, 8 or 9).';
    }
    if (!officeLocation.trim()) {
      nextErrors.address = 'Office / business address is required.';
    }
    // The professional type drives every downstream filter, so it is
    // required — the error is shown inline instead of being ignored.
    if (!professionalType.trim()) {
      nextErrors.professionalType = 'Select a professional type.';
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      // The reason is always visible inline — never a silent no-op.
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const staffName = resolveSafeStaffName(staffCandidate, profile?.full_name) ?? 'System';
      const assignedTo = isSafeStaffName(professional?.assigned_to)
        ? (professional?.assigned_to as string)
        : staffName;
      const alternate10 = normalizePhone10(alternatePhone);

      const payload = toProfessionalInsert(
        {
          full_name: fullName,
          phone: phone10 ?? phone,
          alternate_phone: alternate10,
          email: email.trim() || null,
          professional_type: professionalType,
          firm_name: firmName.trim() || null,
          office_location: officeLocation.trim(),
          city: city.trim() || null,
          plus_code: plusCode.trim() || null,
          notes: notes.trim() || null,
        },
        staffName,
        // INVARIANT-04 — `created_by` / `updated_by` record the signed-in
        // actor, `assigned_to` the assignee.
        resolveSafeStaffName(profile?.full_name ?? null, profile?.full_name ?? null) ?? 'System',
      );

      await updateProfessional(professionalId, {
        ...payload,
        // An edit must never rewrite the original creator or the assignee.
        created_by: undefined,
        assigned_to: assignedTo,
      });
      onSaved();
    } catch {
      setSaveError('The professional could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [
    fullName,
    phone,
    alternatePhone,
    email,
    professionalType,
    firmName,
    officeLocation,
    city,
    plusCode,
    notes,
    professional,
    professionalId,
    staffCandidate,
    profile?.full_name,
    updateProfessional,
    onSaved,
  ]);

  if (loading && !professional) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col">
        <SubHeader title="Edit Professional" onBack={onCancel} />
        <div className="p-6 text-center">
          <Loader2 className="w-5 h-5 mx-auto text-[#47464C] animate-spin" />
          <p className="mt-2 text-sm font-bold text-[#1A1A2E]">Loading professional…</p>
        </div>
      </div>
    );
  }

  if (!professional) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col">
        <SubHeader title="Professional Not Found" onBack={onCancel} />
        <div className="p-6 text-center space-y-3">
          <p className="text-sm text-[#47464C]">
            This professional may have been removed. Go back and pick another record.
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] px-5 rounded-[12px] bg-[#1A1A2E] text-white font-semibold text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA] flex flex-col pb-[env(safe-area-inset-bottom)]">
      <SubHeader
        title="Edit Professional"
        subtitle={professional.firm_name || professional.name || 'Professional'}
        onBack={onCancel}
      />

      <div className="flex-1 p-4 pb-28 space-y-4">
        {hasErrors ? (
          <div
            role="alert"
            className="p-3 rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-xs font-semibold flex items-start gap-1.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>Some details are missing. Please fix the highlighted fields below.</span>
          </div>
        ) : null}

        {saveError ? <InlineError id="professional-save-error" message={saveError} /> : null}

        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-3.5">
          <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C]">
            Professional Details
          </h2>

          <div>
            <label htmlFor="pro-name" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Full Name *
            </label>
            <input
              id="pro-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'pro-name-error' : undefined}
              className={`w-full min-h-[48px] px-3.5 rounded-[12px] border bg-white text-base text-[#191C1D] focus:outline-none ${
                errors.name ? 'border-[#DC2626]' : 'border-[#E2E8F0] focus:border-[#1A1A2E]'
              }`}
            />
            {errors.name ? <InlineError id="pro-name-error" message={errors.name} /> : null}
          </div>

          <div>
            <label htmlFor="pro-type" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Professional Type *
            </label>
            <select
              id="pro-type"
              value={professionalType}
              onChange={(event) => setProfessionalType(event.target.value)}
              aria-invalid={Boolean(errors.professionalType)}
              aria-describedby={errors.professionalType ? 'pro-type-error' : undefined}
              className={`w-full min-h-[48px] px-3 rounded-[12px] border bg-white text-base text-[#191C1D] focus:outline-none ${
                errors.professionalType
                  ? 'border-[#DC2626]'
                  : 'border-[#E2E8F0] focus:border-[#1A1A2E]'
              }`}
            >
              <option value="">Select a type</option>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.professionalType ? (
              <InlineError id="pro-type-error" message={errors.professionalType} />
            ) : null}
          </div>

          <div>
            <label htmlFor="pro-firm" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Firm / Practice Name
            </label>
            <input
              id="pro-firm"
              type="text"
              value={firmName}
              onChange={(event) => setFirmName(event.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label htmlFor="pro-phone" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Primary Phone *
            </label>
            <input
              id="pro-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/[^\d\s+()-]/g, ''))}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'pro-phone-error' : undefined}
              className={`w-full min-h-[48px] px-3.5 rounded-[12px] border bg-white text-base font-utility text-[#191C1D] focus:outline-none ${
                errors.phone ? 'border-[#DC2626]' : 'border-[#E2E8F0] focus:border-[#1A1A2E]'
              }`}
            />
            {errors.phone ? <InlineError id="pro-phone-error" message={errors.phone} /> : null}
          </div>

          <div>
            <label htmlFor="pro-alt" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Alternate Phone
            </label>
            <input
              id="pro-alt"
              type="tel"
              inputMode="numeric"
              value={alternatePhone}
              onChange={(event) => setAlternatePhone(event.target.value.replace(/[^\d\s+()-]/g, ''))}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base font-utility text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label htmlFor="pro-email" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Email
            </label>
            <input
              id="pro-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label
              htmlFor="pro-office"
              className="block text-xs font-semibold text-[#1A1A2E] mb-1"
            >
              Office / Business Address *
            </label>
            <input
              id="pro-office"
              type="text"
              value={officeLocation}
              onChange={(event) => setOfficeLocation(event.target.value)}
              aria-invalid={Boolean(errors.address)}
              aria-describedby={errors.address ? 'pro-office-error' : undefined}
              className={`w-full min-h-[48px] px-3.5 rounded-[12px] border bg-white text-base text-[#191C1D] focus:outline-none ${
                errors.address ? 'border-[#DC2626]' : 'border-[#E2E8F0] focus:border-[#1A1A2E]'
              }`}
            />
            {errors.address ? (
              <InlineError id="pro-office-error" message={errors.address} />
            ) : null}
          </div>

          <div>
            <label htmlFor="pro-city" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              City
            </label>
            <input
              id="pro-city"
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label htmlFor="pro-plus" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Plus Code
            </label>
            <input
              id="pro-plus"
              type="text"
              value={plusCode}
              onChange={(event) => setPlusCode(event.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>

          <div>
            <label htmlFor="pro-notes" className="block text-xs font-semibold text-[#1A1A2E] mb-1">
              Notes
            </label>
            <textarea
              id="pro-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full p-3 rounded-[12px] border border-[#E2E8F0] bg-white text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
          </div>
        </section>

        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#1A1A2E]" />
            <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#1A1A2E]">
              Professional Profile
            </h2>
          </div>
          <DetailRow label="Status" value={humanizeToken(professional.status) || '—'} />
          <DetailRow label="Assigned to" value={professional.assigned_to || '—'} />
          <DetailRow
            label="Last updated"
            value={professional.updated_at ? formatShortDateTime(professional.updated_at) : '—'}
          />
          <p className="pt-1 text-xs text-[#47464C] leading-relaxed">
            Project drawings and site photos live on the linked Lead and Customer records.
          </p>
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 w-full z-50 bg-white border-t border-[#E2E8F0] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] rounded-[12px] border-[1.5px] border-[#E2E8F0] bg-white text-[#1A1A2E] font-semibold text-base"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={saving}
          className="min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base shadow-[0_10px_20px_-3px_rgba(201,168,76,0.35)] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          <span>{saving ? 'Saving…' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
};
