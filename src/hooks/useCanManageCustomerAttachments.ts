import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCanManageCustomerAttachments() {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    // The user id is part of the key so that one person's cached answer is never reused for another person.
    queryKey: ["can-manage-customer-attachments", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc(
        "can_manage_customer_attachments",
      );
      if (error) {
        return false;
      }
      return !!result;
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    canManage: !isError && !!data,
    isLoading,
  };
}
