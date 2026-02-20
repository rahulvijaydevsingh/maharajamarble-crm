import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type AppRole = "super_admin" | "admin" | "manager" | "sales_user" | "sales_viewer" | "field_agent";

export interface StaffMember {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string | null;
  role: AppRole | null;
}

export interface CreateStaffData {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: AppRole;
}

export interface UpdateStaffData {
  full_name?: string;
  phone?: string;
  is_active?: boolean;
  role?: AppRole;
}

export function useStaffManagement() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStaffMembers = async () => {
    try {
      setLoading(true);
      
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // For each profile, get their role
      const staffWithRoles: StaffMember[] = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase.rpc("get_user_role", { 
            _user_id: profile.id 
          });
          
          return {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            phone: profile.phone,
            avatar_url: profile.avatar_url,
            is_active: profile.is_active ?? true,
            created_at: profile.created_at,
            role: roleData as AppRole | null,
          };
        })
      );

      // Filter out truly deleted staff (no role + inactive)
      const filteredStaff = staffWithRoles.filter(
        (s) => !(s.role === null && s.is_active === false)
      );
      setStaffMembers(filteredStaff);
    } catch (error) {
      console.error("Error fetching staff:", error);
      toast({
        title: "Error",
        description: "Failed to load staff members",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffMembers();
  }, []);

  const createStaff = async (data: CreateStaffData): Promise<{ success: boolean; error?: string }> => {
    if (!isAdmin()) {
      return { success: false, error: "Only admins can create staff members" };
    }

    try {
      // Create user through edge function (which uses admin API)
      const { data: result, error } = await supabase.functions.invoke("create-staff-user", {
        body: {
          email: data.email,
          password: data.password,
          full_name: data.full_name,
          phone: data.phone,
          role: data.role,
        },
      });

      if (error) {
        let msg = error.message;
        try {
          const body = await (error as any).context?.json();
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      await fetchStaffMembers();
      toast({
        title: "Staff created",
        description: `${data.full_name} has been added successfully.`,
      });
      return { success: true };
    } catch (error: any) {
      console.error("Error creating staff:", error);
      const message = error.message || "Failed to create staff member";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      return { success: false, error: message };
    }
  };

  const updateStaff = async (userId: string, data: UpdateStaffData): Promise<{ success: boolean; error?: string }> => {
    if (!isAdmin()) {
      return { success: false, error: "Only admins can update staff members" };
    }

    try {
      // Update profile via edge function (bypasses RLS)
      const profileUpdates: any = {};
      if (data.full_name !== undefined) profileUpdates.full_name = data.full_name;
      if (data.phone !== undefined) profileUpdates.phone = data.phone;
      if (data.is_active !== undefined) profileUpdates.is_active = data.is_active;

      if (Object.keys(profileUpdates).length > 0) {
        const { data: result, error: profileError } = await supabase.functions.invoke("update-staff-profile", {
          body: { user_id: userId, updates: profileUpdates },
        });

        if (profileError) {
          let msg = profileError.message;
          try { const body = await (profileError as any).context?.json(); if (body?.error) msg = body.error; } catch {}
          throw new Error(msg);
        }
        if (result?.error) throw new Error(result.error);
      }

      // Update role if provided
      if (data.role) {
        const { data: result, error: roleError } = await supabase.functions.invoke("update-staff-role", {
          body: { user_id: userId, role: data.role },
        });

        if (roleError) {
          let msg = roleError.message;
          try { const body = await (roleError as any).context?.json(); if (body?.error) msg = body.error; } catch {}
          throw new Error(msg);
        }
        if (result?.error) throw new Error(result.error);
      }

      await fetchStaffMembers();
      toast({
        title: "Staff updated",
        description: "Staff member has been updated successfully.",
      });
      return { success: true };
    } catch (error: any) {
      console.error("Error updating staff:", error);
      const message = error.message || "Failed to update staff member";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      return { success: false, error: message };
    }
  };

  const deactivateStaff = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    return updateStaff(userId, { is_active: false });
  };

  const activateStaff = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    return updateStaff(userId, { is_active: true });
  };

  const resetPassword = async (userId: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!isAdmin()) {
      return { success: false, error: "Only admins can reset passwords" };
    }

    try {
      const { error } = await supabase.functions.invoke("reset-staff-password", {
        body: { user_id: userId, new_password: newPassword },
      });

      if (error) throw error;

      toast({
        title: "Password reset",
        description: "Password has been reset successfully.",
      });
      return { success: true };
    } catch (error: any) {
      console.error("Error resetting password:", error);
      const message = error.message || "Failed to reset password";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      return { success: false, error: message };
    }
  };

  return {
    staffMembers,
    loading,
    fetchStaffMembers,
    createStaff,
    updateStaff,
    deactivateStaff,
    activateStaff,
    resetPassword,
  };
}
