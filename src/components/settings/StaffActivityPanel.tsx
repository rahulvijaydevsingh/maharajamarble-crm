import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Search, Filter, X, Loader2, Download } from "lucide-react";
import { useStaffActivityLog } from "@/hooks/useStaffActivityLog";
import { useStaffManagement } from "@/hooks/useStaffManagement";
import { format } from "date-fns";

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: "Login", color: "bg-green-100 text-green-700" },
  logout: { label: "Logout", color: "bg-gray-100 text-gray-700" },
  create_lead: { label: "Lead Created", color: "bg-blue-100 text-blue-700" },
  update_lead: { label: "Lead Updated", color: "bg-blue-100 text-blue-700" },
  create_task: { label: "Task Created", color: "bg-purple-100 text-purple-700" },
  update_task: { label: "Task Updated", color: "bg-purple-100 text-purple-700" },
  create_customer: { label: "Customer Created", color: "bg-orange-100 text-orange-700" },
  update_customer: { label: "Customer Updated", color: "bg-orange-100 text-orange-700" },
  create_professional: { label: "Professional Created", color: "bg-teal-100 text-teal-700" },
  create_quotation: { label: "Quotation Created", color: "bg-yellow-100 text-yellow-700" },
  delete_staff: { label: "Staff Deleted", color: "bg-red-100 text-red-700" },
};

export function StaffActivityPanel() {
  const { activities, loading, fetchActivities } = useStaffActivityLog();
  const { staffMembers } = useStaffManagement();
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const filters: any = {};
    if (userFilter !== "all") filters.userId = userFilter;
    if (actionFilter !== "all") filters.actionType = actionFilter;
    fetchActivities(filters);
  }, [userFilter, actionFilter]);

  const filteredActivities = searchQuery
    ? activities.filter(
        (a) =>
          a.action_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.action_type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : activities;

  const uniqueActionTypes = [...new Set(activities.map((a) => a.action_type))];
  const hasFilters = userFilter !== "all" || actionFilter !== "all" || searchQuery;

  const getActionLabel = (type: string) => ACTION_TYPE_LABELS[type] || { label: type, color: "bg-gray-100 text-gray-700" };
  const getStaffName = (email: string) => {
    const staff = staffMembers.find((s) => s.email === email);
    return staff?.full_name || email;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Staff Activity Log
            </CardTitle>
            <CardDescription>
              Track all staff actions — login, logout, and everything in between
            </CardDescription>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activity..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />

            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Staff Member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffMembers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name || s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActionTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {getActionLabel(type).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setUserFilter("all");
                  setActionFilter("all");
                  setSearchQuery("");
                }}
                className="h-9"
              >
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}

            <div className="ml-auto text-sm text-muted-foreground">
              {filteredActivities.length} activities
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activity recorded yet.</p>
            <p className="text-sm mt-1">Staff actions will be logged here automatically.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities.map((activity) => {
                const actionLabel = getActionLabel(activity.action_type);
                return (
                  <TableRow key={activity.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(activity.created_at), "dd MMM yyyy, hh:mm a")}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {getStaffName(activity.user_email)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={actionLabel.color}>
                        {actionLabel.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                      {activity.action_description || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {activity.entity_type ? (
                        <Badge variant="outline" className="capitalize">
                          {activity.entity_type}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
