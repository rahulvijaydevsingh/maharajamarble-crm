import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Edit, 
  MoreHorizontal, 
  Phone, 
  Search, 
  Settings,
  Download,
  Calendar as CalendarIcon,
  Clock,
  Filter,
  Plus,
  FileText,
  UserPlus,
  List,
  LayoutGrid,
  Loader2,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Users,
  Tag,
  CheckCircle,
  Save,
  X,
  SlidersHorizontal,
  Eye,
  RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
// EditLeadDialog removed - now using LeadDetailView with EditSmartLeadForm
import { ViewHistoryDialog } from "./actions/ViewHistoryDialog";
import { AddToCustomerDialog } from "./actions/AddToCustomerDialog";
import { LeadKanbanView } from "./LeadKanbanView";
import { LeadDetailView } from "./LeadDetailView";
import { LeadsTableContainer } from "./LeadsTableContainer";
import { SavedFilterDialog } from "./filters/SavedFilterDialog";
import { ManageFiltersDialog } from "./filters/ManageFiltersDialog";
import { AddTaskDialog } from "@/components/tasks/AddTaskDialog";
import { AddQuotationDialog } from "@/components/quotations/AddQuotationDialog";
import { Lead, useLeads } from "@/hooks/useLeads";
import { usePendingTasksByLead, LeadPendingTasks } from "@/hooks/usePendingTasksByLead";
import { useSavedFilters, SavedFilter, FilterConfig } from "@/hooks/useSavedFilters";
import { useTablePreferences } from "@/hooks/useTablePreferences";
import { useToast } from "@/hooks/use-toast";
import { useCustomers } from "@/hooks/useCustomers";
import { usePermissions } from "@/hooks/usePermissions";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { ColumnManagerDialog } from "@/components/shared/ColumnManagerDialog";
import { ScrollableTableContainer } from "@/components/shared/ScrollableTableContainer";

const COLUMN_VISIBILITY_KEY = "leads_column_visibility";

const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  name: true,
  phone: true,
  email: true,
  address: false,
  source: true,
  assignedTo: true,
  status: true,
  priority: true,
  createdDate: true,
  createdBy: true,
  lastFollowUp: true,
  nextFollowUp: true,
  materials: true,
  notes: false,
  constructionStage: false,
  estimatedQty: false,
  designation: false,
  pendingTasks: true,
};

interface ColumnVisibility {
  name: boolean;
  phone: boolean;
  email: boolean;
  address: boolean;
  source: boolean;
  assignedTo: boolean;
  status: boolean;
  priority: boolean;
  createdDate: boolean;
  createdBy: boolean;
  lastFollowUp: boolean;
  nextFollowUp: boolean;
  materials: boolean;
  notes: boolean;
  constructionStage: boolean;
  estimatedQty: boolean;
  designation: boolean;
  pendingTasks: boolean;
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

type SortDirection = "asc" | "desc" | null;
type SortField = "name" | "phone" | "email" | "status" | "priority" | "assigned_to" | "created_at" | "next_follow_up" | "last_follow_up" | "created_by" | null;

// Constants for statuses and priorities
const statuses: Record<string, { label: string; className: string }> = {
  'new': { label: 'New', className: 'bg-blue-50 text-blue-600 hover:bg-blue-50' },
  'in-progress': { label: 'In Progress', className: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-50' },
  'quoted': { label: 'Quoted', className: 'bg-purple-50 text-purple-600 hover:bg-purple-50' },
  'won': { label: 'Won', className: 'bg-green-50 text-green-600 hover:bg-green-50' },
  'lost': { label: 'Lost', className: 'bg-red-50 text-red-600 hover:bg-red-50' }
};

const priorities = {
  1: { label: 'Very High', color: 'text-red-600' },
  2: { label: 'High', color: 'text-orange-600' },
  3: { label: 'Medium', color: 'text-yellow-600' },
  4: { label: 'Low', color: 'text-blue-600' },
  5: { label: 'Very Low', color: 'text-gray-600' }
};

type UserRole = "Admin" | "Manager" | "Sales";

interface EnhancedLeadTableProps {
  onEditLead: (lead: Lead) => void;
}

export function EnhancedLeadTable({ onEditLead }: EnhancedLeadTableProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { leads, loading, updateLead, deleteLead, refetch } = useLeads();
  const { getLeadTasks, refetch: refetchTasks } = usePendingTasksByLead();
  const { filters: savedFilters, addFilter, updateFilter, deleteFilter: removeSavedFilter } = useSavedFilters("leads");
  const { 
    columns, 
    visibleColumns, 
    saving: savingPrefs, 
    savePreferences, 
    resetToDefaults 
  } = useTablePreferences("leads");
  const { addCustomer } = useCustomers();
  const { toast } = useToast();
  const { canEdit, canDelete, canBulkAction, hasPermission } = usePermissions();
  const { staffMembers } = useActiveStaff();
  
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    return (sessionStorage.getItem("leadViewMode") as "list" | "kanban") || "list";
  });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [assignedToFilter, setAssignedToFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [materialsFilter, setMaterialsFilter] = useState<string[]>([]);
  const [createdByFilter, setCreatedByFilter] = useState<string[]>([]);
  const [createdDateRange, setCreatedDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [lastFollowUpRange, setLastFollowUpRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [nextFollowUpRange, setNextFollowUpRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  // Active saved filter
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  
  // Filter dialogs
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [manageFiltersDialogOpen, setManageFiltersDialogOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);
  
  // Bulk action dialog
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<string>("");
  const [bulkActionValue, setBulkActionValue] = useState("");
  
  // Pending tasks popover
  const [tasksPopoverLeadId, setTasksPopoverLeadId] = useState<string | null>(null);
  
  // Load column visibility from localStorage
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY);
      if (saved) {
        return { ...DEFAULT_COLUMN_VISIBILITY, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error("Error loading column visibility:", e);
    }
    return DEFAULT_COLUMN_VISIBILITY;
  });

  // Dialog states
  // editDialogOpen removed - now using LeadDetailView with edit mode
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [detailViewOpen, setDetailViewOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const currentUserRole: UserRole = "Admin" as UserRole;

  // Save column visibility to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(columnVisibility));
    } catch (e) {
      console.error("Error saving column visibility:", e);
    }
  }, [columnVisibility]);

