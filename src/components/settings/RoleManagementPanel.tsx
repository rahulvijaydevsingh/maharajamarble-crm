import React, { useState, useMemo, useEffect } from "react";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield,
  Users,
  Search,
  Eye,
  Edit,
  Trash2,
  Plus,
  Info,
  Loader2,
  Save,
} from "lucide-react";
import { useStaffManagement } from "@/hooks/useStaffManagement";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { toast } from "sonner";

type AppRole = "super_admin" | "admin" | "manager" | "sales_user" | "sales_viewer" | "field_agent";

type Permission = 
  | "leads.create" | "leads.edit" | "leads.delete" | "leads.bulk_actions" | "leads.export" | "leads.convert"
  | "customers.create" | "customers.edit" | "customers.delete" | "customers.bulk_actions"
  | "tasks.create" | "tasks.edit" | "tasks.delete" | "tasks.bulk_actions" | "tasks.assign" | "tasks.status_override"
  | "professionals.create" | "professionals.edit" | "professionals.delete"
  | "quotations.create" | "quotations.edit" | "quotations.delete"
  | "settings.view" | "settings.edit" | "control_panel.view" | "control_panel.edit" | "roles.manage"
  | "activity_log.add_manual" | "activity_log.edit" | "activity_log.delete";

interface PermissionInfo {
  id: Permission;
  name: string;
  description: string;
  module: string;
}

// All available permissions in the system
const availablePermissions: PermissionInfo[] = [
  // Leads
  { id: "leads.create", name: "Create Leads", description: "Create new leads in the system", module: "Leads" },
  { id: "leads.edit", name: "Edit Leads", description: "Modify existing lead information", module: "Leads" },
  { id: "leads.delete", name: "Delete Leads", description: "Permanently remove leads", module: "Leads" },
  { id: "leads.bulk_actions", name: "Bulk Actions", description: "Perform bulk operations on leads", module: "Leads" },
  { id: "leads.export", name: "Export Leads", description: "Export lead data to files", module: "Leads" },
  { id: "leads.convert", name: "Convert Leads", description: "Convert leads to customers", module: "Leads" },
  // Customers
  { id: "customers.create", name: "Create Customers", description: "Add new customers", module: "Customers" },
  { id: "customers.edit", name: "Edit Customers", description: "Modify customer details", module: "Customers" },
  { id: "customers.delete", name: "Delete Customers", description: "Remove customers", module: "Customers" },
  { id: "customers.bulk_actions", name: "Bulk Actions", description: "Bulk customer operations", module: "Customers" },
  // Tasks
  { id: "tasks.create", name: "Create Tasks", description: "Create new tasks", module: "Tasks" },
  { id: "tasks.edit", name: "Edit Tasks", description: "Modify tasks", module: "Tasks" },
  { id: "tasks.delete", name: "Delete Tasks", description: "Remove tasks", module: "Tasks" },
  { id: "tasks.bulk_actions", name: "Bulk Actions", description: "Bulk task operations", module: "Tasks" },
  { id: "tasks.assign", name: "Assign Tasks", description: "Assign tasks to team members", module: "Tasks" },
  { id: "tasks.status_override", name: "Override Task Status", description: "Manually override automated task status", module: "Tasks" },
  // Professionals
  { id: "professionals.create", name: "Create Professionals", description: "Add new professionals", module: "Professionals" },
  { id: "professionals.edit", name: "Edit Professionals", description: "Modify professional details", module: "Professionals" },
  { id: "professionals.delete", name: "Delete Professionals", description: "Remove professionals", module: "Professionals" },
  // Quotations
  { id: "quotations.create", name: "Create Quotations", description: "Create new quotations", module: "Quotations" },
  { id: "quotations.edit", name: "Edit Quotations", description: "Modify quotations", module: "Quotations" },
  { id: "quotations.delete", name: "Delete Quotations", description: "Remove quotations", module: "Quotations" },
  // Settings
  { id: "settings.view", name: "View Settings", description: "Access system settings", module: "Settings" },
  { id: "settings.edit", name: "Edit Settings", description: "Modify system settings", module: "Settings" },
  { id: "control_panel.view", name: "View Control Panel", description: "Access control panel", module: "Settings" },
  { id: "control_panel.edit", name: "Edit Control Panel", description: "Modify control panel", module: "Settings" },
  { id: "roles.manage", name: "Manage Roles", description: "Manage user roles and permissions", module: "Settings" },
  // Activity Log
  { id: "activity_log.add_manual", name: "Add Manual Activity", description: "Add manual activity entries", module: "Activity Log" },
  { id: "activity_log.edit", name: "Edit Activity", description: "Edit activity entries", module: "Activity Log" },
  { id: "activity_log.delete", name: "Delete Activity", description: "Delete activity entries", module: "Activity Log" },
];

