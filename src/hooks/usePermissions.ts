import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "super_admin" | "admin" | "manager" | "sales_user" | "sales_viewer" | "field_agent";

type Permission = 
  | "leads.create"
  | "leads.edit"
  | "leads.delete"
  | "leads.bulk_actions"
  | "leads.export"
  | "leads.convert"
  | "customers.create"
  | "customers.edit"
  | "customers.delete"
  | "customers.bulk_actions"
  | "tasks.create"
  | "tasks.edit"
  | "tasks.delete"
  | "tasks.bulk_actions"
  | "tasks.assign"
  | "tasks.status_override"
  | "professionals.create"
  | "professionals.edit"
  | "professionals.delete"
  | "quotations.create"
  | "quotations.edit"
  | "quotations.delete"
  | "settings.view"
  | "settings.edit"
  | "control_panel.view"
  | "control_panel.edit"
  | "roles.manage"
  | "activity_log.add_manual"
  | "activity_log.edit"
  | "activity_log.delete";

// System roles have fixed permissions
const systemRolePermissions: Record<string, Permission[]> = {
  super_admin: [
    "leads.create", "leads.edit", "leads.delete", "leads.bulk_actions", "leads.export", "leads.convert",
    "customers.create", "customers.edit", "customers.delete", "customers.bulk_actions",
    "tasks.create", "tasks.edit", "tasks.delete", "tasks.bulk_actions", "tasks.assign", "tasks.status_override",
    "professionals.create", "professionals.edit", "professionals.delete",
    "quotations.create", "quotations.edit", "quotations.delete",
    "settings.view", "settings.edit",
    "control_panel.view", "control_panel.edit",
    "roles.manage",
    "activity_log.add_manual", "activity_log.edit", "activity_log.delete",
  ],
  admin: [
    "leads.create", "leads.edit", "leads.delete", "leads.bulk_actions", "leads.export", "leads.convert",
    "customers.create", "customers.edit", "customers.delete", "customers.bulk_actions",
    "tasks.create", "tasks.edit", "tasks.delete", "tasks.bulk_actions", "tasks.assign", "tasks.status_override",
    "professionals.create", "professionals.edit", "professionals.delete",
    "quotations.create", "quotations.edit", "quotations.delete",
    "settings.view", "settings.edit",
    "control_panel.view", "control_panel.edit",
    "roles.manage",
    "activity_log.add_manual", "activity_log.edit", "activity_log.delete",
  ],
};

// Default permissions for custom roles (fallback when no database entry exists)
const defaultRolePermissions: Record<AppRole, Permission[]> = {
  super_admin: systemRolePermissions.super_admin,
  admin: systemRolePermissions.admin,
  manager: [
    "leads.create", "leads.edit", "leads.bulk_actions", "leads.export", "leads.convert",
    "customers.create", "customers.edit", "customers.bulk_actions",
    "tasks.create", "tasks.edit", "tasks.bulk_actions", "tasks.assign",
    "professionals.create", "professionals.edit",
    "quotations.create", "quotations.edit",
  ],
  sales_user: [
    "leads.create", "leads.edit", "leads.export",
    "customers.create", "customers.edit",
    "tasks.create", "tasks.edit",
    "professionals.create", "professionals.edit",
    "quotations.create", "quotations.edit",
  ],
  field_agent: [
    "leads.create", "leads.edit",
    "tasks.create", "tasks.edit",
  ],
  sales_viewer: [
    "leads.export",
  ],
};

export function usePermissions() {
  const { role } = useAuth();
  const [customPermissions, setCustomPermissions] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);

  // Fetch custom permissions from database
  useEffect(() => {
    const fetchCustomPermissions = async () => {
      try {
        const { data, error } = await supabase
          .from('custom_role_permissions')
          .select('role, permissions');

        if (error) {
          console.error('Error fetching custom permissions:', error);
          setLoading(false);
          return;
        }

        const permsMap: Record<string, Permission[]> = {};
        (data || []).forEach((row: { role: string; permissions: string[] }) => {
          permsMap[row.role] = row.permissions as Permission[];
        });

        setCustomPermissions(permsMap);
      } catch (err) {
        console.error('Error fetching permissions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomPermissions();
  }, []);

  const getPermissionsForRole = (r: AppRole | null): Permission[] => {
    if (!r) return [];
    
    // System roles use fixed permissions
    if (systemRolePermissions[r]) {
      return systemRolePermissions[r];
    }

    // Check database for custom permissions
    if (customPermissions[r]) {
      return customPermissions[r];
    }

    // Fall back to defaults
    return defaultRolePermissions[r] || [];
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!role) return false;
    const permissions = getPermissionsForRole(role);
    return permissions.includes(permission);
  };

  const canCreate = (entity: "leads" | "customers" | "tasks" | "professionals" | "quotations"): boolean => {
    return hasPermission(`${entity}.create` as Permission);
  };

  const canEdit = (entity: "leads" | "customers" | "tasks" | "professionals" | "quotations"): boolean => {
    return hasPermission(`${entity}.edit` as Permission);
  };

  const canDelete = (entity: "leads" | "customers" | "tasks" | "professionals"): boolean => {
    return hasPermission(`${entity}.delete` as Permission);
  };

  const canBulkAction = (entity: "leads" | "customers" | "tasks"): boolean => {
    return hasPermission(`${entity}.bulk_actions` as Permission);
  };

  const canAccessControlPanel = (): boolean => {
    return hasPermission("control_panel.view");
  };

  const canManageRoles = (): boolean => {
    return hasPermission("roles.manage");
  };

  return {
    hasPermission,
    canCreate,
    canEdit,
    canDelete,
    canBulkAction,
    canAccessControlPanel,
    canManageRoles,
    role,
    loading,
  };
}