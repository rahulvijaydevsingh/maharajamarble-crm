import React from "react";
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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Lead } from "@/hooks/useLeads";
import { ScrollableTableContainer } from "@/components/shared/ScrollableTableContainer";

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

type SortField = "name" | "phone" | "email" | "status" | "priority" | "assigned_to" | "created_at" | "next_follow_up" | "last_follow_up" | "created_by" | null;
type SortDirection = "asc" | "desc" | null;

interface LeadsTableContainerProps {
  filteredLeads: Lead[];
  selectedLeads: string[];
  columnVisibility: ColumnVisibility;
  sortField: SortField;
  sortDirection: SortDirection;
  handleSelectAll: (checked: boolean) => void;
  handleSelectLead: (leadId: string, checked: boolean) => void;
  handleSort: (field: SortField) => void;
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
  columnVisibility,
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
  return (
    <ScrollableTableContainer maxHeight="calc(100vh - 320px)">
      <Table>
        <TableHeader className="sticky top-0 z-20 bg-background">
          <TableRow className="border-b-2 border-border shadow-sm">
            <TableHead className="w-12 bg-background sticky top-0">
              <Checkbox
                checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                onCheckedChange={handleSelectAll}
              />
            </TableHead>
            {columnVisibility.name && (
                <TableHead className="bg-background sticky top-0">
                  <SortableHeader field="name">Name</SortableHeader>
                </TableHead>
              )}
              {columnVisibility.phone && (
                <TableHead className="bg-background sticky top-0">
                  <SortableHeader field="phone">Phone</SortableHeader>
                </TableHead>
              )}
              {columnVisibility.email && (
                <TableHead className="bg-background sticky top-0">
                  <SortableHeader field="email">Email</SortableHeader>
                </TableHead>
              )}
              {columnVisibility.address && <TableHead className="bg-background sticky top-0">Address</TableHead>}
              {columnVisibility.designation && <TableHead className="bg-background sticky top-0">Designation</TableHead>}
              {columnVisibility.source && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <span>Source</span>
                    <MultiSelectFilter options={uniqueSources} selected={sourceFilter} onSelectionChange={setSourceFilter} placeholder="Filter by Source" />
                  </div>
                </TableHead>
              )}
              {columnVisibility.materials && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <span>Materials</span>
                    <MultiSelectFilter options={uniqueMaterials} selected={materialsFilter} onSelectionChange={setMaterialsFilter} placeholder="Filter by Materials" />
                  </div>
                </TableHead>
              )}
              {columnVisibility.status && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <SortableHeader field="status">Status</SortableHeader>
                    <MultiSelectFilter options={Object.keys(statuses)} selected={statusFilter} onSelectionChange={setStatusFilter} placeholder="Filter by Status" />
                  </div>
                </TableHead>
              )}
              {columnVisibility.priority && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <SortableHeader field="priority">Priority</SortableHeader>
                    <MultiSelectFilter options={['1', '2', '3', '4', '5']} selected={priorityFilter} onSelectionChange={setPriorityFilter} placeholder="Filter by Priority" />
                  </div>
                </TableHead>
              )}
              {columnVisibility.assignedTo && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <SortableHeader field="assigned_to">Assigned To</SortableHeader>
                    <MultiSelectFilter options={uniqueAssignedTo} selected={assignedToFilter} onSelectionChange={setAssignedToFilter} placeholder="Filter by Assignment" />
                  </div>
                </TableHead>
              )}
              {columnVisibility.pendingTasks && (
                <TableHead className="bg-background sticky top-0">Pending Tasks</TableHead>
              )}
              {columnVisibility.nextFollowUp && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <SortableHeader field="next_follow_up">Next Follow Up</SortableHeader>
                    <DateRangeFilter dateRange={nextFollowUpRange} onDateRangeChange={setNextFollowUpRange} />
                  </div>
                </TableHead>
              )}
              {columnVisibility.lastFollowUp && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <SortableHeader field="last_follow_up">Last Follow Up</SortableHeader>
                    <DateRangeFilter dateRange={lastFollowUpRange} onDateRangeChange={setLastFollowUpRange} />
                  </div>
                </TableHead>
              )}
              {columnVisibility.createdDate && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <SortableHeader field="created_at">Created</SortableHeader>
                    <DateRangeFilter dateRange={createdDateRange} onDateRangeChange={setCreatedDateRange} />
                  </div>
                </TableHead>
              )}
              {columnVisibility.createdBy && (
                <TableHead className="bg-background sticky top-0">
                  <div className="flex items-center justify-between">
                    <SortableHeader field="created_by">Created By</SortableHeader>
                    <MultiSelectFilter options={uniqueCreatedBy} selected={createdByFilter} onSelectionChange={setCreatedByFilter} placeholder="Filter by Creator" />
                  </div>
                </TableHead>
              )}
              {columnVisibility.constructionStage && <TableHead className="bg-background sticky top-0">Stage</TableHead>}
              {columnVisibility.estimatedQty && <TableHead className="bg-background sticky top-0">Est. Qty</TableHead>}
              <TableHead className="w-[80px] bg-background sticky top-0">Actions</TableHead>
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
                {columnVisibility.name && (
                  <TableCell className="font-medium min-w-[160px]">
                    <div className="relative h-[40px] flex items-center">
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
                  </TableCell>
                )}
                {columnVisibility.phone && (
                  <TableCell>
                    <div className="flex items-center">
                      <Phone className="h-3 w-3 mr-1" />
                      {lead.phone}
                    </div>
                    {lead.alternate_phone && (
                      <div className="text-xs text-muted-foreground ml-4">+{lead.alternate_phone}</div>
                    )}
                  </TableCell>
                )}
                {columnVisibility.email && <TableCell>{lead.email || "-"}</TableCell>}
                {columnVisibility.address && <TableCell>{lead.address || lead.site_location || "-"}</TableCell>}
                {columnVisibility.designation && <TableCell className="capitalize">{lead.designation}</TableCell>}
                {columnVisibility.source && <TableCell className="capitalize">{lead.source.replace(/_/g, " ")}</TableCell>}
                {columnVisibility.materials && (
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {((lead.material_interests as string[]) || []).slice(0, 2).map((material, index) => (
                        <Badge key={index} variant="outline" className="text-xs">{material}</Badge>
                      ))}
                      {((lead.material_interests as string[]) || []).length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{((lead.material_interests as string[]) || []).length - 2} more
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                )}
                {columnVisibility.status && (
                  <TableCell>
                    <Badge variant="secondary" className={statuses[lead.status]?.className}>
                      {statuses[lead.status]?.label || lead.status}
                    </Badge>
                  </TableCell>
                )}
                {columnVisibility.priority && (
                  <TableCell>
                    <span className={priorities[lead.priority as keyof typeof priorities]?.color}>
                      {priorities[lead.priority as keyof typeof priorities]?.label}
                    </span>
                  </TableCell>
                )}
                {columnVisibility.assignedTo && <TableCell>{lead.assigned_to}</TableCell>}
                {columnVisibility.pendingTasks && (
                  <TableCell>
                    <PendingTasksBadge leadId={lead.id} leadName={lead.name} />
                  </TableCell>
                )}
                {columnVisibility.nextFollowUp && (
                  <TableCell>
                    {lead.next_follow_up ? format(new Date(lead.next_follow_up), "MMM d, yyyy") : "-"}
                  </TableCell>
                )}
                {columnVisibility.lastFollowUp && (
                  <TableCell>
                    {lead.last_follow_up ? format(new Date(lead.last_follow_up), "MMM d, yyyy") : "-"}
                  </TableCell>
                )}
                {columnVisibility.createdDate && (
                  <TableCell>{format(new Date(lead.created_at), "MMM d, yyyy")}</TableCell>
                )}
                {columnVisibility.createdBy && <TableCell>{lead.created_by}</TableCell>}
                {columnVisibility.constructionStage && (
                  <TableCell className="capitalize">{lead.construction_stage?.replace(/_/g, " ") || "-"}</TableCell>
                )}
                {columnVisibility.estimatedQty && (
                  <TableCell>{lead.estimated_quantity ? `${lead.estimated_quantity} sq.ft` : "-"}</TableCell>
                )}
                <TableCell>
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
                </TableCell>
              </TableRow>
            ))}
            {filteredLeads.length === 0 && (
              <TableRow>
                <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                  No leads found. Add your first lead to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollableTableContainer>
    );
}