interface RoleInfo {
  id: AppRole;
  name: string;
  description: string;
  isSystemRole: boolean;
  badgeVariant: "destructive" | "default" | "secondary" | "outline";
}

// Role definitions
const roles: RoleInfo[] = [
  { id: "super_admin", name: "Super Admin", description: "Full system access with all permissions. Cannot be modified.", isSystemRole: true, badgeVariant: "destructive" },
  { id: "admin", name: "Admin", description: "Administrative access with full control over users and settings.", isSystemRole: true, badgeVariant: "default" },
  { id: "manager", name: "Manager", description: "Team management with operational access to leads, customers, and tasks.", isSystemRole: false, badgeVariant: "secondary" },
  { id: "sales_user", name: "Sales User", description: "Standard sales operations including lead and customer management.", isSystemRole: false, badgeVariant: "outline" },
  { id: "field_agent", name: "Field Agent", description: "Limited access for field operations - leads and tasks only.", isSystemRole: false, badgeVariant: "outline" },
  { id: "sales_viewer", name: "Sales Viewer", description: "Read-only access with export capability.", isSystemRole: false, badgeVariant: "outline" },
];

export function RoleManagementPanel() {
  const { staffMembers } = useStaffManagement();
  const { loading: permissionsLoading, getPermissionsForRole, updatePermissions, isSystemRole } = useRolePermissions();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");
  const [viewingRole, setViewingRole] = useState<RoleInfo | null>(null);
  const [viewingUsersForRole, setViewingUsersForRole] = useState<AppRole | null>(null);
  
  // Edit Role Dialog State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleInfo | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Permission[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Delete Role Dialog State
  const [deletingRole, setDeletingRole] = useState<RoleInfo | null>(null);

  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    const groups: { [key: string]: PermissionInfo[] } = {};
    availablePermissions.forEach(p => {
      if (!groups[p.module]) groups[p.module] = [];
      groups[p.module].push(p);
    });
    return groups;
  }, []);

  // Calculate user count per role
  const userCountByRole = useMemo(() => {
    const counts: Record<AppRole, number> = {
      super_admin: 0,
      admin: 0,
      manager: 0,
      sales_user: 0,
      sales_viewer: 0,
      field_agent: 0,
    };
    staffMembers.forEach(staff => {
      if (staff.role && counts[staff.role] !== undefined) {
        counts[staff.role]++;
      }
    });
    return counts;
  }, [staffMembers]);

  // Filter roles based on search
  const filteredRoles = useMemo(() => {
    if (!searchQuery) return roles;
    const query = searchQuery.toLowerCase();
    return roles.filter(r => 
      r.name.toLowerCase().includes(query) || 
      r.description.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Open Edit Role Dialog
  const handleEditRole = (role: RoleInfo) => {
    if (role.isSystemRole) {
      toast.info("System roles cannot be edited. You can view their permissions instead.");
      setViewingRole(role);
      return;
    }
    setEditingRole(role);
    setEditingPermissions([...getPermissionsForRole(role.id)]);
    setIsEditDialogOpen(true);
  };

  // Handle permission toggle
  const handlePermissionToggle = (permissionId: Permission) => {
    setEditingPermissions(prev => 
      prev.includes(permissionId)
        ? prev.filter(p => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  // Handle module toggle (select/deselect all in module)
  const handleModuleToggle = (module: string) => {
    const modulePerms = groupedPermissions[module].map(p => p.id);
    const allSelected = modulePerms.every(p => editingPermissions.includes(p));
    
    setEditingPermissions(prev => 
      allSelected
        ? prev.filter(p => !modulePerms.includes(p))
        : [...new Set([...prev, ...modulePerms])]
    );
  };

  // Save role permissions
  const handleSavePermissions = async () => {
    if (!editingRole) return;
    
    setIsSaving(true);
    const success = await updatePermissions(editingRole.id, editingPermissions);
    setIsSaving(false);
    
    if (success) {
      setIsEditDialogOpen(false);
      setEditingRole(null);
    }
  };

  // Handle delete role
  const handleDeleteRole = (role: RoleInfo) => {
    if (role.isSystemRole) {
      toast.error("System roles cannot be deleted");
      return;
    }
    setDeletingRole(role);
  };

  // Confirm delete
  const confirmDeleteRole = () => {
    if (!deletingRole) return;
    
    const usersWithRole = userCountByRole[deletingRole.id] || 0;
    if (usersWithRole > 0) {
      toast.error(`Cannot delete role. ${usersWithRole} user(s) are assigned to this role. Reassign them first.`);
      setDeletingRole(null);
      return;
    }
    
    toast.success(`Role "${deletingRole.name}" deleted successfully`);
    setDeletingRole(null);
  };

  // Filter users based on search and role filter
  const filteredUsers = useMemo(() => {
    let users = staffMembers;
    if (viewingUsersForRole) {
      users = staffMembers.filter(u => u.role === viewingUsersForRole);
    }
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(u => 
      u.full_name?.toLowerCase().includes(query) || 
      u.email?.toLowerCase().includes(query)
    );
  }, [staffMembers, searchQuery, viewingUsersForRole]);

  const getRoleName = (roleId: AppRole | null) => {
    const role = roles.find(r => r.id === roleId);
    return role?.name || roleId || "No Role";
  };

  const getRoleBadgeVariant = (roleId: AppRole | null) => {
    const role = roles.find(r => r.id === roleId);
    return role?.badgeVariant || "outline";
  };

  if (permissionsLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Role Management
            </CardTitle>
            <CardDescription>
              Manage roles and permissions. Click on a custom role to edit its permissions.
            </CardDescription>
          </div>
        </div>
        
        {/* Tab Buttons */}
        <div className="flex gap-2 mt-4">
          <Button 
            variant={activeTab === "roles" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setActiveTab("roles");
              setViewingUsersForRole(null);
            }}
          >
            <Shield className="mr-2 h-4 w-4" />
            Roles ({roles.length})
          </Button>
          <Button 
            variant={activeTab === "users" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("users")}
          >
            <Users className="mr-2 h-4 w-4" />
            Users by Role ({staffMembers.length})
          </Button>
        </div>
        
        {/* Search */}
        <div className="flex gap-2 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={activeTab === "roles" ? "Search roles..." : "Search users..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Role filter pills for Users tab */}
        {activeTab === "users" && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant={viewingUsersForRole === null ? "default" : "outline"}
              size="sm"
              onClick={() => setViewingUsersForRole(null)}
            >
              All ({staffMembers.length})
            </Button>
            {roles.map(role => (
              <Button
                key={role.id}
                variant={viewingUsersForRole === role.id ? "default" : "outline"}
                size="sm"
                onClick={() => setViewingUsersForRole(role.id)}
              >
                {role.name} ({userCountByRole[role.id]})
              </Button>
            ))}
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {activeTab === "roles" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((role) => {
                const permissions = getPermissionsForRole(role.id);
                return (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Badge variant={role.badgeVariant}>{role.name}</Badge>
                        {role.isSystemRole && (
                          <Badge variant="secondary" className="text-xs">System</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[300px] truncate">
                      {role.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {permissions.length} / {availablePermissions.length}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => {
                          setViewingUsersForRole(role.id);
                          setActiveTab("users");
                        }}
                      >
                        <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                          {userCountByRole[role.id]} users
                        </Badge>
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setViewingRole(role)}
                          title="View permissions"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!role.isSystemRole && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditRole(role)}
                            title="Edit permissions"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {getRoleName(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? "default" : "secondary"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* Info note */}
        <div className="flex items-start gap-2 mt-4 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            System roles (Super Admin, Admin) cannot be modified. Custom roles (Manager, Sales User, Field Agent, Sales Viewer) can have their permissions edited by clicking the Edit button.
          </p>
        </div>
      </CardContent>

      {/* View Role Permissions Dialog */}
      <Dialog open={!!viewingRole} onOpenChange={(open) => !open && setViewingRole(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Badge variant={viewingRole?.badgeVariant}>{viewingRole?.name}</Badge>
              Permissions
            </DialogTitle>
            <DialogDescription>
              {viewingRole?.description}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="space-y-6">
              {Object.entries(groupedPermissions).map(([module, perms]) => {
                const rolePerms = viewingRole ? getPermissionsForRole(viewingRole.id) : [];
                const moduleGrantedCount = perms.filter(p => rolePerms.includes(p.id)).length;
                
                return (
                  <div key={module} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">{module}</h4>
                      <Badge variant="outline" className="text-xs">
                        {moduleGrantedCount} / {perms.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {perms.map((perm) => {
                        const hasPermission = rolePerms.includes(perm.id);
                        return (
                          <div
                            key={perm.id}
                            className={`flex items-center space-x-3 p-2 rounded-md ${
                              hasPermission ? "bg-primary/5" : "bg-muted/30 opacity-50"
                            }`}
                          >
                            <Checkbox checked={hasPermission} disabled className="pointer-events-none" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{perm.name}</p>
                              <p className="text-xs text-muted-foreground">{perm.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Role Permissions Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => !open && setIsEditDialogOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[85vh] h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              Edit Permissions: 
              <Badge variant={editingRole?.badgeVariant}>{editingRole?.name}</Badge>
            </DialogTitle>
            <DialogDescription>
              {editingRole?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-shrink-0 space-y-2">
            <p className="text-sm text-muted-foreground">
              Selected: {editingPermissions.length} / {availablePermissions.length} permissions
            </p>
          </div>
          
          <ScrollArea className="flex-1 min-h-0 pr-4 border rounded-md p-3">
            <div className="space-y-6">
              {Object.entries(groupedPermissions).map(([module, perms]) => {
                const modulePerms = perms.map(p => p.id);
                const allSelected = modulePerms.every(p => editingPermissions.includes(p));
                const someSelected = modulePerms.some(p => editingPermissions.includes(p));
                
                return (
                  <div key={module} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          checked={allSelected}
                          onCheckedChange={() => handleModuleToggle(module)}
                          className={someSelected && !allSelected ? "data-[state=checked]:bg-primary/50" : ""}
                        />
                        <h4 className="font-medium text-sm">{module}</h4>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {perms.filter(p => editingPermissions.includes(p.id)).length} / {perms.length}
                      </Badge>
                    </div>
                    <div className="space-y-2 ml-6">
                      {perms.map((perm) => {
                        const isSelected = editingPermissions.includes(perm.id);
                        return (
                          <div
                            key={perm.id}
                            className={`flex items-center space-x-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                              isSelected ? "bg-primary/5" : ""
                            }`}
                            onClick={() => handlePermissionToggle(perm.id)}
                          >
                            <Checkbox 
                              checked={isSelected} 
                              onCheckedChange={() => handlePermissionToggle(perm.id)}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{perm.name}</p>
                              <p className="text-xs text-muted-foreground">{perm.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSavePermissions} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Permissions
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirmation Dialog */}
      <AlertDialog open={!!deletingRole} onOpenChange={(open) => !open && setDeletingRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role: {deletingRole?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {userCountByRole[deletingRole?.id || "manager"] > 0 ? (
                <>
                  <span className="text-destructive font-medium">
                    Warning: {userCountByRole[deletingRole?.id || "manager"]} user(s) are assigned to this role.
                  </span>
                  <br />
                  You must reassign these users to a different role before deleting.
                </>
              ) : (
                "This action cannot be undone. This will permanently delete the role and remove it from the system."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteRole}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}