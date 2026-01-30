import React from "react";
import { 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Edit, 
  MoreHorizontal, 
  Phone, 
  Plus,
  FileText,
  UserPlus,
  Clock,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { Lead } from "@/hooks/useLeads";
import { ScrollableTableContainer } from "@/components/shared/ScrollableTableContainer";
import { ColumnConfig } from "@/hooks/useTablePreferences";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

type SortField = "name" | "phone" | "email" | "status" | "priority" | "assigned_to" | "created_at" | "next_follow_up" | "last_follow_up" | "created_by" | null;

interface LeadsTableContainerProps {
  filteredLeads: Lead[];
  selectedLeads: string[];
  visibleColumns: ColumnConfig[];
  handleSelectAll: (checked: boolean) => void;
  handleSelectLead: (leadId: string, checked: boolean) => void;
  handleViewLead: (lead: Lead) => void;
  handleEditLeadClick: (lead: Lead) => void;
  sourceFilter: string[];
  setSourceFilter: (values: string[]) => void;
  materialsFilter: string[];
  setMaterialsFilter: (values: string[]) => void;
  statusFilter: string[];
  setStatusFilter: (values: string[]) => void;
  priorityFilter: string[];
  setPriorityFilter: (values: string[]) => void;
  assignedToFilter: string[];
  setAssignedToFilter: (values: string[]) => void;
  createdByFilter: string[];
  setCreatedByFilter: (values: string[]) => void;
  createdDateRange: DateRange;
  setCreatedDateRange: (range: DateRange) => void;
  lastFollowUpRange: DateRange;
  setLastFollowUpRange: (range: DateRange) => void;
  nextFollowUpRange: DateRange;
  setNextFollowUpRange: (range: DateRange) => void;
  uniqueSources: string[];
  uniqueMaterials: string[];
  uniqueAssignedTo: string[];
  uniqueCreatedBy: string[];
  statuses: Record<string, { label: string; className: string }>;
  priorities: Record<number, { label: string; color: string }>;
  SortableHeader: React.FC<{ field: SortField; children: React.ReactNode }>;
  MultiSelectFilter: React.FC<{ options: string[]; selected: string[]; onSelectionChange: (values: string[]) => void; placeholder: string }>;
  DateRangeFilter: React.FC<{ dateRange: DateRange; onDateRangeChange: (range: DateRange) => void }>;
  PendingTasksBadge: React.FC<{ leadId: string; leadName: string }>;
  canEdit: (resource: string) => boolean;
  hasPermission: (permission: string) => boolean;
  handleAddFollowUp: (lead: Lead) => void;
  handleViewHistory: (lead: Lead) => void;
  handleCreateQuotation: (lead: Lead) => void;
  handleAddToCustomer: (lead: Lead) => void;
}

export function LeadsTableContainer({
  filteredLeads,
  selectedLeads,
  visibleColumns,
  handleSelectAll,
  handleSelectLead,
  handleViewLead,
  handleEditLeadClick,
  sourceFilter,
  setSourceFilter,
  materialsFilter,
  setMaterialsFilter,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  assignedToFilter,
  setAssignedToFilter,
  createdByFilter,
  setCreatedByFilter,
  createdDateRange,
  setCreatedDateRange,
  lastFollowUpRange,
  setLastFollowUpRange,
  nextFollowUpRange,
  setNextFollowUpRange,
  uniqueSources,
  uniqueMaterials,
  uniqueAssignedTo,
  uniqueCreatedBy,
  statuses,
  priorities,
  SortableHeader,
  MultiSelectFilter,
  DateRangeFilter,
  PendingTasksBadge,
  canEdit,
  hasPermission,
  handleAddFollowUp,
  handleViewHistory,
  handleCreateQuotation,
  handleAddToCustomer,
}: LeadsTableContainerProps) {
  
  // Render table header for a column
  const renderTableHeader = (columnKey: string, columnLabel: string) => {
    switch (columnKey) {
      case "name":
        return <SortableHeader field="name">{columnLabel}</SortableHeader>;
      case "phone":
        return <SortableHeader field="phone">{columnLabel}</SortableHeader>;
      case "email":
        return <SortableHeader field="email">{columnLabel}</SortableHeader>;
      case "designation":
        return columnLabel;
      case "source":
        return (
          <div className="flex items-center justify-between">
            <span>{columnLabel}</span>
            <MultiSelectFilter options={uniqueSources} selected={sourceFilter} onSelectionChange={setSourceFilter} placeholder="Filter by Source" />
          </div>
        );
      case "status":
        return (
          <div className="flex items-center justify-between">
            <SortableHeader field="status">{columnLabel}</SortableHeader>
            <MultiSelectFilter options={Object.keys(statuses)} selected={statusFilter} onSelectionChange={setStatusFilter} placeholder="Filter by Status" />
          </div>
        );
      case "priority":
        return (
          <div className="flex items-center justify-between">
            <SortableHeader field="priority">{columnLabel}</SortableHeader>
            <MultiSelectFilter options={['1', '2', '3', '4', '5']} selected={priorityFilter} onSelectionChange={setPriorityFilter} placeholder="Filter by Priority" />
          </div>
        );
      case "assignedTo":
        return (
          <div className="flex items-center justify-between">
            <SortableHeader field="assigned_to">{columnLabel}</SortableHeader>
            <MultiSelectFilter options={uniqueAssignedTo} selected={assignedToFilter} onSelectionChange={setAssignedToFilter} placeholder="Filter by Assignment" />
          </div>
        );
      case "tasks":
        return columnLabel;
      case "nextFollowUp":
        return (
          <div className="flex items-center justify-between">
            <SortableHeader field="next_follow_up">{columnLabel}</SortableHeader>
            <DateRangeFilter dateRange={nextFollowUpRange} onDateRangeChange={setNextFollowUpRange} />
          </div>
        );
      case "createdAt":
        return (
          <div className="flex items-center justify-between">
            <SortableHeader field="created_at">{columnLabel}</SortableHeader>
            <DateRangeFilter dateRange={createdDateRange} onDateRangeChange={setCreatedDateRange} />
          </div>
        );
      case "actions":
        return columnLabel;
      default:
        return columnLabel;
    }
  };

  // Render cell based on column key
  const renderCell = (lead: Lead, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return (
          <div className="relative h-[40px] flex items-center font-medium min-w-[160px]">
            <span className="absolute inset-0 flex items-center">{lead.name}</span>
            <div className="absolute inset-0 flex items-center opacity-0 hover:opacity-100 bg-background/90 transition-opacity">
              <span className="mr-2">{lead.name}</span>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleViewLead(lead)}
                >
                  View
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleEditLeadClick(lead)}
                >
                  Edit
                </Button>
              </div>
            </div>
          </div>
        );
      case "phone":
        return (
          <div>
            <div className="flex items-center">
              <Phone className="h-3 w-3 mr-1" />
              {lead.phone}
            </div>
            {lead.alternate_phone && (
              <div className="text-xs text-muted-foreground ml-4">+{lead.alternate_phone}</div>
            )}
          </div>
        );
      case "email":
        return lead.email || "-";
      case "designation":
        return <span className="capitalize">{lead.designation}</span>;
      case "source":
        return <span className="capitalize">{lead.source.replace(/_/g, " ")}</span>;
      case "status":
        return (
          <Badge variant="secondary" className={statuses[lead.status]?.className}>
            {statuses[lead.status]?.label || lead.status}
          </Badge>
        );
      case "priority":
        return (
          <span className={priorities[lead.priority as keyof typeof priorities]?.color}>
            {priorities[lead.priority as keyof typeof priorities]?.label}
          </span>
        );
      case "assignedTo":
        return lead.assigned_to;
      case "tasks":
        return <PendingTasksBadge leadId={lead.id} leadName={lead.name} />;
      case "nextFollowUp":
        return lead.next_follow_up ? format(new Date(lead.next_follow_up), "MMM d, yyyy") : "-";
      case "createdAt":
        return format(new Date(lead.created_at), "MMM d, yyyy");
      case "actions":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleViewLead(lead)}>
                <Eye className="mr-2 h-4 w-4" />View Details
              </DropdownMenuItem>
              {canEdit("leads") && (
                <DropdownMenuItem onClick={() => handleEditLeadClick(lead)}>
                  <Edit className="mr-2 h-4 w-4" />Edit Details
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleAddFollowUp(lead)}>
                <Plus className="mr-2 h-4 w-4" />Add Follow Up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleViewHistory(lead)}>
                <Clock className="mr-2 h-4 w-4" />View History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateQuotation(lead)}>
                <FileText className="mr-2 h-4 w-4" />Create Quotation
              </DropdownMenuItem>
              {hasPermission("leads.convert") && (
                <DropdownMenuItem onClick={() => handleAddToCustomer(lead)}>
                  <UserPlus className="mr-2 h-4 w-4" />Add to Customer Database
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      default:
        return "-";
    }
  };

  return (
    <ScrollableTableContainer maxHeight="calc(100vh - 320px)">
      {/*
        NOTE: We intentionally use a plain <table> here (instead of the shadcn Table wrapper)
        so there is only ONE horizontal scroll container (ScrollableTableContainer).
        This enables the sticky top scrollbar + synced horizontal scrolling.
      */}
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-0 z-20 bg-background">
          <TableRow className="border-b-2 border-border shadow-sm">
            <TableHead className="w-12 bg-background sticky top-0">
              <Checkbox
                checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                onCheckedChange={handleSelectAll}
              />
            </TableHead>
            {visibleColumns.map((column) => (
              <TableHead key={column.key} className="bg-background sticky top-0">
                {renderTableHeader(column.key, column.label)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLeads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell>
                <Checkbox
                  checked={selectedLeads.includes(lead.id)}
                  onCheckedChange={(checked) => handleSelectLead(lead.id, checked === true)}
                />
              </TableCell>
              {visibleColumns.map((column) => (
                <TableCell key={column.key}>
                  {renderCell(lead, column.key)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </ScrollableTableContainer>
  );
}