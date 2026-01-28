import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CompanyData {
  id?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
}

const DEFAULT_COMPANY_DATA: CompanyData = {
  name: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  phone: "",
  email: "",
  website: "",
  gstin: "",
};

export function useCompanySettings() {
  const { toast } = useToast();
  const [companyData, setCompanyData] = useState<CompanyData>(DEFAULT_COMPANY_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const fetchCompanySettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCompanyData({
          id: data.id,
          name: data.name || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          pincode: data.pincode || "",
          phone: data.phone || "",
          email: data.email || "",
          website: data.website || "",
          gstin: data.gstin || "",
        });
      }
    } catch (error: any) {
      console.error("Error fetching company settings:", error);
      toast({
        title: "Error loading company settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const saveCompanySettings = async (): Promise<boolean> => {
    try {
      setSaving(true);

      const dataToSave = {
        name: companyData.name,
        address: companyData.address,
        city: companyData.city,
        state: companyData.state,
        pincode: companyData.pincode,
        phone: companyData.phone,
        email: companyData.email,
        website: companyData.website,
        gstin: companyData.gstin,
        updated_at: new Date().toISOString(),
      };

      let error;

      if (companyData.id) {
        // Update existing
        const result = await supabase
          .from("company_settings")
          .update(dataToSave)
          .eq("id", companyData.id);
        error = result.error;
      } else {
        // Insert new
        const result = await supabase
          .from("company_settings")
          .insert([dataToSave])
          .select()
          .single();
        error = result.error;
        if (result.data) {
          setCompanyData(prev => ({ ...prev, id: result.data.id }));
        }
      }

      if (error) throw error;

      setLastSaved(new Date());
      toast({
        title: "Company info saved",
        description: "Company settings have been updated successfully.",
      });
      return true;
    } catch (error: any) {
      console.error("Error saving company settings:", error);
      toast({
        title: "Error saving company settings",
        description: error.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchCompanySettings();
  }, [fetchCompanySettings]);

  return {
    companyData,
    setCompanyData,
    loading,
    saving,
    lastSaved,
    saveCompanySettings,
    refetch: fetchCompanySettings,
  };
}
