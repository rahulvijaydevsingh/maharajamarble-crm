import React, { useState, useMemo } from "react";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { getStaffDisplayName } from "@/lib/kitHelpers";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator 
} from "@/components/ui/dropdown-menu";
import { Edit, MoreHorizontal, Phone, Search, Trash2, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Filter, Plus, SlidersHorizontal, Loader2, Settings, Upload, Calendar as CalendarIcon, CheckCircle, Users, Tag, ClipboardList, Download, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Professional, useProfessionals } from "@/hooks/useProfessionals";
import { usePendingTasksByProfessional } from "@/hooks/usePendingTasksByProfessional";
import { exportProfessionals } from "@/lib/exportProfessionals";
import { ExportProfessionalsDialog } from "./ExportProfessionalsDialog";
import { AddTaskDialog } from "@/components/tasks/AddTaskDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSavedFilters, SavedFilter } from "@/hooks/useSavedFilters";
import { useTablePreferences } from "@/hooks/useTablePreferences";
import { useToast } from "@/hooks/use-toast";
import { PROFESSIONAL_STATUSES, PRIORITIES } from "@/constants/professionalConstants";
import { ProfessionalSavedFilterDialog } from "./filters/ProfessionalSavedFilterDialog";
import { ProfessionalManageFiltersDialog } from "./filters/ProfessionalManageFiltersDialog";
import { ColumnManagerDialog } from "@/components/shared/ColumnManagerDialog";
import { ScrollableTableContainer } from "@/components/shared/ScrollableTableContainer";
import { PhoneLink } from "@/components/shared/PhoneLink";
import { evaluateRules, AdvancedRule } from "@/lib/filterRuleEngine";
import { PlusCodeLink } from "@/components/shared/PlusCodeLink";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

type SortField = "name" | "phone" | "status" | "professional_type" | "city" | "rating" | "created_at" | null;
type SortDirection = "asc" | "desc" | null;

interface EnhancedProfessionalTableProps {
  onEdit: (professional: Professional) => void;
  onAdd: () => void;
  onSelectProfessional?: (professional: Professional) => void;
  onBulkUpload?: () => void;
}

