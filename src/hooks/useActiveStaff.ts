import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveStaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales_user: "Sales User",
  field_agent: "Field Agent",
  viewer: "Viewer",
};

function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABELS[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useActiveStaff() {
  const [staffMembers, setStaffMembers] = useState<ActiveStaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveStaff = async () => {
    try {
      setLoading(true);

      // Fetch profiles + roles in two parallel queries (single round trip each,
      // no N+1). Works for every RLS tier because user_roles SELECT is granted
      // to authenticated.
      const [profilesRes, rolesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("is_active", true)
          .order("full_name", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      if (profilesRes.error) throw profilesRes.error;

      const roleByUser = new Map<string, string>();
      for (const r of rolesRes.data || []) {
        if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role as string);
      }

      const staff: ActiveStaffMember[] = (profilesRes.data || []).map((p) => ({
        id: p.id,
        name: p.full_name || p.email || "Unknown",
        email: p.email,
        phone: p.phone,
        role: roleByUser.get(p.id) ?? null,
      }));

      setStaffMembers(staff);
    } catch (error) {
      console.error("Error fetching active staff:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveStaff();
  }, []);

  return {
    staffMembers,
    loading,
    refetch: fetchActiveStaff,
  };
}

// Export a simple list format for dropdowns. `label` is additive — existing
// consumers using `name` keep working; new consumers can render `label` to get
// "Name (Role)" identical to admin views.
export function useActiveStaffOptions() {
  const { staffMembers, loading } = useActiveStaff();

  const options = staffMembers.map((staff) => {
    const roleLabel = formatRoleLabel(staff.role);
    return {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      label: roleLabel ? `${staff.name} (${roleLabel})` : staff.name,
    };
  });

  return { options, loading };
}

