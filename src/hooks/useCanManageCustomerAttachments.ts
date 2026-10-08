import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCanManageCustomerAttachments() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["can-manage-customer-attachments"],
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc(
        "can_manage_customer_attachments" as any,
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