  // Apply default filter on load
  useEffect(() => {
    const defaultFilter = savedFilters.find(f => f.is_default);
    if (defaultFilter && !activeFilterId) {
      applyFilter(defaultFilter);
    }
  }, [savedFilters]);

  // Handle ?view= URL parameter to open lead detail view
  useEffect(() => {
    const viewLeadId = searchParams.get('view');
    if (viewLeadId && leads.length > 0) {
      const leadToView = leads.find(l => l.id === viewLeadId);
      if (leadToView) {
        setSelectedLead(leadToView);
        setDetailViewOpen(true);
        // Clear the URL parameter
        searchParams.delete('view');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, leads, setSearchParams]);

  // Reset column visibility to defaults
  const resetColumnVisibility = useCallback(() => {
    setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
    toast({ title: "Column settings reset to defaults" });
  }, [toast]);

  // Get unique values for filters
  const uniqueSources = useMemo(() => 
    Array.from(new Set(leads.map(lead => lead.source))), [leads]);
  const uniqueAssignedTo = useMemo(() => 
    Array.from(new Set(leads.map(lead => lead.assigned_to))), [leads]);
  const uniqueMaterials = useMemo(() => 
    Array.from(new Set(leads.flatMap(lead => (lead.material_interests as string[]) || []))), [leads]);
  const uniqueCreatedBy = useMemo(() => 
    Array.from(new Set(leads.map(lead => lead.created_by).filter(Boolean))), [leads]);

  // Filter and sort leads
  const filteredLeads = useMemo(() => {
    let result = leads.filter(lead => {
      const searchMatch = searchTerm.length < 2 || 
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone.includes(searchTerm) ||
        (lead.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.notes || "").toLowerCase().includes(searchTerm.toLowerCase());

      const statusMatch = statusFilter.length === 0 || statusFilter.includes(lead.status);
      const assignedMatch = assignedToFilter.length === 0 || assignedToFilter.includes(lead.assigned_to);
      const sourceMatch = sourceFilter.length === 0 || sourceFilter.includes(lead.source);
      const priorityMatch = priorityFilter.length === 0 || priorityFilter.includes(lead.priority.toString());
      const materialsMatch = materialsFilter.length === 0 || materialsFilter.some(material => 
        ((lead.material_interests as string[]) || []).includes(material)
      );

      const createdByMatch = createdByFilter.length === 0 || createdByFilter.includes(lead.created_by);

      const createdDateMatch = !createdDateRange.from || !createdDateRange.to || 
        (new Date(lead.created_at) >= createdDateRange.from && new Date(lead.created_at) <= createdDateRange.to);

      const lastFollowUpMatch = !lastFollowUpRange.from || !lastFollowUpRange.to || !lead.last_follow_up ||
        (new Date(lead.last_follow_up) >= lastFollowUpRange.from && new Date(lead.last_follow_up) <= lastFollowUpRange.to);

      const nextFollowUpMatch = !nextFollowUpRange.from || !nextFollowUpRange.to || !lead.next_follow_up ||
        (new Date(lead.next_follow_up) >= nextFollowUpRange.from && new Date(lead.next_follow_up) <= nextFollowUpRange.to);

      return searchMatch && statusMatch && assignedMatch && sourceMatch && priorityMatch && 
             materialsMatch && createdByMatch && createdDateMatch && lastFollowUpMatch && nextFollowUpMatch;
    });

    // Apply sorting
    if (sortField && sortDirection) {
      result = [...result].sort((a, b) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];
        
        if (aVal === null || aVal === undefined) aVal = "";
        if (bVal === null || bVal === undefined) bVal = "";
        
        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();
        
        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [leads, searchTerm, statusFilter, assignedToFilter, sourceFilter, priorityFilter, 
      materialsFilter, createdDateRange, lastFollowUpRange, nextFollowUpRange, sortField, sortDirection]);

  // Filter counts for saved filters
  const getFilterCount = (filter: SavedFilter): number => {
    const config = filter.filter_config;
    return leads.filter(lead => {
      const statusMatch = config.statusFilter.length === 0 || config.statusFilter.includes(lead.status);
      const assignedMatch = config.assignedToFilter.length === 0 || config.assignedToFilter.includes(lead.assigned_to);
      const sourceMatch = config.sourceFilter.length === 0 || config.sourceFilter.includes(lead.source);
      const priorityMatch = config.priorityFilter.length === 0 || config.priorityFilter.includes(lead.priority.toString());
      const materialsMatch = config.materialsFilter.length === 0 || config.materialsFilter.some(material => 
        ((lead.material_interests as string[]) || []).includes(material)
      );
      return statusMatch && assignedMatch && sourceMatch && priorityMatch && materialsMatch;
    }).length;
  };

  const handleViewModeChange = (mode: "list" | "kanban") => {
    setViewMode(mode);
    sessionStorage.setItem("leadViewMode", mode);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedLeads(checked ? filteredLeads.map(lead => lead.id) : []);
  };

  const handleSelectLead = (leadId: string, checked: boolean) => {
    setSelectedLeads(prev => 
      checked ? [...prev, leadId] : prev.filter(id => id !== leadId)
    );
  };

  const toggleColumnVisibility = (column: keyof ColumnVisibility) => {
    setColumnVisibility(prev => ({ ...prev, [column]: !prev[column] }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchTasks()]);
    setRefreshing(false);
    toast({ title: "Data refreshed" });
  };

  const handleExport = async (format: 'excel' | 'csv' | 'pdf') => {
    const { exportLeads } = await import("@/lib/exportLeads");
    const leadsToExport = selectedLeads.length > 0 
      ? filteredLeads.filter(l => selectedLeads.includes(l.id))
      : filteredLeads;
    
    try {
      const taskData: { [leadId: string]: { total: number; overdue: number; pending: number } } = {};
      leadsToExport.forEach(lead => {
        const info = getLeadTasks(lead.id);
        taskData[lead.id] = { total: info.total, overdue: info.overdue, pending: info.upcoming };
      });

      const result = exportLeads(leadsToExport, {
        scope: selectedLeads.length > 0 ? 'selected' : 'filtered',
        format,
        columns: ['name', 'phone', 'email', 'status', 'assignedTo', 'source', 'address', 'priority', 'nextFollowUp', 'createdDate', 'materials', 'designation', 'firmName', 'notes'],
        includeTaskStatus: true,
        includeLastFollowUp: true,
        includeTimestamp: true,
      }, taskData);

      toast({ 
        title: "Export Complete", 
        description: `Exported ${result.rowCount} leads as ${format.toUpperCase()}` 
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleLeadUpdate = async (id: string, updates: Partial<Lead>) => {
    try {
      await updateLead(id, updates as any);
    } catch (error) {
      console.error("Failed to update lead:", error);
    }
  };

  const applyFilter = (filter: SavedFilter) => {
    const config = filter.filter_config;
    setStatusFilter(config.statusFilter || []);
    setAssignedToFilter(config.assignedToFilter || []);
    setSourceFilter(config.sourceFilter || []);
    setPriorityFilter(config.priorityFilter || []);
    setMaterialsFilter(config.materialsFilter || []);
    setCreatedDateRange({
      from: config.createdDateRange?.from ? new Date(config.createdDateRange.from) : undefined,
      to: config.createdDateRange?.to ? new Date(config.createdDateRange.to) : undefined,
    });
    setLastFollowUpRange({
      from: config.lastFollowUpRange?.from ? new Date(config.lastFollowUpRange.from) : undefined,
      to: config.lastFollowUpRange?.to ? new Date(config.lastFollowUpRange.to) : undefined,
    });
    setNextFollowUpRange({
      from: config.nextFollowUpRange?.from ? new Date(config.nextFollowUpRange.from) : undefined,
      to: config.nextFollowUpRange?.to ? new Date(config.nextFollowUpRange.to) : undefined,
    });
    setActiveFilterId(filter.id);
  };

  const clearFilters = () => {
    setStatusFilter([]);
    setAssignedToFilter([]);
    setSourceFilter([]);
    setPriorityFilter([]);
    setMaterialsFilter([]);
    setCreatedDateRange({ from: undefined, to: undefined });
    setLastFollowUpRange({ from: undefined, to: undefined });
    setNextFollowUpRange({ from: undefined, to: undefined });
    setActiveFilterId(null);
  };

  const handleEditFilter = (filter: SavedFilter) => {
    setEditingFilter(filter);
    setFilterDialogOpen(true);
  };

  const handleDeleteFilter = async (id: string) => {
    await removeSavedFilter(id);
    if (activeFilterId === id) {
      clearFilters();
    }
  };

  // Bulk actions
  const handleBulkAction = async () => {
    if (!bulkActionType || selectedLeads.length === 0) return;

    try {
      let successCount = 0;
      for (const leadId of selectedLeads) {
        const lead = leads.find(l => l.id === leadId);
        if (!lead) continue;
        
        if (bulkActionType === "convert_customer") {
          await addCustomer({
            name: lead.name,
            phone: lead.phone,
            alternate_phone: lead.alternate_phone,
            email: lead.email,
            company_name: lead.firm_name,
            address: lead.address || lead.site_location,
            assigned_to: lead.assigned_to,
            source: lead.source,
            lead_id: lead.id,
            notes: lead.notes,
            customer_type: "individual",
            status: "active",
            priority: lead.priority,
          });
          await updateLead(leadId, { status: "won" });
          successCount++;
        } else if (bulkActionType === "status") {
          await updateLead(leadId, { status: bulkActionValue });
        } else if (bulkActionType === "priority") {
          await updateLead(leadId, { priority: parseInt(bulkActionValue) });
        } else if (bulkActionType === "assigned_to") {
          await updateLead(leadId, { assigned_to: bulkActionValue });
        } else if (bulkActionType === "delete") {
          await deleteLead(leadId);
        }
      }
      
      if (bulkActionType === "convert_customer") {
        toast({ title: `Converted ${successCount} leads to customers` });
      } else {
        toast({ title: `Updated ${selectedLeads.length} leads` });
      }
      setSelectedLeads([]);
      setBulkActionDialogOpen(false);
      setBulkActionType("");
      setBulkActionValue("");
    } catch (error) {
      toast({ title: "Error performing bulk action", variant: "destructive" });
    }
  };

  const handleEditLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailViewOpen(true);
    // The edit mode will be triggered from within LeadDetailView
    setTimeout(() => {
      // Trigger edit mode after dialog opens
      const event = new CustomEvent('triggerLeadEdit', { detail: { leadId: lead.id } });
      window.dispatchEvent(event);
    }, 100);
  };

  const handleAddFollowUp = (lead: Lead) => {
    setSelectedLead(lead);
    setFollowUpDialogOpen(true);
  };

  const handleViewHistory = (lead: Lead) => {
    setSelectedLead(lead);
    setHistoryDialogOpen(true);
  };

  const handleCreateQuotation = (lead: Lead) => {
    setSelectedLead(lead);
    setQuotationDialogOpen(true);
  };

  const handleAddToCustomer = (lead: Lead) => {
    setSelectedLead(lead);
    setCustomerDialogOpen(true);
  };

  const handleViewLead = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailViewOpen(true);
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <div 
      className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field ? (
        sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </div>
  );

  const PendingTasksBadge = ({ leadId, leadName }: { leadId: string; leadName: string }) => {
    const taskInfo = getLeadTasks(leadId);
    
    if (taskInfo.total === 0) {
      return <span className="text-muted-foreground text-sm">-</span>;
    }

    const handleNavigateToTasks = () => {
      navigate(`/tasks?related_to_type=lead&related_to_id=${leadId}&related_to_name=${encodeURIComponent(leadName)}`);
    };

    // Determine badge styling based on urgency
    const getStyles = () => {
      if (taskInfo.overdue > 0) {
        return {
          bg: "bg-red-500",
          hover: "hover:bg-red-600",
          text: "text-white",
        };
      }
      if (taskInfo.dueToday > 0) {
        return {
          bg: "bg-amber-500",
          hover: "hover:bg-amber-600", 
          text: "text-white",
        };
      }
      return {
        bg: "bg-emerald-500",
        hover: "hover:bg-emerald-600",
        text: "text-white",
      };
    };

    const styles = getStyles();
    
    // Build tooltip text
    const tooltipParts = [];
    if (taskInfo.overdue > 0) tooltipParts.push(`${taskInfo.overdue} overdue`);
    if (taskInfo.dueToday > 0) tooltipParts.push(`${taskInfo.dueToday} due today`);
    if (taskInfo.upcoming > 0) tooltipParts.push(`${taskInfo.upcoming} upcoming`);
    const tooltipText = `${taskInfo.total} task${taskInfo.total > 1 ? 's' : ''}: ${tooltipParts.join(', ')}. Click to view.`;

    return (
      <Badge 
        className={cn(
          "cursor-pointer transition-all font-semibold min-w-[28px] justify-center",
          styles.bg, styles.hover, styles.text
        )}
        title={tooltipText}
        onClick={handleNavigateToTasks}
      >
        {taskInfo.total}
      </Badge>
    );
  };

  const MultiSelectFilter = ({ 
    options, 
    selected, 
    onSelectionChange, 
    placeholder 
  }: { 
    options: string[]; 
    selected: string[]; 
    onSelectionChange: (values: string[]) => void; 
    placeholder: string; 
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2">
          <Filter className="h-3 w-3" />
          {selected.length > 0 && (
            <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1 rounded">
              {selected.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>{placeholder}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={selected.includes(option)}
            onCheckedChange={(checked) => {
              onSelectionChange(checked ? [...selected, option] : selected.filter(s => s !== option));
            }}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSelectionChange([])}>Clear All</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const DateRangeFilter = ({ 
    dateRange, 
    onDateRangeChange 
  }: { 
    dateRange: DateRange; 
    onDateRangeChange: (range: DateRange) => void; 
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2">
          <CalendarIcon className="h-3 w-3" />
          {(dateRange.from || dateRange.to) && (
            <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1 rounded">1</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 space-y-2">
          <div className="text-sm font-medium">Date Range</div>
          <div className="flex space-x-2">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    {dateRange.from ? format(dateRange.from, "MMM dd") : "Start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => onDateRangeChange({ ...dateRange, from: date })}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    {dateRange.to ? format(dateRange.to, "MMM dd") : "End date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => onDateRangeChange({ ...dateRange, to: date })}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {(dateRange.from || dateRange.to) && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onDateRangeChange({ from: undefined, to: undefined })}
              className="w-full"
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Saved Filters Quick Access */}
      {savedFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {savedFilters.map((filter) => (
            <Button
              key={filter.id}
              variant={activeFilterId === filter.id ? "default" : "outline"}
              size="sm"
              onClick={() => applyFilter(filter)}
              className="gap-1"
            >
              <span className="font-semibold">{getFilterCount(filter)}</span>
              <span>{filter.name}</span>
            </Button>
          ))}
          {activeFilterId && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Search and Controls */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search leads by name, phone, email, address, notes..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          {/* Bulk Actions - only show if user has bulk action permission */}
          {selectedLeads.length > 0 && canBulkAction("leads") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Bulk Actions ({selectedLeads.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hasPermission("leads.convert") && (
                  <DropdownMenuItem onClick={() => { setBulkActionType("convert_customer"); setBulkActionDialogOpen(true); }}>
                    <UserPlus className="mr-2 h-4 w-4" />Convert to Customer
                  </DropdownMenuItem>
                )}
                {canEdit("leads") && (
                  <>
                    <DropdownMenuItem onClick={() => { setBulkActionType("assigned_to"); setBulkActionDialogOpen(true); }}>
                      <Users className="mr-2 h-4 w-4" />Assign To
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setBulkActionType("status"); setBulkActionDialogOpen(true); }}>
                      <Tag className="mr-2 h-4 w-4" />Change Status
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setBulkActionType("priority"); setBulkActionDialogOpen(true); }}>
                      <ArrowUpDown className="mr-2 h-4 w-4" />Change Priority
                    </DropdownMenuItem>
                  </>
                )}
                {canDelete("leads") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => { setBulkActionType("delete"); setBulkActionDialogOpen(true); }}
                      className="text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />Delete Selected
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Refresh Button */}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>

          {/* Filter Actions */}
          <Button variant="outline" size="sm" onClick={() => { setEditingFilter(null); setFilterDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Create Filter
          </Button>
          
          {savedFilters.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setManageFiltersDialogOpen(true)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Manage Filters
            </Button>
          )}

          {/* View Toggle */}
          <Tabs value={viewMode} onValueChange={(v) => handleViewModeChange(v as "list" | "kanban")}>
            <TabsList>
              <TabsTrigger value="list" className="px-3">
                <List className="h-4 w-4 mr-1" />
                List
              </TabsTrigger>
              <TabsTrigger value="kanban" className="px-3">
                <LayoutGrid className="h-4 w-4 mr-1" />
                Kanban
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Export Format</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport('excel')}>Export as Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('pdf')}>Export as PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setColumnManagerOpen(true)}
            title="Manage Columns"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredLeads.length} of {leads.length} leads
        {selectedLeads.length > 0 && ` (${selectedLeads.length} selected)`}
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" ? (
        <LeadKanbanView 
          leads={filteredLeads} 
          onLeadUpdate={handleLeadUpdate}
          onEditLead={handleEditLeadClick}
        />
      ) : (
        /* List View with sticky headers and independent scrolling */
        <LeadsTableContainer
          filteredLeads={filteredLeads}
          selectedLeads={selectedLeads}
          columnVisibility={columnVisibility}
          sortField={sortField}
          sortDirection={sortDirection}
          handleSelectAll={handleSelectAll}
          handleSelectLead={handleSelectLead}
          handleSort={handleSort}
          handleViewLead={handleViewLead}
          handleEditLeadClick={handleEditLeadClick}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          materialsFilter={materialsFilter}
          setMaterialsFilter={setMaterialsFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          assignedToFilter={assignedToFilter}
          setAssignedToFilter={setAssignedToFilter}
          createdByFilter={createdByFilter}
          setCreatedByFilter={setCreatedByFilter}
          createdDateRange={createdDateRange}
          setCreatedDateRange={setCreatedDateRange}
          lastFollowUpRange={lastFollowUpRange}
          setLastFollowUpRange={setLastFollowUpRange}
          nextFollowUpRange={nextFollowUpRange}
          setNextFollowUpRange={setNextFollowUpRange}
          uniqueSources={uniqueSources}
          uniqueMaterials={uniqueMaterials}
          uniqueAssignedTo={uniqueAssignedTo}
          uniqueCreatedBy={uniqueCreatedBy}
          statuses={statuses}
          priorities={priorities}
          SortableHeader={SortableHeader}
          MultiSelectFilter={MultiSelectFilter}
          DateRangeFilter={DateRangeFilter}
          PendingTasksBadge={PendingTasksBadge}
          canEdit={canEdit}
          hasPermission={hasPermission}
          handleAddFollowUp={handleAddFollowUp}
          handleViewHistory={handleViewHistory}
          handleCreateQuotation={handleCreateQuotation}
          handleAddToCustomer={handleAddToCustomer}
        />
      )}

      {/* Filter Dialogs */}
      <SavedFilterDialog
        open={filterDialogOpen}
        onOpenChange={(open) => {
          setFilterDialogOpen(open);
          if (!open) setEditingFilter(null);
        }}
        onSave={addFilter}
        onUpdate={updateFilter}
        editingFilter={editingFilter}
        uniqueSources={uniqueSources}
        uniqueAssignedTo={uniqueAssignedTo}
        uniqueMaterials={uniqueMaterials}
      />

      <ManageFiltersDialog
        open={manageFiltersDialogOpen}
        onOpenChange={setManageFiltersDialogOpen}
        filters={savedFilters}
        onEdit={handleEditFilter}
        onDelete={handleDeleteFilter}
        getFilterCount={getFilterCount}
      />

      {/* Bulk Action Dialog */}
      <Dialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkActionType === "delete" ? "Delete Leads" : 
               bulkActionType === "convert_customer" ? "Convert to Customers" : "Bulk Update"}
            </DialogTitle>
            <DialogDescription>
              {bulkActionType === "delete" 
                ? `Are you sure you want to delete ${selectedLeads.length} leads? This action cannot be undone.`
                : bulkActionType === "convert_customer"
                ? `Convert ${selectedLeads.length} selected leads to customers. Their status will be set to "Won".`
                : `Update ${selectedLeads.length} selected leads.`
              }
            </DialogDescription>
          </DialogHeader>
          {bulkActionType !== "delete" && bulkActionType !== "convert_customer" && (
            <div className="py-4">
              {bulkActionType === "status" && (
                <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statuses).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {bulkActionType === "priority" && (
                <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorities).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {bulkActionType === "assigned_to" && (
                <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers.map((staff) => (
                      <SelectItem key={staff.id} value={staff.name}>{staff.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkActionDialogOpen(false); setBulkActionType(""); setBulkActionValue(""); }}>
              Cancel
            </Button>
            <Button 
              variant={bulkActionType === "delete" ? "destructive" : "default"}
              onClick={handleBulkAction}
              disabled={bulkActionType !== "delete" && bulkActionType !== "convert_customer" && !bulkActionValue}
            >
              {bulkActionType === "delete" ? "Delete" : bulkActionType === "convert_customer" ? "Convert" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Components */}
      {selectedLead && (
        <>
          {/* New Task Dialog - replaces old AddFollowUpDialog */}
          <AddTaskDialog
            open={followUpDialogOpen}
            onOpenChange={setFollowUpDialogOpen}
            onTaskCreate={(taskData) => {
              console.log("Task created:", taskData);
              refetch();
            }}
            prefilledData={{
              relatedTo: {
                id: selectedLead.id,
                name: selectedLead.name,
                phone: selectedLead.phone,
                type: "lead"
              }
            }}
          />

          <ViewHistoryDialog
            open={historyDialogOpen}
            onOpenChange={setHistoryDialogOpen}
            leadData={{ id: selectedLead.id, name: selectedLead.name }}
          />

          {/* New Quotation Dialog - replaces old CreateQuotationDialog */}
          <AddQuotationDialog
            open={quotationDialogOpen}
            onOpenChange={setQuotationDialogOpen}
            prefillData={{
              client_name: selectedLead.name,
              client_phone: selectedLead.phone,
              client_email: selectedLead.email || undefined,
              client_address: selectedLead.address || selectedLead.site_location || undefined,
              client_id: selectedLead.id,
              client_type: 'lead'
            }}
          />

          <AddToCustomerDialog
            open={customerDialogOpen}
            onOpenChange={setCustomerDialogOpen}
            leadData={{ 
              id: selectedLead.id, 
              name: selectedLead.name,
              phone: selectedLead.phone,
              alternate_phone: selectedLead.alternate_phone || undefined,
              email: selectedLead.email || undefined,
              address: selectedLead.address || selectedLead.site_location || undefined,
              assigned_to: selectedLead.assigned_to,
              source: selectedLead.source,
              notes: selectedLead.notes || undefined,
            }}
            onConvert={(data) => console.log("Converting to customer:", data)}
          />

          <LeadDetailView
            lead={selectedLead}
            open={detailViewOpen}
            onOpenChange={setDetailViewOpen}
            onEdit={(lead) => {
              setDetailViewOpen(false);
              handleEditLeadClick(lead);
            }}
            onConvertToCustomer={(lead) => {
              setDetailViewOpen(false);
              handleAddToCustomer(lead);
            }}
            onDelete={(id) => {
              setDetailViewOpen(false);
              deleteLead(id);
            }}
          />
        </>
      )}
      
      <ColumnManagerDialog
        open={columnManagerOpen}
        onOpenChange={setColumnManagerOpen}
        columns={columns}
        onSave={savePreferences}
        onReset={resetToDefaults}
        saving={savingPrefs}
      />
    </div>
  );
}