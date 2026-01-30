import React, { useState, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
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
  Calendar as CalendarIcon, 
  Clock, 
  MoreHorizontal, 
  Search, 
  User,
  Phone,
  CheckCircle,
  Edit,
  Trash2,
  ChevronDown,
  Download,
  Filter,
  X,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  Settings,
  Users,
  Tag,
  Save,
  SlidersHorizontal,
  Plus,
  FolderOpen,
  Star,
  Repeat,
  AlarmClock,
  Building2,
  UserCheck
} from "lucide-react";
import { TaskSavedFilterDialog } from "@/components/tasks/filters/TaskSavedFilterDialog";
import { TaskManageFiltersDialog } from "@/components/tasks/filters/TaskManageFiltersDialog";
import { LeadDetailView } from "@/components/leads/LeadDetailView";
import { CustomerDetailView } from "@/components/customers/CustomerDetailView";
import { format, isToday, isPast, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useTasks, Task } from "@/hooks/useTasks";
import { useLeads, Lead } from "@/hooks/useLeads";
import { useCustomers, Customer } from "@/hooks/useCustomers";
import { useProfessionals, Professional } from "@/hooks/useProfessionals";
import { supabase } from "@/integrations/supabase/client";
import { useSavedFilters, SavedFilter, FilterConfig } from "@/hooks/useSavedFilters";
import { useTablePreferences } from "@/hooks/useTablePreferences";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { usePermissions } from "@/hooks/usePermissions";
import { ScrollableTableContainer } from "@/components/shared/ScrollableTableContainer";
import { ColumnManagerDialog } from "@/components/shared/ColumnManagerDialog";
import { PhoneLink } from "@/components/shared/PhoneLink";
import { PlusCodeLink } from "@/components/shared/PlusCodeLink";

// Priority styles
const priorityStyles: Record<string, { className: string; label: string }> = {
  High: { className: "bg-red-50 text-red-600 hover:bg-red-50", label: "High" },
  Medium: { className: "bg-yellow-50 text-yellow-600 hover:bg-yellow-50", label: "Medium" },
  Low: { className: "bg-green-50 text-green-600 hover:bg-green-50", label: "Low" },
};

// Status styles
const statusStyles: Record<string, { className: string; label: string }> = {
  Pending: { className: "bg-blue-50 text-blue-600 hover:bg-blue-50", label: "Pending" },
  'In Progress': { className: "bg-orange-50 text-orange-600 hover:bg-orange-50", label: "In Progress" },
  Completed: { className: "bg-green-50 text-green-600 hover:bg-green-50", label: "Completed" },
  Overdue: { className: "bg-red-50 text-red-600 hover:bg-red-50", label: "Overdue" },
};

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

type SortDirection = "asc" | "desc" | null;
type SortField = "title" | "type" | "priority" | "assigned_to" | "due_date" | "status" | "created_at" | null;

interface ColumnVisibility {
  starred: boolean;
  title: boolean;
  type: boolean;
  priority: boolean;
  assignedTo: boolean;
  relatedTo: boolean;
  sitePlusCode: boolean;
  dueDate: boolean;
  recurrence: boolean;
  status: boolean;
  createdAt: boolean;
  createdBy: boolean;
}

interface TaskTableProps {
  onEditTask?: (task: any) => void;
  initialRelatedToType?: string | null;
  initialRelatedToId?: string | null;
  initialRelatedToName?: string | null;
}

