import { supabase } from "@/integrations/supabase/client";

export type MinimalProfessional = {
  id: string;
  name: string;
  phone: string | null;
  professional_type: string | null;
};

export async function resolveProfessionalById(id: string, cached?: MinimalProfessional | null): Promise<MinimalProfessional | null> {
  if (cached) return cached;
  const { data, error } = await supabase
    .from("professionals")
    .select("id,name,phone,professional_type")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name, phone: data.phone || null, professional_type: data.professional_type || null } : null;
}
