import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export function useProfileSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const nameParts = (data.full_name || "").split(" ");
        setProfileData({
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
          email: data.email || user.email || "",
          phone: data.phone || "",
        });
      } else {
        // If no profile, use auth data
        setProfileData({
          firstName: "",
          lastName: "",
          email: user.email || "",
          phone: "",
        });
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      toast({
        title: "Error loading profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email, toast]);

  const saveProfile = async (): Promise<boolean> => {
    if (!user?.id) {
      toast({
        title: "Not authenticated",
        description: "Please log in to save your profile.",
        variant: "destructive",
      });
      return false;
    }

    try {
      setSaving(true);
      
      const fullName = `${profileData.firstName} ${profileData.lastName}`.trim();
      
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          email: profileData.email,
          phone: profileData.phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setLastSaved(new Date());
      toast({
        title: "Profile saved",
        description: "Your profile has been updated successfully.",
      });
      return true;
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error saving profile",
        description: error.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profileData,
    setProfileData,
    loading,
    saving,
    lastSaved,
    saveProfile,
    refetch: fetchProfile,
  };
}
