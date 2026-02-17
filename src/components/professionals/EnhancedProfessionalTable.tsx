import React, { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Edit, MoreHorizontal, Phone, Search, Trash2, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Filter, Plus, SlidersHorizontal, Loader2, Settings, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Professional, useProfessionals } from "@/hooks/useProfessionals";
import { useSavedFilters, SavedFilter } from "@/hooks/useSavedFilters";
import { useTablePreferences } from "@/hooks/useTablePreferences";
import { useToast } from "@/hooks/use-toast";
import { PROFESSIONAL_STATUSES, PRIORITIES } from "@/constants/professionalConstants";
import { ProfessionalSavedFilterDialog } from "./filters/ProfessionalSavedFilterDialog";
import { ProfessionalManageFiltersDialog } from "./filters/ProfessionalManageFiltersDialog";
import { ColumnManagerDialog } from "@/components/shared/ColumnManagerDialog";
import { ScrollableTableContainer } from "@/components/shared/ScrollableTableContainer";
import { PhoneLink } from "@/components/shared/PhoneLink";
import { PlusCodeLink } from "@/components/shared/PlusCodeLink";

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
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [manageFiltersDialogOpen, setManageFiltersDialogOpen] = useState(false);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);
  
  // Inline filter states
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [assignedToFilter, setAssignedToFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);

  const uniqueAssignedTo = useMemo(() => Array.from(new Set(professionals.map(p => p.assigned_to))), [professionals]);
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
      const assignedMatch = assignedToFilter.length === 0 || assignedToFilter.includes(p.assigned_to);
      const priorityMatch = priorityFilter.length === 0 || priorityFilter.includes(p.priority.toString());
      
      return searchMatch && statusMatch && typeMatch && cityMatch && assignedMatch && priorityMatch;
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
  }, [professionals, searchTerm, sortField, sortDirection, statusFilter, typeFilter, cityFilter, assignedToFilter, priorityFilter]);
  
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
    setSelectedItems(checked ? filteredProfessionals.map(p => p.id) : []);
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedItems(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
  };

  const getFilterCount = (filter: SavedFilter) => professionals.length;

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <div className="flex items-center gap-1 cursor-pointer select-none" onClick={() => handleSort(field)}>
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
            {professional.name && professional.firm_name && (
              <div className="text-xs text-muted-foreground">{professional.firm_name}</div>
            )}
          </div>
        );
      case "firmName":
        return professional.firm_name || "-";
      case "phone":
        return (
          <div>
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              <PhoneLink phone={professional.phone} />
            </div>
            {professional.email && <div className="text-xs text-muted-foreground">{professional.email}</div>}
          </div>
        );
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
        return professional.assigned_to;
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
          {onBulkUpload && (
            <Button variant="outline" onClick={onBulkUpload}><Upload className="h-4 w-4 mr-1" /> Upload</Button>
          )}
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
    </div>
  );
}