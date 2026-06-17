import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logToStaffActivity } from "@/lib/staffActivityLogger";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  company_name: string | null;
  address: string | null;
  city: string | null;
  customer_type: string;
  industry: string | null;
  status: string;
  priority: number;
  total_orders: number;
  total_spent: number;
  notes: string | null;
  source: string | null;
  lead_id: string | null;
  assigned_to: string;
  created_by: string;
  last_purchase: string | null;
  last_follow_up: string | null;
  next_follow_up: string | null;
  created_at: string;
  updated_at: string;
  created_from_lead_id: string | null;
  is_repeat_customer: boolean | null;
  original_lead_id: string | null;
  site_plus_code?: string | null;
}

export interface CustomerInsert {
  name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  address?: string | null;
  city?: string | null;
  customer_type?: string;
  industry?: string | null;
  status?: string;
  priority?: number;
  total_orders?: number;
  total_spent?: number;
  notes?: string | null;
  source?: string | null;
  lead_id?: string | null;
  assigned_to: string;
  created_by?: string;
  last_purchase?: string | null;
  last_follow_up?: string | null;
  next_follow_up?: string | null;
  site_plus_code?: string | null;
}

async function getSessionUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error("Error fetching customers:", error);
      toast({
        title: "Error fetching customers",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addCustomer = async (customer: CustomerInsert) => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert([customer])
        .select()
        .single();

      if (error) throw error;

      setCustomers((prev) => [data, ...prev]);
      toast({ title: "Customer added successfully" });

      // Log to staff activity
      const u = await getSessionUser();
      if (u) {
        logToStaffActivity("create_customer", u.email || "", u.id, `Created customer: ${customer.name}`, "customer", data.id, { customer_name: customer.name, phone: customer.phone });
      }

      return data;
    } catch (error: any) {
      console.error("Error adding customer:", error);
      toast({
        title: "Error adding customer",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateCustomer = async (id: string, updates: Partial<CustomerInsert>) => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      setCustomers((prev) =>
        prev.map((c) => (c.id === id ? data : c))
      );
      toast({ title: "Customer updated successfully" });

      // Log to staff activity
      const u = await getSessionUser();
      if (u) {
        logToStaffActivity("update_customer", u.email || "", u.id, `Updated customer: ${data.name}`, "customer", id, { updated_fields: Object.keys(updates) });
      }

      return data;
    } catch (error: any) {
      console.error("Error updating customer:", error);
      toast({
        title: "Error updating customer",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      const customer = customers.find((c) => c.id === id);

      // First, clear any lead references to this customer
      await supabase
        .from("leads")
        .update({ converted_to_customer_id: null })
        .eq("converted_to_customer_id", id);

      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setCustomers((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Customer deleted successfully" });

      // Log to staff activity
      const u = await getSessionUser();
      if (u) {
        logToStaffActivity("delete_customer", u.email || "", u.id, `Deleted customer: ${customer?.name || id}`, "customer", id, { customer_name: customer?.name });
      }
    } catch (error: any) {
      console.error("Error deleting customer:", error);
      toast({
        title: "Error deleting customer",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchCustomers();

    const channel = supabase
      .channel("customers-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setCustomers((prev) => [payload.new as Customer, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setCustomers((prev) =>
              prev.map((c) =>
                c.id === (payload.new as Customer).id
                  ? (payload.new as Customer)
                  : c
              )
            );
          } else if (payload.eventType === "DELETE") {
            setCustomers((prev) =>
              prev.filter((c) => c.id !== (payload.old as Customer).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    customers,
    loading,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    refetch: fetchCustomers,
  };
}
