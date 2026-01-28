import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveStaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

export function useActiveStaff() {
  const [staffMembers, setStaffMembers] = useState<ActiveStaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveStaff = async () => {
    try {
      setLoading(true);
      
      // Fetch all active profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (profilesError) throw profilesError;

      // For each profile, get their role
      const staffWithRoles: ActiveStaffMember[] = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase.rpc("get_user_role", { 
            _user_id: profile.id 
          });
          
          return {
            id: profile.id,
            name: profile.full_name || profile.email || "Unknown",
            email: profile.email,
            phone: profile.phone,
            role: roleData as string | null,
          };
        })
      );

      setStaffMembers(staffWithRoles);
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

// Export a simple list format for dropdowns
export function useActiveStaffOptions() {
  const { staffMembers, loading } = useActiveStaff();
  
  const options = staffMembers.map(staff => ({
    id: staff.id,
    name: staff.name,
  }));
  
  return { options, loading };
}