// Multi-select filter component matching leads page style
function MultiSelectFilter({ 
  options, 
  selectedValues, 
  onSelectionChange, 
  placeholder 
}: {
  options: string[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  placeholder: string;
}) {
  const handleToggle = (value: string) => {
    const newSelection = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    onSelectionChange(newSelection);
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 px-2 text-xs font-normal hover:bg-muted/50"
        >
          <Filter className="mr-1 h-3 w-3" />
          {selectedValues.length > 0 ? `${selectedValues.length}` : "All"}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {selectedValues.length > 0 && (
          <>
            <DropdownMenuItem onClick={handleClearAll} className="text-red-600">
              <X className="mr-2 h-4 w-4" />
              Clear All
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={selectedValues.includes(option)}
            onCheckedChange={() => handleToggle(option)}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Date range filter component matching leads page style
function DateRangeFilter({
  startDate,
  endDate,
  onDateChange
}: {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onDateChange: (start: Date | undefined, end: Date | undefined) => void;
}) {
  const hasDateFilter = startDate || endDate;

  const handleClearDates = () => {
    onDateChange(undefined, undefined);
  };

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 px-2 text-xs font-normal hover:bg-muted/50"
          >
            <CalendarIcon className="mr-1 h-3 w-3" />
            {startDate ? format(startDate, "MM/dd") : "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={(date) => onDateChange(date, endDate)}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 px-2 text-xs font-normal hover:bg-muted/50"
          >
            <CalendarIcon className="mr-1 h-3 w-3" />
            {endDate ? format(endDate, "MM/dd") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={(date) => onDateChange(startDate, date)}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {hasDateFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-1 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={handleClearDates}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// Sortable header component
function SortableHeader({ 
  field, 
  sortField, 
  sortDirection, 
  onSort, 
  children 
}: { 
  field: SortField; 
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <div 
      className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground" 
      onClick={() => onSort(field)}
    >
      {children}
      {sortField === field ? (
        sortDirection === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </div>
  );
}

export function EnhancedTaskTable({ 
  onEditTask, 
  initialRelatedToType, 
  initialRelatedToId,
  initialRelatedToName 
}: TaskTableProps) {
  const { tasks, loading, updateTask, deleteTask, refetch, toggleStar, snoozeTask } = useTasks();
  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { professionals } = useProfessionals();
  const { filters: savedFilters, addFilter, updateFilter, deleteFilter: removeSavedFilter } = useSavedFilters("tasks");
  const { 
    columns, 
    visibleColumns, 
    saving: savingPrefs, 
    savePreferences, 
    resetToDefaults 
  } = useTablePreferences("tasks");
  const { toast } = useToast();
  const { canEdit, canDelete, canBulkAction, hasPermission } = usePermissions();
  const navigate = useNavigate();

  // Detail view states for Related To links
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const openLeadDetailById = async (leadId: string) => {
    // Prefer already-loaded leads list first
    const leadFromStore = leads.find((l) => l.id === leadId);
    if (leadFromStore) {
      setSelectedLead(leadFromStore);
      setLeadDetailOpen(true);
      return;
    }

    // Fallback: fetch full lead record (tasks only join id/name/phone)
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({
          title: "Lead not found",
          description: "This lead may have been converted or deleted.",
          variant: "destructive",
        });
        return;
      }

      setSelectedLead(data as unknown as Lead);
      setLeadDetailOpen(true);
    } catch (e: any) {
      console.error("Failed to fetch lead for task related-to:", e);
      toast({
        title: "Could not open lead",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  
  // Filter states
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [dueDateRange, setDueDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [createdDateRange, setCreatedDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [relatedToFilter, setRelatedToFilter] = useState<string | null>(null);
  
  // Initialize filter from URL params
  useEffect(() => {
    if (initialRelatedToId) {
      setRelatedToFilter(initialRelatedToId);
    }
  }, [initialRelatedToId]);
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  // Selection state
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  
  // Bulk action dialog
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<string>("");
  const [bulkActionValue, setBulkActionValue] = useState("");
  const [bulkRescheduleDate, setBulkRescheduleDate] = useState<Date | undefined>(undefined);
  
  // Column visibility (for backward compatibility with existing table render)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
    starred: true,
    title: true,
    type: true,
    priority: true,
    assignedTo: true,
    relatedTo: true,
    sitePlusCode: false,
    dueDate: true,
    recurrence: true,
    status: true,
    createdAt: false,
    createdBy: false,
  });
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  
  // Saved filters
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [manageFiltersDialogOpen, setManageFiltersDialogOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);
  const [filterName, setFilterName] = useState("");
  const [isDefaultFilter, setIsDefaultFilter] = useState(false);
  const [isSharedFilter, setIsSharedFilter] = useState(false);

  // Transform tasks to include computed status
  const transformedTasks = useMemo(() => {
    return tasks.map(task => {
      let computedStatus = task.status;
      if (task.status !== 'Completed' && task.due_date) {
        const dueDate = parseISO(task.due_date);
        if (isPast(dueDate) && !isToday(dueDate)) {
          computedStatus = 'Overdue';
        }
      }
      return { ...task, computedStatus };
    });
  }, [tasks]);

  // Get unique values for filters
  const uniqueTypes = useMemo(() => [...new Set(transformedTasks.map(task => task.type))], [transformedTasks]);
  const uniquePriorities = useMemo(() => [...new Set(transformedTasks.map(task => task.priority))], [transformedTasks]);
  const uniqueAssignees = useMemo(() => [...new Set(transformedTasks.map(task => task.assigned_to))], [transformedTasks]);
  const uniqueStatuses = useMemo(() => [...new Set(transformedTasks.map(task => task.computedStatus))], [transformedTasks]);

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let result = transformedTasks.filter(task => {
      // Search filter
      const matchesSearch = !searchTerm || searchTerm.length < 2 || 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.lead?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      // Multi-select filters
      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(task.type);
      const matchesPriority = selectedPriorities.length === 0 || selectedPriorities.includes(task.priority);
      const matchesAssignee = selectedAssignees.length === 0 || selectedAssignees.includes(task.assigned_to);
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(task.computedStatus);
      
      // Date range filters
      const dueDateMatch = !dueDateRange.from || !dueDateRange.to || 
        (new Date(task.due_date) >= dueDateRange.from && new Date(task.due_date) <= dueDateRange.to);
      
      const createdDateMatch = !createdDateRange.from || !createdDateRange.to || 
        (new Date(task.created_at) >= createdDateRange.from && new Date(task.created_at) <= createdDateRange.to);
      
      // Related entity filter (for URL param filtering by lead)
      const matchesRelatedTo = !relatedToFilter || 
        task.lead_id === relatedToFilter || 
        task.related_entity_id === relatedToFilter;
      
      return matchesSearch && matchesType && matchesPriority && matchesAssignee && matchesStatus && dueDateMatch && createdDateMatch && matchesRelatedTo;
    });

    // Apply sorting
    if (sortField && sortDirection) {
      result = [...result].sort((a, b) => {
        let aVal: any = a[sortField as keyof typeof a];
        let bVal: any = b[sortField as keyof typeof b];
        
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
  }, [transformedTasks, searchTerm, selectedTypes, selectedPriorities, selectedAssignees, selectedStatuses, dueDateRange, createdDateRange, sortField, sortDirection, relatedToFilter]);

  // Saved filter counts - reuse existing filter config structure
  const getFilterCount = (filter: SavedFilter): number => {
    const config = filter.filter_config;
    return transformedTasks.filter(task => {
      const priorityMatch = (config.priorityFilter?.length || 0) === 0 || config.priorityFilter?.includes(task.priority);
      const assigneeMatch = (config.assignedToFilter?.length || 0) === 0 || config.assignedToFilter?.includes(task.assigned_to);
      const statusMatch = (config.statusFilter?.length || 0) === 0 || config.statusFilter?.includes(task.computedStatus);
      // Use sourceFilter to store task types for tasks entity
      const typeMatch = (config.sourceFilter?.length || 0) === 0 || config.sourceFilter?.includes(task.type);
      return priorityMatch && assigneeMatch && statusMatch && typeMatch;
    }).length;
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
    await refetch();
    setRefreshing(false);
    toast({ title: "Tasks refreshed" });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedTasks(checked ? filteredTasks.map(task => task.id) : []);
  };

  const handleSelectTask = (taskId: string, checked: boolean) => {
    setSelectedTasks(prev => 
      checked ? [...prev, taskId] : prev.filter(id => id !== taskId)
    );
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await updateTask(taskId, { status: 'Completed' });
      toast({ title: "Task marked as completed" });
    } catch (error) {
      console.error("Failed to complete task:", error);
    }
  };

  const handleToggleStar = async (taskId: string) => {
    try {
      await toggleStar(taskId);
    } catch (error) {
      console.error("Failed to toggle star:", error);
    }
  };

  const handleQuickSnooze = async (taskId: string, hours: number) => {
    try {
      await snoozeTask(taskId, hours);
      toast({ title: `Snoozed for ${hours} hours` });
    } catch (error) {
      console.error("Failed to snooze task:", error);
    }
  };

  // Get related entity display info
  const getRelatedEntityDisplay = (task: Task & { computedStatus: string }) => {
    if (task.lead) {
      return {
        name: task.lead.name,
        phone: task.lead.phone,
        type: 'Lead',
        icon: <User className="h-3 w-3" />
      };
    }
    if (task.related_entity_type && task.related_entity_id) {
      return {
        name: task.related_entity_id.substring(0, 8) + '...',
        phone: null,
        type: task.related_entity_type,
        icon: task.related_entity_type === 'Professional' ? <Building2 className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />
      };
    }
    return null;
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      try {
        await deleteTask(taskId);
        toast({ title: "Task deleted" });
      } catch (error) {
        console.error("Failed to delete task:", error);
      }
    }
  };

  // Bulk actions
  const handleBulkAction = async () => {
    if (selectedTasks.length === 0) return;

    try {
      for (const taskId of selectedTasks) {
        if (bulkActionType === "status") {
          await updateTask(taskId, { status: bulkActionValue });
        } else if (bulkActionType === "priority") {
          await updateTask(taskId, { priority: bulkActionValue });
        } else if (bulkActionType === "assigned_to") {
          await updateTask(taskId, { assigned_to: bulkActionValue });
        } else if (bulkActionType === "type") {
          await updateTask(taskId, { type: bulkActionValue });
        } else if (bulkActionType === "reschedule" && bulkRescheduleDate) {
          await updateTask(taskId, { due_date: format(bulkRescheduleDate, 'yyyy-MM-dd') });
        } else if (bulkActionType === "complete") {
          await updateTask(taskId, { status: "Completed" });
        } else if (bulkActionType === "incomplete") {
          await updateTask(taskId, { status: "Pending", completed_at: null });
        } else if (bulkActionType === "star") {
          await updateTask(taskId, { is_starred: true });
        } else if (bulkActionType === "unstar") {
          await updateTask(taskId, { is_starred: false });
        } else if (bulkActionType === "delete") {
          await deleteTask(taskId);
        }
      }
      const actionLabel = bulkActionType === "delete" ? "Deleted" : 
                          bulkActionType === "complete" ? "Completed" :
                          bulkActionType === "star" ? "Starred" :
                          bulkActionType === "unstar" ? "Unstarred" :
                          bulkActionType === "reschedule" ? "Rescheduled" : "Updated";
      toast({ title: `${actionLabel} ${selectedTasks.length} tasks` });
      setSelectedTasks([]);
      setBulkActionDialogOpen(false);
      setBulkActionType("");
      setBulkActionValue("");
      setBulkRescheduleDate(undefined);
    } catch (error) {
      toast({ title: "Error performing bulk action", variant: "destructive" });
    }
  };

  const openBulkActionDialog = (type: string) => {
    setBulkActionType(type);
    // For actions that don't need a dialog, execute immediately
    if (["complete", "incomplete", "star", "unstar"].includes(type)) {
      setBulkActionDialogOpen(false);
      // Execute immediately
      handleBulkActionImmediate(type);
    } else {
      setBulkActionDialogOpen(true);
    }
  };

  const handleBulkActionImmediate = async (type: string) => {
    if (selectedTasks.length === 0) return;
    try {
      for (const taskId of selectedTasks) {
        if (type === "complete") {
          await updateTask(taskId, { status: "Completed" });
        } else if (type === "incomplete") {
          await updateTask(taskId, { status: "Pending", completed_at: null });
        } else if (type === "star") {
          await updateTask(taskId, { is_starred: true });
        } else if (type === "unstar") {
          await updateTask(taskId, { is_starred: false });
        }
      }
      const actionLabel = type === "complete" ? "Completed" :
                          type === "incomplete" ? "Reopened" :
                          type === "star" ? "Starred" : "Unstarred";
      toast({ title: `${actionLabel} ${selectedTasks.length} tasks` });
      setSelectedTasks([]);
    } catch (error) {
      toast({ title: "Error performing bulk action", variant: "destructive" });
    }
  };

  // Apply saved filter - map sourceFilter to types for tasks
  const applyFilter = (filter: SavedFilter) => {
    const config = filter.filter_config;
    setSelectedTypes(config.sourceFilter || []); // Using sourceFilter for task types
    setSelectedPriorities(config.priorityFilter || []);
    setSelectedAssignees(config.assignedToFilter || []);
    setSelectedStatuses(config.statusFilter || []);
    setActiveFilterId(filter.id);
  };

  const clearFilters = () => {
    setSelectedTypes([]);
    setSelectedPriorities([]);
    setSelectedAssignees([]);
    setSelectedStatuses([]);
    setDueDateRange({ from: undefined, to: undefined });
    setCreatedDateRange({ from: undefined, to: undefined });
    setActiveFilterId(null);
  };

  const handleSaveFilter = async () => {
    if (!filterName.trim()) return;
    
    // Map task filters to existing FilterConfig structure
    const config: FilterConfig = {
      sourceFilter: selectedTypes, // Using sourceFilter for task types
      priorityFilter: selectedPriorities,
      assignedToFilter: selectedAssignees,
      statusFilter: selectedStatuses,
      materialsFilter: [],
      createdDateRange: { from: null, to: null },
      lastFollowUpRange: { from: null, to: null },
      nextFollowUpRange: { from: null, to: null },
    };
    
    await addFilter({
      name: filterName,
      filter_config: config,
      is_default: isDefaultFilter,
      is_shared: isSharedFilter,
    });
    setFilterDialogOpen(false);
    setFilterName("");
    setIsDefaultFilter(false);
    setIsSharedFilter(false);
    toast({ title: "Filter saved" });
  };

  const exportToExcel = () => {
    const tasksToExport = selectedTasks.length > 0 
      ? filteredTasks.filter(t => selectedTasks.includes(t.id))
      : filteredTasks;

    const exportData = tasksToExport.map(task => ({
      'Title': task.title,
      'Type': task.type,
      'Priority': task.priority,
      'Assigned To': task.assigned_to,
      'Related To': task.lead?.name || '-',
      'Phone': task.lead?.phone || '-',
      'Due Date': task.due_date,
      'Due Time': task.due_time || '-',
      'Status': task.computedStatus,
      'Description': task.description || '',
      'Created At': format(new Date(task.created_at), 'yyyy-MM-dd'),
      'Created By': task.created_by,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    XLSX.writeFile(wb, `tasks_export_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
    
    toast({ title: "Export Complete", description: `Exported ${exportData.length} tasks` });
  };

  const toggleColumnVisibility = (column: keyof ColumnVisibility) => {
    setColumnVisibility(prev => ({ ...prev, [column]: !prev[column] }));
  };

  // Render table header for a column
  const renderTableHeader = (columnKey: string, columnLabel: string) => {
    switch (columnKey) {
      case "starred":
        return <Star className="h-4 w-4" />;
      case "title":
        return (
          <SortableHeader field="title" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
            {columnLabel}
          </SortableHeader>
        );
      case "type":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="type" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
              {columnLabel}
            </SortableHeader>
            <MultiSelectFilter
              options={uniqueTypes}
              selectedValues={selectedTypes}
              onSelectionChange={setSelectedTypes}
              placeholder="All"
            />
          </div>
        );
      case "priority":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="priority" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
              {columnLabel}
            </SortableHeader>
            <MultiSelectFilter
              options={uniquePriorities}
              selectedValues={selectedPriorities}
              onSelectionChange={setSelectedPriorities}
              placeholder="All"
            />
          </div>
        );
      case "assignedTo":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="assigned_to" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
              {columnLabel}
            </SortableHeader>
            <MultiSelectFilter
              options={uniqueAssignees}
              selectedValues={selectedAssignees}
              onSelectionChange={setSelectedAssignees}
              placeholder="All"
            />
          </div>
        );
      case "relatedTo":
        return columnLabel;
      case "sitePlusCode":
        return columnLabel;
      case "dueDate":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="due_date" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
              {columnLabel}
            </SortableHeader>
            <DateRangeFilter
              startDate={dueDateRange.from}
              endDate={dueDateRange.to}
              onDateChange={(start, end) => setDueDateRange({ from: start, to: end })}
            />
          </div>
        );
      case "recurrence":
        return columnLabel;
      case "status":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
              {columnLabel}
            </SortableHeader>
            <MultiSelectFilter
              options={uniqueStatuses}
              selectedValues={selectedStatuses}
              onSelectionChange={setSelectedStatuses}
              placeholder="All"
            />
          </div>
        );
      case "createdAt":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="created_at" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
              {columnLabel}
            </SortableHeader>
            <DateRangeFilter
              startDate={createdDateRange.from}
              endDate={createdDateRange.to}
              onDateChange={(start, end) => setCreatedDateRange({ from: start, to: end })}
            />
          </div>
        );
      case "createdBy":
        return columnLabel;
      case "actions":
        return columnLabel;
      default:
        return columnLabel;
    }
  };

  // Render cell based on column key
  const renderCell = (task: Task & { computedStatus: string }, columnKey: string) => {
    switch (columnKey) {
      case "starred":
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleToggleStar(task.id)}
          >
            <Star 
              className={cn(
                "h-4 w-4",
                task.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
              )} 
            />
          </Button>
        );
      case "title":
        return (
          <div>
            <div className="font-medium">{task.title}</div>
            {task.description && (
              <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                {task.description}
              </div>
            )}
          </div>
        );
      case "type":
        return <Badge variant="outline">{task.type}</Badge>;
      case "priority":
        return (
          <Badge 
            variant="secondary" 
            className={priorityStyles[task.priority]?.className || ""}
          >
            {task.priority}
          </Badge>
        );
      case "assignedTo":
        return (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="text-sm">{task.assigned_to}</span>
          </div>
        );
      case "relatedTo":
        return task.lead ? (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                if (task.lead?.id) {
                  void openLeadDetailById(task.lead.id);
                }
              }}
              className="text-left p-1 -m-1 rounded transition-colors cursor-pointer group"
              title="View Lead Details"
            >
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 text-primary shrink-0" />
                <span className="text-sm font-medium text-primary group-hover:underline truncate">
                  {task.lead.name}
                </span>
              </div>
            </button>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="-ml-1">
                <PhoneLink
                  phone={task.lead.phone}
                  className="inline-flex items-center rounded px-1 py-0.5 hover:bg-muted/50"
                />
              </span>
            </div>

            <Badge variant="outline" className="text-xs">Lead</Badge>
          </div>
        ) : task.related_entity_type && task.related_entity_id ? (
          <button 
            onClick={() => {
              if (task.related_entity_type === 'lead') {
                void openLeadDetailById(task.related_entity_id);
              } else if (task.related_entity_type === 'customer') {
                const customerData = customers.find(c => c.id === task.related_entity_id);
                if (customerData) {
                  setSelectedCustomer(customerData);
                  setCustomerDetailOpen(true);
                }
              } else if (task.related_entity_type === 'professional') {
                navigate(`/professionals?view=${task.related_entity_id}`);
              }
            }}
            className="text-left p-1 -m-1 rounded transition-colors cursor-pointer group"
            title={`View ${task.related_entity_type} Details`}
          >
            <div className="flex items-center gap-1">
              {task.related_entity_type === 'customer' ? (
                <Building2 className="h-3 w-3 text-emerald-600 shrink-0" />
              ) : task.related_entity_type === 'professional' ? (
                <UserCheck className="h-3 w-3 text-purple-600 shrink-0" />
              ) : (
                <User className="h-3 w-3 text-primary shrink-0" />
              )}
              <span className="text-sm font-medium text-primary group-hover:underline truncate">
                {task.related_entity_type === 'lead' && task.lead?.name 
                  ? task.lead.name 
                  : task.related_entity_type === 'customer'
                  ? customers.find(c => c.id === task.related_entity_id)?.name || 'View Details'
                  : 'View Details'}
              </span>
            </div>
            <Badge variant="outline" className="text-xs capitalize mt-0.5">{task.related_entity_type}</Badge>
          </button>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      case "sitePlusCode": {
        const plusCodeFromLead = task.lead?.site_plus_code || null;
        const plusCodeFromCustomer =
          task.related_entity_type === "customer"
            ? customers.find((c) => c.id === task.related_entity_id)?.site_plus_code || null
            : null;
        const plusCodeFromProfessional =
          task.related_entity_type === "professional"
            ? professionals.find((p) => p.id === task.related_entity_id)?.site_plus_code || null
            : null;

        const plusCode = plusCodeFromLead || plusCodeFromCustomer || plusCodeFromProfessional;
        return (
          <PlusCodeLink
            plusCode={plusCode}
            log={{
              leadId: task.lead_id || undefined,
              customerId: task.related_entity_type === "customer" ? task.related_entity_id || undefined : undefined,
              relatedEntityType: task.related_entity_type || undefined,
              relatedEntityId: task.related_entity_id || undefined,
            }}
          />
        );
      }
      case "dueDate":
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-sm">
              <CalendarIcon className="h-3 w-3" />
              {format(new Date(task.due_date), 'MMM dd, yyyy')}
            </div>
            {task.due_time && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {task.due_time}
              </div>
            )}
          </div>
        );
      case "recurrence":
        return task.is_recurring ? (
          <div className="flex items-center gap-1">
            <Repeat className="h-3 w-3 text-blue-500" />
            <span className="text-xs text-muted-foreground capitalize">
              {task.recurrence_frequency || 'Recurring'}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        );
      case "status":
        return (
          <Badge 
            variant="secondary" 
            className={statusStyles[task.computedStatus]?.className || ""}
          >
            {task.computedStatus}
          </Badge>
        );
      case "createdAt":
        return <span className="text-sm">{format(new Date(task.created_at), 'MMM dd, yyyy')}</span>;
      case "createdBy":
        return <span className="text-sm">{task.created_by}</span>;
      case "actions":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {task.status !== 'Completed' && (
                <>
                  <DropdownMenuItem 
                    onClick={() => handleCompleteTask(task.id)}
                    className="text-green-600"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Mark Complete
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Snooze</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleQuickSnooze(task.id, 1)}>
                    <AlarmClock className="mr-2 h-4 w-4" />
                    1 Hour
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleQuickSnooze(task.id, 4)}>
                    <AlarmClock className="mr-2 h-4 w-4" />
                    4 Hours
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleQuickSnooze(task.id, 24)}>
                    <AlarmClock className="mr-2 h-4 w-4" />
                    Tomorrow
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => handleToggleStar(task.id)}>
                <Star className={cn("mr-2 h-4 w-4", task.is_starred && "fill-yellow-400 text-yellow-400")} />
                {task.is_starred ? "Unstar" : "Star"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditTask?.({
                id: task.id,
                title: task.title,
                type: task.type,
                priority: task.priority,
                assignedTo: task.assigned_to,
                relatedTo: task.lead ? {
                  id: task.lead.id,
                  name: task.lead.name,
                  phone: task.lead.phone,
                  type: 'Lead' as const
                } : null,
                dueDate: task.due_date,
                dueTime: task.due_time,
                status: task.status,
                description: task.description,
                reminder: task.reminder,
                is_recurring: task.is_recurring,
                recurrence_frequency: task.recurrence_frequency,
              })}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Task
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDeleteTask(task.id)}
                className="text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      default:
        return "-";
    }
  };

  const hasActiveFilters = selectedTypes.length > 0 || selectedPriorities.length > 0 || 
    selectedAssignees.length > 0 || selectedStatuses.length > 0 || 
    dueDateRange.from || createdDateRange.from || relatedToFilter;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Related Entity Filter Banner */}
      {relatedToFilter && initialRelatedToName && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <User className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">
            Showing tasks for: <strong>{initialRelatedToName}</strong>
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-auto text-blue-600 hover:text-blue-800 hover:bg-blue-100"
            onClick={() => {
              setRelatedToFilter(null);
              window.history.replaceState(null, '', '/tasks');
            }}
          >
            <X className="mr-1 h-3 w-3" /> Clear Filter
          </Button>
        </div>
      )}
      
      {/* Saved Filter Quick Access */}
      <div className="flex flex-wrap gap-2 items-center">
        {savedFilters.map(filter => (
          <Button
            key={filter.id}
            variant={activeFilterId === filter.id ? "default" : "outline"}
            size="sm"
            onClick={() => applyFilter(filter)}
            className="text-xs"
          >
            {getFilterCount(filter)} {filter.name}
          </Button>
        ))}
        {activeFilterId && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-red-600">
            <X className="mr-1 h-3 w-3" /> Clear Filter
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              setEditingFilter(null);
              setFilterDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> Create Filter
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setManageFiltersDialogOpen(true)}
          >
            <FolderOpen className="mr-1 h-3 w-3" /> Manage Filters
          </Button>
        </div>
      </div>

      {/* Bulk Actions Bar - only show if user has bulk action permission */}
      {selectedTasks.length > 0 && canBulkAction("tasks") && (
        <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg flex-wrap">
          <span className="text-sm font-semibold text-primary">{selectedTasks.length} selected</span>
          <div className="h-4 w-px bg-border" />
          
          {/* Primary Actions - require edit permission */}
          {canEdit("tasks") && (
            <>
              <Button variant="outline" size="sm" onClick={() => openBulkActionDialog("complete")} className="bg-green-50 hover:bg-green-100 border-green-200">
                <CheckCircle className="mr-1 h-3 w-3 text-green-600" /> Complete
              </Button>
              <Button variant="outline" size="sm" onClick={() => openBulkActionDialog("incomplete")}>
                <RefreshCw className="mr-1 h-3 w-3" /> Reopen
              </Button>
              <Button variant="outline" size="sm" onClick={() => openBulkActionDialog("star")}>
                <Star className="mr-1 h-3 w-3 text-yellow-500" /> Star
              </Button>
              <Button variant="outline" size="sm" onClick={() => openBulkActionDialog("unstar")}>
                <Star className="mr-1 h-3 w-3" /> Unstar
              </Button>
              
              <div className="h-4 w-px bg-border" />
              
              {/* Secondary Actions */}
              {hasPermission("tasks.assign") && (
                <Button variant="outline" size="sm" onClick={() => openBulkActionDialog("assigned_to")}>
                  <Users className="mr-1 h-3 w-3" /> Reassign
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => openBulkActionDialog("reschedule")}>
                <CalendarIcon className="mr-1 h-3 w-3" /> Reschedule
              </Button>
            </>
          )}
          
          {/* More Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                More <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {canEdit("tasks") && (
                <>
                  <DropdownMenuItem onClick={() => openBulkActionDialog("type")}>
                    <Tag className="mr-2 h-4 w-4" /> Change Type
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openBulkActionDialog("priority")}>
                    <ArrowUpDown className="mr-2 h-4 w-4" /> Change Priority
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openBulkActionDialog("status")}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Change Status
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={exportToExcel}>
                <Download className="mr-2 h-4 w-4" /> Export Selected
              </DropdownMenuItem>
              {canDelete("tasks") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => openBulkActionDialog("delete")}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setSelectedTasks([])}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* Search, Filters, and Actions */}
      <div className="flex gap-4 items-center justify-between flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tasks by title, contact name..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={() => setFilterDialogOpen(true)}>
              <Save className="mr-1 h-4 w-4" /> Save Filter
            </Button>
          )}
          
          <Button variant="outline" size="sm" onClick={clearFilters} disabled={!hasActiveFilters}>
            <SlidersHorizontal className="mr-1 h-4 w-4" /> Clear Filters
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setColumnManagerOpen(true)}
            title="Manage Columns"
          >
            <Settings className="mr-1 h-4 w-4" /> Columns
          </Button>
          
          <Button onClick={exportToExcel} variant="outline" size="sm">
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Tasks Table */}
      <ScrollableTableContainer>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
            <TableRow>
              <TableHead className="w-[40px] bg-background">
                <Checkbox 
                  checked={selectedTasks.length === filteredTasks.length && filteredTasks.length > 0}
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
              </TableHead>
              {visibleColumns.map((column) => (
                <TableHead key={column.key} className="bg-background">
                  {renderTableHeader(column.key, column.label)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.map((task) => (
              <TableRow key={task.id} className={selectedTasks.includes(task.id) ? "bg-muted/50" : ""}>
                <TableCell>
                  <Checkbox 
                    checked={selectedTasks.includes(task.id)}
                    onCheckedChange={(checked) => handleSelectTask(task.id, !!checked)}
                  />
                </TableCell>
                {visibleColumns.map((column) => (
                  <TableCell key={column.key}>
                    {renderCell(task, column.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollableTableContainer>

      {filteredTasks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No tasks found matching your filters.
        </div>
      )}

      {/* Bulk Action Dialog */}
      <Dialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {bulkActionType === "delete" ? "Delete Tasks" : 
               bulkActionType === "reschedule" ? "Reschedule Tasks" :
               bulkActionType === "type" ? "Change Task Type" :
               bulkActionType === "priority" ? "Change Priority" :
               bulkActionType === "status" ? "Change Status" :
               bulkActionType === "assigned_to" ? "Reassign Tasks" : "Bulk Update"}
            </DialogTitle>
            <DialogDescription>
              {bulkActionType === "delete" 
                ? `Are you sure you want to delete ${selectedTasks.length} tasks? This cannot be undone.`
                : `Update ${selectedTasks.length} selected tasks`}
            </DialogDescription>
          </DialogHeader>
          
          {bulkActionType !== "delete" && (
            <div className="space-y-4">
              {bulkActionType === "status" && (
                <div className="space-y-2">
                  <Label>New Status</Label>
                  <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {bulkActionType === "priority" && (
                <div className="space-y-2">
                  <Label>New Priority</Label>
                  <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {bulkActionType === "type" && (
                <div className="space-y-2">
                  <Label>New Task Type</Label>
                  <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select task type" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {bulkActionType === "assigned_to" && (
                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select value={bulkActionValue} onValueChange={setBulkActionValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueAssignees.map(assignee => (
                        <SelectItem key={assignee} value={assignee}>{assignee}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {bulkActionType === "reschedule" && (
                <div className="space-y-2">
                  <Label>New Due Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bulkRescheduleDate ? format(bulkRescheduleDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={bulkRescheduleDate}
                        onSelect={setBulkRescheduleDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkActionDialogOpen(false);
              setBulkActionType("");
              setBulkActionValue("");
              setBulkRescheduleDate(undefined);
            }}>
              Cancel
            </Button>
            <Button 
              variant={bulkActionType === "delete" ? "destructive" : "default"}
              onClick={handleBulkAction}
              disabled={
                (bulkActionType === "reschedule" && !bulkRescheduleDate) ||
                (["status", "priority", "type", "assigned_to"].includes(bulkActionType) && !bulkActionValue)
              }
            >
              {bulkActionType === "delete" ? "Delete" : 
               bulkActionType === "reschedule" ? "Reschedule" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Filter Dialog - Use new TaskSavedFilterDialog */}
      <TaskSavedFilterDialog
        open={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
        onSave={addFilter}
        onUpdate={updateFilter}
        editingFilter={editingFilter}
        uniqueTypes={uniqueTypes}
        uniqueAssignedTo={uniqueAssignees}
      />

      {/* Manage Filters Dialog */}
      <TaskManageFiltersDialog
        open={manageFiltersDialogOpen}
        onOpenChange={setManageFiltersDialogOpen}
        filters={savedFilters}
        onEdit={(filter) => {
          setEditingFilter(filter);
          setManageFiltersDialogOpen(false);
          setFilterDialogOpen(true);
        }}
        onDelete={removeSavedFilter}
        getFilterCount={getFilterCount}
      />

      {/* Lead Detail View Modal */}
      <LeadDetailView
        lead={selectedLead}
        open={leadDetailOpen}
        onOpenChange={setLeadDetailOpen}
      />

      {/* Customer Detail View Modal */}
      <CustomerDetailView
        customer={selectedCustomer}
        open={customerDetailOpen}
        onOpenChange={setCustomerDetailOpen}
      />

      {/* Column Manager Dialog */}
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
