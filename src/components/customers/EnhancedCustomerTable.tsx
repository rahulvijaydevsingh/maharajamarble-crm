import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
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
import {
  Edit,
  MoreHorizontal,
  Phone,
  Search,
  Trash2,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Plus,
  SlidersHorizontal,
  Loader2,
  Download,
  Calendar as CalendarIcon,
  Eye,
  RotateCcw,
  Users,
  Tag,
  UserPlus,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Customer, useCustomers } from "@/hooks/useCustomers";
import { useSavedFilters, SavedFilter } from "@/hooks/useSavedFilters";
import { useTablePreferences } from "@/hooks/useTablePreferences";
import { useToast } from "@/hooks/use-toast";
import { CUSTOMER_STATUSES, PRIORITY_LEVELS, CUSTOMER_TYPES } from "@/constants/customerConstants";
import { CustomerSavedFilterDialog } from "./filters/CustomerSavedFilterDialog";
import { CustomerManageFiltersDialog } from "./filters/CustomerManageFiltersDialog";
import { CustomerDetailView } from "./CustomerDetailView";
import { usePermissions } from "@/hooks/usePermissions";
import { ScrollableTableContainer } from "@/components/shared/ScrollableTableContainer";
import { usePendingTasksByCustomer, CustomerPendingTasks } from "@/hooks/usePendingTasksByCustomer";
import { ColumnManagerDialog } from "@/components/shared/ColumnManagerDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PhoneLink } from "@/components/shared/PhoneLink";

const COLUMN_VISIBILITY_KEY = "customers_column_visibility";

const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  name: true,
  phone: true,
  email: true,
  company_name: true,
  customer_type: true,
  city: true,
  status: true,
  priority: true,
  total_spent: true,
  source: true,
  assigned_to: true,
  pendingTasks: true,
  created_at: true,
  address: false,
  industry: false,
  notes: false,
};

interface ColumnVisibility {
  name: boolean;
  phone: boolean;
  email: boolean;
  company_name: boolean;
  customer_type: boolean;
  city: boolean;
  status: boolean;
  priority: boolean;
  total_spent: boolean;
  source: boolean;
  assigned_to: boolean;
  pendingTasks: boolean;
  created_at: boolean;
  address: boolean;
  industry: boolean;
  notes: boolean;
}

