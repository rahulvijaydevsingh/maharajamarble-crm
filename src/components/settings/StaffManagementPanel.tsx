import React, { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Edit,
  Search,
  Users,
  MoreVertical,
  UserX,
  UserCheck,
  Key,
  Loader2,
  Filter,
  X,
  Info,
} from "lucide-react";
import { useStaffManagement, StaffMember, CreateStaffData } from "@/hooks/useStaffManagement";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";

type AppRole = "super_admin" | "admin" | "manager" | "sales_user" | "sales_viewer" | "field_agent";

interface RoleOption {
  value: AppRole;
  label: string;
  description: string;
  badgeVariant: "destructive" | "default" | "secondary" | "outline";
}

const ROLES: RoleOption[] = [
  { value: "super_admin", label: "Super Admin", description: "Full system access with all permissions", badgeVariant: "destructive" },
  { value: "admin", label: "Admin", description: "Administrative access with full control", badgeVariant: "default" },
  { value: "manager", label: "Manager", description: "Team management and operational access", badgeVariant: "secondary" },
  { value: "sales_user", label: "Sales User", description: "Standard sales operations access", badgeVariant: "outline" },
  { value: "sales_viewer", label: "Sales Viewer", description: "Read-only access with export capability", badgeVariant: "outline" },
  { value: "field_agent", label: "Field Agent", description: "Limited field operations access", badgeVariant: "outline" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function StaffManagementPanel() {
  const { user } = useAuth();
  const {
    staffMembers,
    loading,
    createStaff,
    updateStaff,
    deactivateStaff,
    activateStaff,
    resetPassword,
  } = useStaffManagement();

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add form state
  const [addForm, setAddForm] = useState({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    role: "sales_user" as AppRole,
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    full_name: "",
    phone: "",
    role: "sales_user" as AppRole,
  });

  // Reset password form state
  const [newPassword, setNewPassword] = useState("");

  // Check if any filters are active
  const hasActiveFilters = roleFilter !== "all" || statusFilter !== "all";

  // Clear all filters
  const clearFilters = () => {
    setRoleFilter("all");
    setStatusFilter("all");
    setSearchQuery("");
  };

  const filteredStaff = useMemo(() => {
    let result = staffMembers;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.full_name?.toLowerCase().includes(query) ||
          s.email?.toLowerCase().includes(query) ||
          s.role?.toLowerCase().includes(query)
      );
    }

    // Apply role filter
    if (roleFilter !== "all") {
      result = result.filter((s) => s.role === roleFilter);
    }

    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter((s) => 
        statusFilter === "active" ? s.is_active : !s.is_active
      );
    }

    return result;
  }, [staffMembers, searchQuery, roleFilter, statusFilter]);

  const handleAddStaff = async () => {
    if (!addForm.email || !addForm.password || !addForm.full_name) return;

    setIsSubmitting(true);
    const result = await createStaff(addForm as CreateStaffData);
    setIsSubmitting(false);

    if (result.success) {
      setAddDialogOpen(false);
      setAddForm({
        email: "",
        password: "",
        full_name: "",
        phone: "",
        role: "sales_user",
      });
    }
  };

  const openEditDialog = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setEditForm({
      full_name: staff.full_name || "",
      phone: staff.phone || "",
      role: staff.role || "sales_user",
    });
    setEditDialogOpen(true);
  };

  const handleEditStaff = async () => {
    if (!selectedStaff) return;

    setIsSubmitting(true);
    const result = await updateStaff(selectedStaff.id, editForm);
    setIsSubmitting(false);

    if (result.success) {
      setEditDialogOpen(false);
      setSelectedStaff(null);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedStaff) return;

    setIsSubmitting(true);
    const result = selectedStaff.is_active
      ? await deactivateStaff(selectedStaff.id)
      : await activateStaff(selectedStaff.id);
    setIsSubmitting(false);

    if (result.success) {
      setDeactivateConfirmOpen(false);
      setSelectedStaff(null);
    }
  };

  const openResetPasswordDialog = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setNewPassword("");
    setResetPasswordDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!selectedStaff || !newPassword) return;

    setIsSubmitting(true);
    const result = await resetPassword(selectedStaff.id, newPassword);
    setIsSubmitting(false);

    if (result.success) {
      setResetPasswordDialogOpen(false);
      setSelectedStaff(null);
      setNewPassword("");
    }
  };

  const getRoleOption = (role: AppRole | null) => {
    return ROLES.find((r) => r.value === role);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Staff Management
            </CardTitle>
            <CardDescription>
              Manage staff members, assign roles, and control access permissions
            </CardDescription>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Staff
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col gap-3 mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as AppRole | "all")}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="mr-1 h-4 w-4" />
                Clear Filters
              </Button>
            )}

            <div className="ml-auto text-sm text-muted-foreground">
              Showing {filteredStaff.length} of {staffMembers.length} staff
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStaff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {hasActiveFilters 
                      ? "No staff members match your filters" 
                      : "No staff members found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredStaff.map((staff) => {
                  const roleOption = getRoleOption(staff.role);
                  return (
                    <TableRow key={staff.id} className={!staff.is_active ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{staff.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{staff.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{staff.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={roleOption?.badgeVariant || "outline"}>
                          {roleOption?.label || staff.role || "No Role"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={staff.is_active ? "default" : "secondary"}>
                          {staff.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(staff)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Staff
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openResetPasswordDialog(staff)}>
                              <Key className="mr-2 h-4 w-4" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {staff.id !== user?.id && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedStaff(staff);
                                  setDeactivateConfirmOpen(true);
                                }}
                                className={staff.is_active ? "text-destructive" : "text-green-600"}
                              >
                                {staff.is_active ? (
                                  <>
                                    <UserX className="mr-2 h-4 w-4" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Activate
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add Staff Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Staff Member</DialogTitle>
            <DialogDescription>
              Create a new staff account with login credentials and assign a role
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              <Separator />
              <div className="text-sm font-medium text-muted-foreground">Personal Information</div>
              
              <div className="space-y-2">
                <Label htmlFor="add-name">Full Name *</Label>
                <Input
                  id="add-name"
                  value={addForm.full_name}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-email">Email *</Label>
                <Input
                  id="add-email"
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="john@company.com"
                />
                <p className="text-xs text-muted-foreground">Used for login - must be unique</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-phone">Phone</Label>
                <Input
                  id="add-phone"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+91 1234567890"
                />
              </div>

              <Separator />
              <div className="text-sm font-medium text-muted-foreground">Role & Permissions</div>

              <div className="space-y-2">
                <Label htmlFor="add-role">Assign Role *</Label>
                <Select
                  value={addForm.role}
                  onValueChange={(value: AppRole) => setAddForm((prev) => ({ ...prev, role: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex flex-col">
                          <span>{role.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {addForm.role && (
                  <div className="flex items-start gap-2 p-2 rounded bg-muted/50">
                    <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {ROLES.find(r => r.value === addForm.role)?.description}
                    </p>
                  </div>
                )}
              </div>

              <Separator />
              <div className="text-sm font-medium text-muted-foreground">Account Settings</div>

              <div className="space-y-2">
                <Label htmlFor="add-password">Password *</Label>
                <Input
                  id="add-password"
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddStaff} 
              disabled={isSubmitting || !addForm.email || !addForm.password || !addForm.full_name}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>
              Update staff information and role assignment
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              <div className="p-3 rounded-md bg-muted/50">
                <p className="text-sm font-medium">{selectedStaff?.full_name}</p>
                <p className="text-xs text-muted-foreground">{selectedStaff?.email}</p>
              </div>

              <Separator />
              <div className="text-sm font-medium text-muted-foreground">Personal Information</div>

              <div className="space-y-2">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, full_name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              <Separator />
              <div className="text-sm font-medium text-muted-foreground">Role Assignment</div>

              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(value: AppRole) => setEditForm((prev) => ({ ...prev, role: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editForm.role && (
                  <div className="flex items-start gap-2 p-2 rounded bg-muted/50">
                    <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {ROLES.find(r => r.value === editForm.role)?.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditStaff} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {selectedStaff?.full_name || selectedStaff?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password *</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
              <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={isSubmitting || !newPassword}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate/Activate Confirmation */}
      <AlertDialog open={deactivateConfirmOpen} onOpenChange={setDeactivateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedStaff?.is_active ? "Deactivate" : "Activate"} Staff Member?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedStaff?.is_active
                ? `"${selectedStaff?.full_name || selectedStaff?.email}" will no longer be able to access the system. You can reactivate them later.`
                : `"${selectedStaff?.full_name || selectedStaff?.email}" will regain access to the system with their assigned role.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className={selectedStaff?.is_active ? "bg-destructive text-destructive-foreground" : ""}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedStaff?.is_active ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