export function EnhancedProfessionalTable({ onEdit, onAdd, onSelectProfessional, onBulkUpload }: EnhancedProfessionalTableProps) {
  const { professionals, loading, deleteProfessional, refetch } = useProfessionals();
  const { getProfessionalTasks } = usePendingTasksByProfessional();
  const { canEdit, canDelete, canBulkAction, hasPermission } = usePermissions();
  const { staffMembers } = useActiveStaff();
  const { filters: savedFilters, addFilter, updateFilter, deleteFilter } = useSavedFilters("professionals");
  const { 
    columns, 
    visibleColumns, 
    saving: savingPrefs, 
    savePreferences, 
    resetToDefaults 
  } = useTablePreferences("professionals");
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [activeAdvancedRules, setActiveAdvancedRules] = useState<AdvancedRule[]>([]);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [manageFiltersDialogOpen, setManageFiltersDialogOpen] = useState(false);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);

  // Bulk action state
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<string>("");
  const [bulkActionValue, setBulkActionValue] = useState<string>("");
  const [bulkActionProgress, setBulkActionProgress] = useState<{ current: number; total: number } | null>(null);

  // Bulk task creation
  const [bulkTaskDialogOpen, setBulkTaskDialogOpen] = useState(false);

  // Export
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Tasks column filter
  const [tasksFilter, setTasksFilter] = useState<string>("all");
  // "all" | "has_overdue" | "has_pending" | "no_tasks"
  
  // Inline filter states
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [assignedToFilter, setAssignedToFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [createdDateRange, setCreatedDateRange] = useState<DateRange>({ from: undefined, to: undefined });

  // Build staff-based assignee filter
  const resolveAssignedToStaff = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const s of staffMembers) {
      if (s.email) lookup.set(s.email.toLowerCase(), s.email);
      if (s.name) lookup.set(s.name.toLowerCase(), s.email || s.name);
    }
    return lookup;
  }, [staffMembers]);

  const { uniqueAssignedTo, assigneeDisplayMap } = useMemo(() => {
    const assignedStaffKeys = new Set<string>();
    for (const p of professionals) {
      const key = resolveAssignedToStaff.get(p.assigned_to.toLowerCase());
      if (key) assignedStaffKeys.add(key);
    }
    const displayMap = new Map<string, string>();
    const options: string[] = [];
    for (const s of staffMembers) {
      const canonicalKey = s.email || s.name;
      if (assignedStaffKeys.has(canonicalKey)) {
        const label = getStaffDisplayName(canonicalKey, staffMembers);
        displayMap.set(canonicalKey, label);
        options.push(canonicalKey);
      }
    }
    options.sort((a, b) => (displayMap.get(a) || a).localeCompare(displayMap.get(b) || b));
    return { uniqueAssignedTo: options, assigneeDisplayMap: displayMap };
  }, [professionals, staffMembers, resolveAssignedToStaff]);

  const uniqueCities = useMemo(() => Array.from(new Set(professionals.map(p => p.city).filter(Boolean) as string[])), [professionals]);
  const uniqueStatuses = useMemo(() => Object.keys(PROFESSIONAL_STATUSES), []);
  const uniqueTypes = useMemo(() => Array.from(new Set(professionals.map(p => p.professional_type))), [professionals]);

  const filteredProfessionals = useMemo(() => {
    let result = professionals.filter(p => {
      const searchMatch = searchTerm.length < 2 ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone.includes(searchTerm) ||
        (p.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.firm_name || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const statusMatch = statusFilter.length === 0 || statusFilter.includes(p.status);
      const typeMatch = typeFilter.length === 0 || typeFilter.includes(p.professional_type);
      const cityMatch = cityFilter.length === 0 || cityFilter.includes(p.city || "");
      const resolvedAssignee = resolveAssignedToStaff.get(p.assigned_to.toLowerCase()) || p.assigned_to;
      const assignedMatch = assignedToFilter.length === 0 || assignedToFilter.includes(resolvedAssignee);
      const priorityMatch = priorityFilter.length === 0 || priorityFilter.includes(p.priority.toString());
      
      // Date range filter
      let createdDateMatch = true;
      if (createdDateRange.from || createdDateRange.to) {
        const date = new Date(p.created_at);
        let from = createdDateRange.from;
        let to = createdDateRange.to;
        if (from && to && from > to) { [from, to] = [to, from]; }
        const toEnd = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : undefined;
        if (from && toEnd) createdDateMatch = date >= from && date <= toEnd;
        else if (from) createdDateMatch = date >= from;
        else if (toEnd) createdDateMatch = date <= toEnd;
      }
      
      const advancedMatch = activeAdvancedRules.length === 0 ||
        evaluateRules(p as Record<string, any>, activeAdvancedRules);

      // Tasks filter
      if (tasksFilter !== "all") {
        const t = getProfessionalTasks(p.id);
        if (tasksFilter === "has_overdue") if (t.overdue <= 0) return false;
        if (tasksFilter === "has_pending") if (!(t.upcoming > 0 || t.dueToday > 0)) return false;
        if (tasksFilter === "no_tasks") if (t.total !== 0) return false;
      }

      return searchMatch && statusMatch && typeMatch && cityMatch && assignedMatch && priorityMatch && createdDateMatch && advancedMatch;
    });

    if (sortField && sortDirection) {
      result = [...result].sort((a, b) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];
        if (aVal === null || aVal === undefined) aVal = "";
        if (bVal === null || bVal === undefined) bVal = "";
        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();
        if (sortField === "tasks") {
          aVal = getProfessionalTasks(a.id).total;
          bVal = getProfessionalTasks(b.id).total;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [professionals, searchTerm, sortField, sortDirection, statusFilter, typeFilter, cityFilter, assignedToFilter, priorityFilter, createdDateRange, activeAdvancedRules, tasksFilter, getProfessionalTasks]);
  
  // MultiSelectFilter component for inline column filters
  const MultiSelectFilter = ({
    options,
    selected,
    onSelectionChange,
    placeholder,
    renderLabel,
  }: {
    options: string[];
    selected: string[];
    onSelectionChange: (values: string[]) => void;
    placeholder: string;
    renderLabel?: (option: string) => string;
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2">
          <Filter className="h-3 w-3" />
          {selected.length > 0 && (
            <span className="ml-1 text-xs bg-primary/10 text-primary px-1 rounded">
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
            {renderLabel ? renderLabel(option) : option}
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") setSortDirection("desc");
      else if (sortDirection === "desc") { setSortField(null); setSortDirection(null); }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    toast({ title: "Data refreshed" });
  };

  const BATCH_SIZE = 5;

  const handleBulkAction = async () => {
    if (!bulkActionType || selectedItems.length === 0) return;
    const total = selectedItems.length;
    setBulkActionProgress({ current: 0, total });

    try {
      for (let i = 0; i < selectedItems.length; i += BATCH_SIZE) {
        const batch = selectedItems.slice(i, i + BATCH_SIZE);

        for (const profId of batch) {
          if (bulkActionType === "status") {
            await supabase.from("professionals")
              .update({ status: bulkActionValue })
              .eq("id", profId);

          } else if (bulkActionType === "priority") {
            await supabase.from("professionals")
              .update({ priority: parseInt(bulkActionValue) })
              .eq("id", profId);

          } else if (bulkActionType === "assigned_to") {
            // Step 1: read OLD assignee before overwriting
            const prof = professionals.find(p => p.id === profId);
            const oldAssignee = prof?.assigned_to;

            // Step 2: update professional record
            await supabase.from("professionals")
              .update({ assigned_to: bulkActionValue })
              .eq("id", profId);

            // Step 3: update only tasks that belonged to the old assignee
            if (oldAssignee) {
              await supabase.from("tasks")
                .update({ assigned_to: bulkActionValue })
                .eq("related_entity_type", "professional")
                .eq("related_entity_id", profId)
                .eq("assigned_to", oldAssignee)
                .not("status", "in", '("Completed","Cancelled")');
            }

          } else if (bulkActionType === "delete") {
            await supabase.from("professionals").delete().eq("id", profId);
          }
        }

        setBulkActionProgress({
          current: Math.min(i + BATCH_SIZE, total), total
        });
      }

      toast({ title: `Updated ${total} professionals` });
      setSelectedItems([]);
      setBulkActionDialogOpen(false);
      setBulkActionType("");
      setBulkActionValue("");
      refetch();
    } catch (e) {
      console.error("[bulk-professionals]", e);
      toast({ title: "Error performing bulk action", variant: "destructive" });
    } finally {
      setBulkActionProgress(null);
    }
  };

  const handleBulkTaskSubmit = async (taskData: any, subtasks: any[]) => {
    const total = selectedItems.length;
    setBulkActionProgress({ current: 0, total });
    try {
      for (let i = 0; i < selectedItems.length; i += BATCH_SIZE) {
        const batch = selectedItems.slice(i, i + BATCH_SIZE);
        for (const profId of batch) {
          const prof = professionals.find(p => p.id === profId);
          await supabase.from("tasks").insert({
            ...taskData,
            related_entity_type: "professional",
            related_entity_id: profId,
            title: taskData.title || `Task for ${prof?.name || profId}`,
          });
        }
        setBulkActionProgress({
          current: Math.min(i + BATCH_SIZE, total), total
        });
      }
      toast({ title: `Created ${total} tasks` });
      setSelectedItems([]);
      setBulkTaskDialogOpen(false);
    } catch (e) {
      toast({ title: "Error creating tasks", variant: "destructive" });
    } finally {
      setBulkActionProgress(null);
    }
  };

  const handleExport = (config: any) => {
    const taskData: Record<string, { total: number; overdue: number; pending: number }> = {};
    filteredProfessionals.forEach(p => {
      const t = getProfessionalTasks(p.id);
      taskData[p.id] = { total: t.total, overdue: t.overdue, pending: t.upcoming };
    });

    const profsToExport =
      config.scope === "selected"
        ? filteredProfessionals.filter(p => selectedItems.includes(p.id))
        : config.scope === "filtered"
        ? filteredProfessionals
        : professionals;

    const result = exportProfessionals(profsToExport, config, taskData);

    if (result.error) {
      toast({ title: "Export failed", description: result.error,
              variant: "destructive" });
    } else {
      toast({ title: `Exported ${result.rowCount} professionals` });
    }
    setExportDialogOpen(false);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedItems(checked ? filteredProfessionals.map(p => p.id) : []);
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedItems(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
  };

  const getFilterCount = (filter: SavedFilter): number => {
    const config = filter.filter_config as any;
    return professionals.filter(p => {
      const statusMatch = (config.statusFilter?.length || 0) === 0 || (config.statusFilter || []).includes(p.status);
      const typeMatch = (config.typeFilter?.length || 0) === 0 || (config.typeFilter || []).includes(p.professional_type);
      const priorityMatch = (config.priorityFilter?.length || 0) === 0 || (config.priorityFilter || []).includes(p.priority.toString());
      const resolvedAssignee = resolveAssignedToStaff.get(p.assigned_to.toLowerCase()) || p.assigned_to;
      const assignedMatch = (config.assignedToFilter?.length || 0) === 0 || (config.assignedToFilter || []).includes(resolvedAssignee);
      const cityMatch = (config.cityFilter?.length || 0) === 0 || (config.cityFilter || []).includes(p.city || "");
      const advancedMatch = ((config.advancedRules?.length) || 0) === 0 ||
        evaluateRules(p as Record<string, any>, config.advancedRules || []);
      return statusMatch && typeMatch && priorityMatch && assignedMatch && cityMatch && advancedMatch;
    }).length;
  };

  const SortableHeader = ({ field, children }: { field: SortField | "tasks"; children: React.ReactNode }) => (
    <div className="flex items-center gap-1 cursor-pointer select-none" onClick={() => handleSort(field as SortField)}>
      {children}
      {sortField === field ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
    </div>
  );

  // Render cell based on column key
  const renderCell = (professional: Professional, columnKey: string) => {
    switch (columnKey) {
      case "name":
        const displayName = professional.name || professional.firm_name || professional.phone;
        return (
          <div 
            className="cursor-pointer hover:text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onSelectProfessional?.(professional);
            }}
          >
            <div className="font-medium">{displayName}</div>
          </div>
        );
      case "firmName":
        return professional.firm_name || "-";
      case "phone":
        return (
          <div className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            <PhoneLink
              phone={professional.phone}
              log={{
                relatedEntityType: 'professional',
                relatedEntityId: professional.id,
              }}
            />
          </div>
        );
      case "email":
        return professional.email ? (
          <a href={`mailto:${professional.email}`} className="text-primary hover:underline text-sm">{professional.email}</a>
        ) : "-";
      case "sitePlusCode":
        return (
          <PlusCodeLink
            plusCode={professional.site_plus_code || null}
            log={{ relatedEntityType: "professional", relatedEntityId: professional.id }}
          />
        );
      case "professionalType":
        return <span className="capitalize">{professional.professional_type.replace("_", " ")}</span>;
      case "city":
        return professional.city || "-";
      case "status":
        return (
          <Badge variant="secondary" className={PROFESSIONAL_STATUSES[professional.status]?.className || ""}>
            {PROFESSIONAL_STATUSES[professional.status]?.label || professional.status}
          </Badge>
        );
      case "priority":
        const priorityConfig = PRIORITIES[professional.priority];
        return priorityConfig ? (
          <span className={priorityConfig.color}>{priorityConfig.label}</span>
        ) : "-";
      case "assignedTo":
        return assigneeDisplayMap.get(professional.assigned_to) || getStaffDisplayName(professional.assigned_to, staffMembers);
      case "tasks":
        const t = getProfessionalTasks(professional.id);
        return t.total === 0 ? (
          <span className="text-xs text-muted-foreground">No tasks</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {t.overdue > 0 && (
              <Badge variant="destructive" className="text-xs">
                {t.overdue} overdue
              </Badge>
            )}
            {t.dueToday > 0 && (
              <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                {t.dueToday} today
              </Badge>
            )}
            {t.upcoming > 0 && (
              <Badge variant="outline" className="text-xs">
                {t.upcoming} upcoming
              </Badge>
            )}
          </div>
        );
      case "serviceCategory":
        return professional.service_category || "-";
      case "rating":
        return professional.rating ? `${professional.rating}/5` : "-";
      case "createdAt":
        return format(new Date(professional.created_at), "dd MMM yyyy");
      case "actions":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem onClick={() => onEdit(professional)}><Edit className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => deleteProfessional(professional.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      default:
        return "-";
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Search professionals..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setEditingFilter(null); setFilterDialogOpen(true); }}>
            <Filter className="h-4 w-4 mr-1" /> Create Filter
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManageFiltersDialogOpen(true)}>
            <SlidersHorizontal className="h-4 w-4 mr-1" /> Manage Filters
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setColumnManagerOpen(true)}
            title="Manage Columns"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          {selectedItems.length > 0 && canBulkAction("professionals" as any) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Bulk Actions ({selectedItems.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canEdit("professionals") && (
                  <>
                    <DropdownMenuItem onClick={() => {
                      setBulkActionType("assigned_to");
                      setBulkActionDialogOpen(true);
                    }}>
                      <Users className="mr-2 h-4 w-4" />Assign To
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setBulkActionType("status");
                      setBulkActionDialogOpen(true);
                    }}>
                      <Tag className="mr-2 h-4 w-4" />Change Status
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setBulkActionType("priority");
                      setBulkActionDialogOpen(true);
                    }}>
                      <ArrowUpDown className="mr-2 h-4 w-4" />Change Priority
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkTaskDialogOpen(true)}>
                      <ClipboardList className="mr-2 h-4 w-4" />Create Task
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                  <Download className="mr-2 h-4 w-4" />Export Selected
                </DropdownMenuItem>
                {hasPermission("whatsapp.bulk_send" as any) && (
                  <DropdownMenuItem onClick={() => {}}>
                    <MessageCircle className="mr-2 h-4 w-4" />Send WhatsApp
                  </DropdownMenuItem>
                )}
                {canDelete("professionals") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => {
                        setBulkActionType("delete");
                        setBulkActionDialogOpen(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />Delete Selected
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onBulkUpload && (
            <Button variant="outline" onClick={onBulkUpload}><Upload className="h-4 w-4 mr-1" /> Upload</Button>
          )}
          <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add Professional</Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">Showing {filteredProfessionals.length} of {professionals.length} professionals</div>

      <ScrollableTableContainer>
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 z-20 bg-background">
            <TableRow className="border-b-2 border-border shadow-sm">
              <TableHead className="w-10 bg-background sticky top-0">
                <Checkbox 
                  checked={selectedItems.length === filteredProfessionals.length && filteredProfessionals.length > 0} 
                  onCheckedChange={handleSelectAll} 
                />
              </TableHead>
              {visibleColumns.map((column) => (
                <TableHead key={column.key} className="bg-background sticky top-0">
                  <div className="flex items-center gap-1">
                    {column.key === "name" || column.key === "professionalType" || column.key === "city" || column.key === "status" || column.key === "rating" ? (
                      <SortableHeader field={column.key === "professionalType" ? "professional_type" : column.key as SortField}>
                        {column.label}
                      </SortableHeader>
                    ) : column.key === "createdAt" ? (
                      <>
                        <SortableHeader field="created_at">{column.label}</SortableHeader>
                        <DateRangeFilter dateRange={createdDateRange} onDateRangeChange={setCreatedDateRange} />
                      </>
                    ) : (
                      column.label
                    )}
                    {column.key === "status" && (
                      <MultiSelectFilter
                        options={uniqueStatuses}
                        selected={statusFilter}
                        onSelectionChange={setStatusFilter}
                        placeholder="Filter by Status"
                        renderLabel={(s) => PROFESSIONAL_STATUSES[s]?.label || s}
                      />
                    )}
                    {column.key === "professionalType" && (
                      <MultiSelectFilter
                        options={uniqueTypes}
                        selected={typeFilter}
                        onSelectionChange={setTypeFilter}
                        placeholder="Filter by Type"
                        renderLabel={(t) => t.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                      />
                    )}
                    {column.key === "city" && (
                      <MultiSelectFilter
                        options={uniqueCities}
                        selected={cityFilter}
                        onSelectionChange={setCityFilter}
                        placeholder="Filter by City"
                      />
                    )}
                    {column.key === "assignedTo" && (
                      <MultiSelectFilter
                        options={uniqueAssignedTo}
                        selected={assignedToFilter}
                        onSelectionChange={setAssignedToFilter}
                        placeholder="Filter by Assignee"
                        renderLabel={(key) => assigneeDisplayMap.get(key) || key}
                      />
                    )}
                    {column.key === "priority" && (
                      <MultiSelectFilter
                        options={Object.keys(PRIORITIES)}
                        selected={priorityFilter}
                        onSelectionChange={setPriorityFilter}
                        placeholder="Filter by Priority"
                        renderLabel={(p) => PRIORITIES[parseInt(p) as keyof typeof PRIORITIES]?.label || p}
                      />
                    )}
                    {column.key === "tasks" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 px-2">
                            <Filter className="h-3 w-3" />
                            {tasksFilter !== "all" && (
                              <span className="ml-1 text-xs bg-primary/10 text-primary px-1 rounded">1</span>
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel>Filter by tasks</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {[
                            { value: "all", label: "All professionals" },
                            { value: "has_overdue", label: "Has overdue tasks" },
                            { value: "has_pending", label: "Has pending tasks" },
                            { value: "no_tasks", label: "No tasks" },
                          ].map(opt => (
                            <DropdownMenuCheckboxItem
                              key={opt.value}
                              checked={tasksFilter === opt.value}
                              onCheckedChange={() => setTasksFilter(opt.value)}
                            >
                              {opt.label}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProfessionals.length === 0 ? (
              <TableRow><TableCell colSpan={visibleColumns.length + 1} className="text-center py-8 text-muted-foreground">No professionals found</TableCell></TableRow>
            ) : (
              filteredProfessionals.map((professional) => (
                <TableRow key={professional.id}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedItems.includes(professional.id)} 
                      onCheckedChange={(checked) => handleSelectItem(professional.id, !!checked)} 
                    />
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.key}>
                      {renderCell(professional, column.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </ScrollableTableContainer>

      <ProfessionalSavedFilterDialog 
        open={filterDialogOpen} 
        onOpenChange={setFilterDialogOpen} 
        onSave={addFilter} 
        onUpdate={updateFilter} 
        editingFilter={editingFilter} 
        uniqueAssignedTo={uniqueAssignedTo} 
        uniqueCities={uniqueCities} 
      />
      <ProfessionalManageFiltersDialog 
        open={manageFiltersDialogOpen} 
        onOpenChange={setManageFiltersDialogOpen} 
        filters={savedFilters} 
        onEdit={(f) => { setEditingFilter(f); setFilterDialogOpen(true); }} 
        onDelete={deleteFilter} 
        getFilterCount={getFilterCount} 
      />
      <ColumnManagerDialog
        open={columnManagerOpen}
        onOpenChange={setColumnManagerOpen}
        columns={columns}
        onSave={savePreferences}
        onReset={resetToDefaults}
        saving={savingPrefs}
      />

      {/* Bulk Confirmation Dialog */}
      <Dialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Action</DialogTitle>
          </DialogHeader>

          {/* Assign To */}
          {bulkActionType === "assigned_to" && (
            <div className="space-y-2">
              <Label>Assign to staff member</Label>
              <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                <SelectContent>
                  {staffMembers.map(s => (
                    <SelectItem key={s.email || s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Also reassigns open tasks that were assigned to the current owner of each professional.
              </p>
            </div>
          )}

          {/* Status */}
          {bulkActionType === "status" && (
            <div className="space-y-2">
              <Label>New status</Label>
              <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROFESSIONAL_STATUSES).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Priority */}
          {bulkActionType === "priority" && (
            <div className="space-y-2">
              <Label>New priority</Label>
              <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                <SelectContent>
                  {[
                    { value: "1", label: "Very High" },
                    { value: "2", label: "High" },
                    { value: "3", label: "Medium" },
                    { value: "4", label: "Low" },
                    { value: "5", label: "Very Low" },
                  ].map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Delete */}
          {bulkActionType === "delete" && (
            <p>
              Are you sure you want to delete {selectedItems.length} professional(s)?
              This cannot be undone.
            </p>
          )}

          {/* Progress bar */}
          {bulkActionProgress && (
            <div className="space-y-1">
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(bulkActionProgress.current / bulkActionProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {bulkActionProgress.current} / {bulkActionProgress.total}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkActionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={bulkActionType === "delete" ? "destructive" : "default"}
              onClick={handleBulkAction}
              disabled={(bulkActionType !== "delete" && !bulkActionValue) || !!bulkActionProgress}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Task Dialog */}
      <AddTaskDialog
        open={bulkTaskDialogOpen}
        onOpenChange={setBulkTaskDialogOpen}
        bulkMode={true}
        bulkLeadCount={selectedItems.length}
        onBulkTaskSubmit={handleBulkTaskSubmit}
      />

      {/* Export Dialog */}
      <ExportProfessionalsDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        totalProfessionals={professionals.length}
        filteredProfessionals={filteredProfessionals.length}
        selectedProfessionals={selectedItems.length}
        onExport={handleExport}
      />
    </div>
  );
}