// Pending Tasks Badge Component - clickable to navigate to tasks page
function PendingTasksBadge({ customerId, customerName, getCustomerTasks, onNavigate }: { 
  customerId: string; 
  customerName: string;
  getCustomerTasks: (id: string) => CustomerPendingTasks;
  onNavigate: () => void;
}) {
  const taskInfo = getCustomerTasks(customerId);

  if (taskInfo.total === 0) {
    return <span className="text-muted-foreground text-xs">No tasks</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onNavigate();
            }}
            className="flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
          >
            {taskInfo.overdue > 0 && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0">
                {taskInfo.overdue} overdue
              </Badge>
            )}
            {taskInfo.dueToday > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {taskInfo.dueToday} today
              </Badge>
            )}
            {taskInfo.upcoming > 0 && taskInfo.overdue === 0 && taskInfo.dueToday === 0 && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                {taskInfo.upcoming} upcoming
              </Badge>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[300px]">
          <div className="text-sm">
            <p className="font-medium mb-1">{customerName}'s Tasks (Click to view all)</p>
            <ul className="text-xs space-y-0.5">
              {taskInfo.tasks.slice(0, 5).map(task => (
                <li key={task.id} className="truncate">• {task.title}</li>
              ))}
              {taskInfo.tasks.length > 5 && (
                <li className="text-muted-foreground">...and {taskInfo.tasks.length - 5} more</li>
              )}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

type SortField = "name" | "phone" | "status" | "customer_type" | "city" | "total_spent" | "created_at" | "priority" | "assigned_to" | null;
type SortDirection = "asc" | "desc" | null;

interface EnhancedCustomerTableProps {
  onEdit: (customer: Customer) => void;
  onAdd: () => void;
}

export function EnhancedCustomerTable({ onEdit, onAdd }: EnhancedCustomerTableProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { customers, loading, deleteCustomer, refetch } = useCustomers();
  const { filters: savedFilters, addFilter, updateFilter, deleteFilter } = useSavedFilters("customers");
  const { 
    columns, 
    visibleColumns, 
    saving: savingPrefs, 
    savePreferences, 
    resetToDefaults 
  } = useTablePreferences("customers");
  const { toast } = useToast();
  const { canEdit, canDelete, canBulkAction, hasPermission } = usePermissions();
  const { getCustomerTasks } = usePendingTasksByCustomer();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [manageFiltersDialogOpen, setManageFiltersDialogOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);

  // Detail view state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailViewOpen, setDetailViewOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Bulk action dialog
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<string>("");
  const [bulkActionValue, setBulkActionValue] = useState("");

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [assignedToFilter, setAssignedToFilter] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [pendingTasksFilter, setPendingTasksFilter] = useState<string[]>([]);
  const [createdDateRange, setCreatedDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);

  // Load column visibility from localStorage (fallback for backward compat)
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

  // Save column visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(columnVisibility));
    } catch (e) {
      console.error("Error saving column visibility:", e);
    }
  }, [columnVisibility]);

  // Handle ?view= URL parameter to open customer detail view
  useEffect(() => {
    const viewCustomerId = searchParams.get('view');
    if (viewCustomerId && customers.length > 0) {
      const customerToView = customers.find(c => c.id === viewCustomerId);
      if (customerToView) {
        setSelectedCustomer(customerToView);
        setDetailViewOpen(true);
        // Clear the URL parameter
        searchParams.delete('view');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, customers, setSearchParams]);

  const uniqueAssignedTo = useMemo(() => Array.from(new Set(customers.map(c => c.assigned_to))), [customers]);
  const uniqueCities = useMemo(() => Array.from(new Set(customers.map(c => c.city).filter(Boolean) as string[])), [customers]);
  const uniqueStatuses = useMemo(() => Object.keys(CUSTOMER_STATUSES), []);
  const uniqueTypes = useMemo(() => CUSTOMER_TYPES.map(t => t.value), []);

  const filteredCustomers = useMemo(() => {
    let result = customers.filter(c => {
      const searchMatch = searchTerm.length < 2 ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        (c.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.company_name || "").toLowerCase().includes(searchTerm.toLowerCase());

      const statusMatch = statusFilter.length === 0 || statusFilter.includes(c.status);
      const typeMatch = typeFilter.length === 0 || typeFilter.includes(c.customer_type);
      const priorityMatch = priorityFilter.length === 0 || priorityFilter.includes(c.priority.toString());
      const assignedMatch = assignedToFilter.length === 0 || assignedToFilter.includes(c.assigned_to);
      const cityMatch = cityFilter.length === 0 || cityFilter.includes(c.city || "");

      // Pending tasks filter
      let pendingTasksMatch = true;
      if (pendingTasksFilter.length > 0) {
        const taskInfo = getCustomerTasks(c.id);
        if (pendingTasksFilter.includes("has_pending")) {
          pendingTasksMatch = taskInfo.total > 0;
        } else if (pendingTasksFilter.includes("no_pending")) {
          pendingTasksMatch = taskInfo.total === 0;
        } else if (pendingTasksFilter.includes("has_overdue")) {
          pendingTasksMatch = taskInfo.overdue > 0;
        } else if (pendingTasksFilter.includes("due_today")) {
          pendingTasksMatch = taskInfo.dueToday > 0;
        }
      }

      const createdDateMatch = !createdDateRange.from || !createdDateRange.to ||
        (new Date(c.created_at) >= createdDateRange.from && new Date(c.created_at) <= createdDateRange.to);

      return searchMatch && statusMatch && typeMatch && priorityMatch && assignedMatch && cityMatch && pendingTasksMatch && createdDateMatch;
    });

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
  }, [customers, searchTerm, sortField, sortDirection, statusFilter, typeFilter, priorityFilter, assignedToFilter, cityFilter, pendingTasksFilter, createdDateRange, getCustomerTasks]);

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

  const handleSelectAll = (checked: boolean) => {
    setSelectedItems(checked ? filteredCustomers.map(c => c.id) : []);
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedItems(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
  };

  const toggleColumnVisibility = (column: keyof ColumnVisibility) => {
    setColumnVisibility(prev => ({ ...prev, [column]: !prev[column] }));
  };

  const resetColumnVisibility = useCallback(() => {
    setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
    toast({ title: "Column settings reset to defaults" });
  }, [toast]);

  const clearFilters = () => {
    setStatusFilter([]);
    setTypeFilter([]);
    setPriorityFilter([]);
    setAssignedToFilter([]);
    setCityFilter([]);
    setPendingTasksFilter([]);
    setCreatedDateRange({ from: undefined, to: undefined });
    setActiveFilterId(null);
  };

  const getFilterCount = (filter: SavedFilter) => customers.length;

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditing(false);
    setDetailViewOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditing(true);
    setDetailViewOpen(true);
  };

  const handleDeleteCustomer = async (id: string) => {
    await deleteCustomer(id);
    setDetailViewOpen(false);
    toast({ title: "Customer deleted" });
  };

  // Bulk actions
  const handleBulkAction = async () => {
    if (!bulkActionType || selectedItems.length === 0) return;

    try {
      for (const customerId of selectedItems) {
        if (bulkActionType === "delete") {
          await deleteCustomer(customerId);
        }
        // Add more bulk actions as needed
      }

      toast({ title: `Updated ${selectedItems.length} customers` });
      setSelectedItems([]);
      setBulkActionDialogOpen(false);
      setBulkActionType("");
      setBulkActionValue("");
    } catch (error) {
      toast({ title: "Error performing bulk action", variant: "destructive" });
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <div className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort(field)}>
      {children}
      {sortField === field ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
    </div>
  );

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

  // Render table header for a column
  const renderTableHeader = (columnKey: string, columnLabel: string) => {
    switch (columnKey) {
      case "name":
        return <SortableHeader field="name">{columnLabel}</SortableHeader>;
      case "phone":
        return columnLabel;
      case "email":
        return columnLabel;
      case "company_name":
        return columnLabel;
      case "customerType":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="customer_type">{columnLabel}</SortableHeader>
            <MultiSelectFilter
              options={uniqueTypes}
              selected={typeFilter}
              onSelectionChange={setTypeFilter}
              placeholder="Filter by Type"
              renderLabel={(t) => CUSTOMER_TYPES.find(ct => ct.value === t)?.label || t}
            />
          </div>
        );
      case "city":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="city">{columnLabel}</SortableHeader>
            <MultiSelectFilter
              options={uniqueCities}
              selected={cityFilter}
              onSelectionChange={setCityFilter}
              placeholder="Filter by City"
            />
          </div>
        );
      case "status":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="status">{columnLabel}</SortableHeader>
            <MultiSelectFilter
              options={uniqueStatuses}
              selected={statusFilter}
              onSelectionChange={setStatusFilter}
              placeholder="Filter by Status"
              renderLabel={(s) => CUSTOMER_STATUSES[s]?.label || s}
            />
          </div>
        );
      case "priority":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="priority">{columnLabel}</SortableHeader>
            <MultiSelectFilter
              options={Object.keys(PRIORITY_LEVELS)}
              selected={priorityFilter}
              onSelectionChange={setPriorityFilter}
              placeholder="Filter by Priority"
              renderLabel={(p) => PRIORITY_LEVELS[parseInt(p) as keyof typeof PRIORITY_LEVELS]?.label || p}
            />
          </div>
        );
      case "assignedTo":
        return (
          <div className="flex items-center gap-1">
            <SortableHeader field="assigned_to">{columnLabel}</SortableHeader>
            <MultiSelectFilter
              options={uniqueAssignedTo}
              selected={assignedToFilter}
              onSelectionChange={setAssignedToFilter}
              placeholder="Filter by Assignee"
            />
          </div>
        );
      case "tasks":
        return (
          <div className="flex items-center gap-1">
            {columnLabel}
            <MultiSelectFilter
              options={pendingTasksOptions}
              selected={pendingTasksFilter}
              onSelectionChange={setPendingTasksFilter}
              placeholder="Filter by Tasks"
              renderLabel={(t) => pendingTasksLabels[t] || t}
            />
          </div>
        );
      case "totalOrders":
        return columnLabel;
      case "totalSpent":
        return <SortableHeader field="total_spent">{columnLabel}</SortableHeader>;
      case "source":
        return columnLabel;
      case "createdAt":
        return <SortableHeader field="created_at">{columnLabel}</SortableHeader>;
      case "actions":
        return columnLabel;
      default:
        return columnLabel;
    }
  };

  // Render cell based on column key
  const renderCell = (customer: Customer, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return (
          <div className="font-medium group/name relative" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col">
              <span 
                className="cursor-pointer hover:text-primary hover:underline"
                onClick={() => handleViewCustomer(customer)}
              >
                {customer.name}
              </span>
              <div className="hidden group-hover/name:flex items-center gap-1 mt-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleViewCustomer(customer)}
                >
                  View
                </Button>
                {canEdit("customers") && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleEditCustomer(customer)}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      case "phone":
        return (
          <div>
            <div className="flex items-center">
              <Phone className="h-3 w-3 mr-1" />
              <PhoneLink phone={customer.phone} />
            </div>
            {customer.alternate_phone && (
              <div className="text-xs text-muted-foreground ml-4">
                <PhoneLink phone={customer.alternate_phone} className="text-xs" />
              </div>
            )}
          </div>
        );
      case "email":
        return <span className="text-muted-foreground text-sm">{customer.email || "-"}</span>;
      case "company_name":
        return customer.company_name || "-";
      case "customerType":
        return <span className="capitalize">{customer.customer_type}</span>;
      case "city":
        return customer.city || "-";
      case "status":
        return (
          <Badge variant="secondary" className={CUSTOMER_STATUSES[customer.status]?.className || ""}>
            {CUSTOMER_STATUSES[customer.status]?.label || customer.status}
          </Badge>
        );
      case "priority":
        return (
          <span className={PRIORITY_LEVELS[customer.priority as keyof typeof PRIORITY_LEVELS]?.color || ""}>
            {PRIORITY_LEVELS[customer.priority as keyof typeof PRIORITY_LEVELS]?.label || customer.priority}
          </span>
        );
      case "assignedTo":
        return customer.assigned_to;
      case "tasks":
        return (
          <PendingTasksBadge 
            customerId={customer.id} 
            customerName={customer.name}
            getCustomerTasks={getCustomerTasks}
            onNavigate={() => navigate(`/tasks?related_to_type=customer&related_to_id=${customer.id}&related_to_name=${encodeURIComponent(customer.name)}`)}
          />
        );
      case "totalOrders":
        return customer.total_orders || 0;
      case "totalSpent":
        return formatCurrency(customer.total_spent);
      case "source":
        return <span className="capitalize">{customer.source || "-"}</span>;
      case "createdAt":
        return <span className="text-muted-foreground text-sm">{format(new Date(customer.created_at), "PP")}</span>;
      case "actions":
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={() => handleViewCustomer(customer)}>
                  <Eye className="h-4 w-4 mr-2" />View Details
                </DropdownMenuItem>
                {canEdit("customers") && (
                  <DropdownMenuItem onClick={() => handleEditCustomer(customer)}><Edit className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                )}
                {canDelete("customers") && (
                  <DropdownMenuItem onClick={() => handleDeleteCustomer(customer.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      default:
        return "-";
    }
  };

  const hasActiveFilters = statusFilter.length > 0 || typeFilter.length > 0 || priorityFilter.length > 0 ||
    assignedToFilter.length > 0 || cityFilter.length > 0 || pendingTasksFilter.length > 0 || createdDateRange.from;

  const pendingTasksOptions = ["has_pending", "no_pending", "has_overdue", "due_today"];
  const pendingTasksLabels: Record<string, string> = {
    has_pending: "Has Pending Tasks",
    no_pending: "No Pending Tasks", 
    has_overdue: "Has Overdue Tasks",
    due_today: "Tasks Due Today",
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Search customers..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Bulk Actions */}
          {selectedItems.length > 0 && canBulkAction("customers") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Users className="h-4 w-4 mr-1" />
                  Bulk Actions ({selectedItems.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => { setBulkActionType("delete"); setBulkActionDialogOpen(true); }}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Column Settings */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setColumnManagerOpen(true)}
            title="Manage Columns"
          >
            <Settings className="h-4 w-4 mr-1" />
            Columns
          </Button>

          <Button variant="outline" size="sm" onClick={() => { setEditingFilter(null); setFilterDialogOpen(true); }}>
            <Filter className="h-4 w-4 mr-1" /> Create Filter
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManageFiltersDialogOpen(true)}>
            <SlidersHorizontal className="h-4 w-4 mr-1" /> Manage Filters
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" /> Clear Filters
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <Button onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add Customer</Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">Showing {filteredCustomers.length} of {customers.length} customers</div>

      <ScrollableTableContainer>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
            <TableRow>
              <TableHead className="w-10 bg-background">
                <Checkbox checked={selectedItems.length === filteredCustomers.length && filteredCustomers.length > 0} onCheckedChange={handleSelectAll} />
              </TableHead>
              {visibleColumns.map((column) => (
                <TableHead key={column.key} className="bg-background">
                  {renderTableHeader(column.key, column.label)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow><TableCell colSpan={visibleColumns.length + 1} className="text-center py-8 text-muted-foreground">No customers found</TableCell></TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewCustomer(customer)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedItems.includes(customer.id)} onCheckedChange={(checked) => handleSelectItem(customer.id, !!checked)} />
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.key}>
                      {renderCell(customer, column.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollableTableContainer>

      {/* Bulk Action Confirmation Dialog */}
      <Dialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Action</DialogTitle>
            <DialogDescription>
              {bulkActionType === "delete" && `Are you sure you want to delete ${selectedItems.length} customers? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkActionDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkAction}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Detail View */}
      <CustomerDetailView
        customer={selectedCustomer}
        open={detailViewOpen}
        onOpenChange={(open) => {
          setDetailViewOpen(open);
          if (!open) setIsEditing(false);
        }}
        onEdit={handleEditCustomer}
        onDelete={handleDeleteCustomer}
        initialEditMode={isEditing}
        onCreateLead={(customer) => {
          // Navigate to leads page with customer data to create a new lead
          navigate('/leads', { 
            state: { 
              createLeadFromCustomer: {
                name: customer.name,
                phone: customer.phone,
                alternate_phone: customer.alternate_phone,
                email: customer.email,
                address: customer.address,
                assigned_to: customer.assigned_to,
                source: 'customer_referral',
                notes: `Lead created from customer: ${customer.name}`,
                original_customer_id: customer.id,
              }
            }
          });
          setDetailViewOpen(false);
        }}
      />

      <CustomerSavedFilterDialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen} onSave={addFilter} onUpdate={updateFilter} editingFilter={editingFilter} uniqueAssignedTo={uniqueAssignedTo} uniqueCities={uniqueCities} />
      <CustomerManageFiltersDialog open={manageFiltersDialogOpen} onOpenChange={setManageFiltersDialogOpen} filters={savedFilters} onEdit={(f) => { setEditingFilter(f); setFilterDialogOpen(true); }} onDelete={deleteFilter} getFilterCount={getFilterCount} />
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
