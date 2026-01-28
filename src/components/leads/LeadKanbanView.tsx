import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, Mail, MapPin, Calendar, User, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { Lead } from "@/hooks/useLeads";

interface LeadKanbanViewProps {
  leads: Lead[];
  onLeadUpdate: (id: string, updates: Partial<Lead>) => void;
  onEditLead: (lead: Lead) => void;
}

const KANBAN_FIELDS = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assigned_to", label: "Assigned To" },
  { value: "source", label: "Source" },
  { value: "construction_stage", label: "Construction Stage" },
];

const STATUS_OPTIONS = ["new", "in-progress", "quoted", "won", "lost"];
const PRIORITY_OPTIONS = ["1", "2", "3", "4", "5"];

const statusLabels: Record<string, string> = {
  new: "New",
  "in-progress": "In Progress",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

const priorityLabels: Record<string, string> = {
  "1": "Very High",
  "2": "High",
  "3": "Medium",
  "4": "Low",
  "5": "Very Low",
};

const statusColors: Record<string, string> = {
  new: "bg-blue-100 border-blue-300",
  "in-progress": "bg-yellow-100 border-yellow-300",
  quoted: "bg-purple-100 border-purple-300",
  won: "bg-green-100 border-green-300",
  lost: "bg-red-100 border-red-300",
};

export function LeadKanbanView({ leads, onLeadUpdate, onEditLead }: LeadKanbanViewProps) {
  const [groupBy, setGroupBy] = useState("status");
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);

  // Get unique column values based on groupBy field
  const columns = useMemo(() => {
    if (groupBy === "status") return STATUS_OPTIONS;
    if (groupBy === "priority") return PRIORITY_OPTIONS;
    
    const uniqueValues = new Set<string>();
    leads.forEach((lead) => {
      const value = lead[groupBy as keyof Lead];
      if (value !== null && value !== undefined) {
        uniqueValues.add(String(value));
      }
    });
    return Array.from(uniqueValues).sort();
  }, [leads, groupBy]);

  // Group leads by selected field
  const groupedLeads = useMemo(() => {
    const groups: Record<string, Lead[]> = {};
    columns.forEach((col) => {
      groups[col] = [];
    });
    
    leads.forEach((lead) => {
      const value = String(lead[groupBy as keyof Lead] || "");
      if (groups[value]) {
        groups[value].push(lead);
      } else {
        // Put in first column if value doesn't match
        if (columns.length > 0) {
          groups[columns[0]]?.push(lead);
        }
      }
    });
    
    return groups;
  }, [leads, groupBy, columns]);

  const getColumnLabel = (value: string) => {
    if (groupBy === "status") return statusLabels[value] || value;
    if (groupBy === "priority") return priorityLabels[value] || `Priority ${value}`;
    return value || "Unassigned";
  };

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    if (draggedLead && String(draggedLead[groupBy as keyof Lead]) !== targetColumn) {
      const updates: Partial<Lead> = {};
      
      if (groupBy === "status") {
        updates.status = targetColumn;
      } else if (groupBy === "priority") {
        updates.priority = parseInt(targetColumn);
      } else if (groupBy === "assigned_to") {
        updates.assigned_to = targetColumn;
      } else if (groupBy === "source") {
        updates.source = targetColumn;
      } else if (groupBy === "construction_stage") {
        updates.construction_stage = targetColumn;
      }
      
      onLeadUpdate(draggedLead.id, updates);
    }
    setDraggedLead(null);
  };

  return (
    <div className="space-y-4">
      {/* Group By Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Group by:</span>
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KANBAN_FIELDS.map((field) => (
              <SelectItem key={field.value} value={field.value}>
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column}
            className="flex-shrink-0 w-[300px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column)}
          >
            <Card className={`h-full ${statusColors[column] || "bg-gray-50 border-gray-200"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span>{getColumnLabel(column)}</span>
                  <Badge variant="secondary" className="ml-2">
                    {groupedLeads[column]?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                {groupedLeads[column]?.map((lead) => (
                  <Card
                    key={lead.id}
                    className="cursor-pointer hover:shadow-md transition-shadow bg-background"
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead)}
                    onClick={() => onEditLead(lead)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{lead.name}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Phone className="h-3 w-3" />
                            <span>{lead.phone}</span>
                          </div>
                          {lead.email && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}
                          {lead.site_location && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{lead.site_location}</span>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(lead.material_interests as string[] || [])?.slice(0, 2).map((mat) => (
                              <Badge key={mat} variant="outline" className="text-xs">
                                {mat}
                              </Badge>
                            ))}
                            {((lead.material_interests as string[] || [])?.length || 0) > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{((lead.material_interests as string[] || [])?.length || 0) - 2}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>{lead.assigned_to}</span>
                            </div>
                            {lead.next_follow_up && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{format(new Date(lead.next_follow_up), "MMM d")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!groupedLeads[column] || groupedLeads[column].length === 0) && (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    No leads
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
