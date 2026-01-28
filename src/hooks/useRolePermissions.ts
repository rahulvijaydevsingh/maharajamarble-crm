import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AppRole = "super_admin" | "admin" | "manager" | "sales_user" | "sales_viewer" | "field_agent";

type Permission = 
  | "leads.create" | "leads.edit" | "leads.delete" | "leads.bulk_actions" | "leads.export" | "leads.convert"
  | "customers.create" | "customers.edit" | "customers.delete" | "customers.bulk_actions"
  | "tasks.create" | "tasks.edit" | "tasks.delete" | "tasks.bulk_actions" | "tasks.assign"
  | "professionals.create" | "professionals.edit" | "professionals.delete"
  | "quotations.create" | "quotations.edit" | "quotations.delete"
  | "settings.view" | "settings.edit" | "control_panel.view" | "control_panel.edit" | "roles.manage"
  | "activity_log.add_manual" | "activity_log.edit" | "activity_log.delete";

// System roles have fixed permissions that cannot be changed
const systemRolePermissions: Record<string, Permission[]> = {
  super_admin: [
    "leads.create", "leads.edit", "leads.delete", "leads.bulk_actions", "leads.export", "leads.convert",
    "customers.create", "customers.edit", "customers.delete", "customers.bulk_actions",
    "tasks.create", "tasks.edit", "tasks.delete", "tasks.bulk_actions", "tasks.assign",
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
    "tasks.create", "tasks.edit", "tasks.delete", "tasks.bulk_actions", "tasks.assign",
    "professionals.create", "professionals.edit", "professionals.delete",
    "quotations.create", "quotations.edit", "quotations.delete",
    "settings.view", "settings.edit",
    "control_panel.view", "control_panel.edit",
    "roles.manage",
    "activity_log.add_manual", "activity_log.edit", "activity_log.delete",
  ],
};

// Default permissions for custom roles (used when no database entry exists)
const defaultCustomRolePermissions: Record<string, Permission[]> = {
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

interface RolePermissionData {
  role: string;
  permissions: string[];
}

export function useRolePermissions() {
  const [customPermissions, setCustomPermissions] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);

  // Fetch custom role permissions from database
  const fetchPermissions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('custom_role_permissions')
        .select('role, permissions');

      if (error) {
        console.error('Error fetching role permissions:', error);
        return;
      }

      const permsMap: Record<string, Permission[]> = {};
      (data || []).forEach((row: RolePermissionData) => {
        permsMap[row.role] = row.permissions as Permission[];
      });

      setCustomPermissions(permsMap);
    } catch (err) {
      console.error('Error fetching permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Get permissions for a specific role
  const getPermissionsForRole = useCallback((role: AppRole): Permission[] => {
    // System roles have fixed permissions
    if (systemRolePermissions[role]) {
      return systemRolePermissions[role];
    }

    // Check if we have custom permissions in database
    if (customPermissions[role]) {
      return customPermissions[role];
    }

    // Fall back to defaults
    return defaultCustomRolePermissions[role] || [];
  }, [customPermissions]);

  // Update permissions for a custom role
  const updatePermissions = useCallback(async (role: AppRole, permissions: Permission[]): Promise<boolean> => {
    // Cannot update system roles
    if (systemRolePermissions[role]) {
      toast.error('System roles cannot be modified');
      return false;
    }

    try {
      const { error } = await supabase
        .from('custom_role_permissions')
        .upsert({
          role,
          permissions,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'role',
        });

      if (error) {
        console.error('Error updating permissions:', error);
        toast.error('Failed to update permissions');
        return false;
      }

      // Update local state
      setCustomPermissions(prev => ({
        ...prev,
        [role]: permissions,
      }));

      toast.success('Permissions updated successfully');
      return true;
    } catch (err) {
      console.error('Error updating permissions:', err);
      toast.error('Failed to update permissions');
      return false;
    }
  }, []);

  // Check if a role is a system role (not editable)
  const isSystemRole = useCallback((role: AppRole): boolean => {
    return !!systemRolePermissions[role];
  }, []);

  return {
    loading,
    getPermissionsForRole,
    updatePermissions,
    isSystemRole,
    refetch: fetchPermissions,
  };
}