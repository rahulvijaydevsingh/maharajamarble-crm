import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DuplicateCheckResult } from "@/types/lead";

type EntityType = "leads" | "professionals" | "customers";

export interface DuplicateCheckRequest {
  phone: string;
  fieldKey: string;
  entities: readonly EntityType[];
}

export function useEntityPhoneDuplicateCheck() {
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, DuplicateCheckResult>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, "");
    return digits.slice(-10);
  };

  const checkDuplicate = useCallback(async ({ phone, fieldKey, entities }: DuplicateCheckRequest) => {
    const normalizedPhone = normalizePhone(phone);

    if (normalizedPhone.length !== 10) {
      setResults((prev) => ({ ...prev, [fieldKey]: { found: false, type: null } }));
      return;
    }

    if (debounceTimers.current[fieldKey]) {
      clearTimeout(debounceTimers.current[fieldKey]);
    }

    debounceTimers.current[fieldKey] = setTimeout(async () => {
      setChecking((prev) => ({ ...prev, [fieldKey]: true }));

      try {
        // Priority order: leads -> customers -> professionals
        for (const entity of entities) {
          if (entity === "leads") {
            const { data, error } = await supabase
              .from("leads")
              .select("*")
              .or(`phone.eq.${normalizedPhone},alternate_phone.eq.${normalizedPhone}`)
              .limit(1);

            if (error) {
              console.error("Duplicate check (leads) error:", error);
              continue;
            }

            if (data && data.length > 0) {
              const lead = data[0] as any;
              setResults((prev) => ({
                ...prev,
                [fieldKey]: {
                  found: true,
                  type: lead.status === "won" ? "customer" : "lead",
                  existingRecord: {
                    id: lead.id,
                    name: lead.name,
                    phone: lead.phone,
                    email: lead.email,
                    address: lead.address,
                    status: lead.status,
                    assigned_to: lead.assigned_to,
                    created_at: lead.created_at,
                    firm_name: lead.firm_name,
                  },
                },
              }));
              return;
            }
          }

          if (entity === "customers") {
            const { data, error } = await supabase
              .from("customers")
              .select("*")
              .or(`phone.eq.${normalizedPhone},alternate_phone.eq.${normalizedPhone}`)
              .limit(1);

            if (error) {
              console.error("Duplicate check (customers) error:", error);
              continue;
            }

            if (data && data.length > 0) {
              const customer = data[0] as any;
              setResults((prev) => ({
                ...prev,
                [fieldKey]: {
                  found: true,
                  type: "customer",
                  existingRecord: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    email: customer.email,
                    address: customer.address,
                    status: customer.status,
                    assigned_to: customer.assigned_to,
                    created_at: customer.created_at,
                    firm_name: customer.company_name,
                  },
                },
              }));
              return;
            }
          }

          if (entity === "professionals") {
            const { data, error } = await supabase
              .from("professionals")
              .select("*")
              .or(`phone.eq.${normalizedPhone},alternate_phone.eq.${normalizedPhone}`)
              .limit(1);

            if (error) {
              console.error("Duplicate check (professionals) error:", error);
              continue;
            }

            if (data && data.length > 0) {
              const prof = data[0] as any;
              setResults((prev) => ({
                ...prev,
                [fieldKey]: {
                  found: true,
                  type: "professional",
                  existingRecord: {
                    id: prof.id,
                    name: prof.name,
                    phone: prof.phone,
                    email: prof.email,
                    address: prof.address,
                    status: prof.status,
                    assigned_to: prof.assigned_to,
                    created_at: prof.created_at,
                    firm_name: prof.firm_name,
                  },
                },
              }));
              return;
            }
          }
        }

        setResults((prev) => ({ ...prev, [fieldKey]: { found: false, type: null } }));
      } catch (err) {
        console.error("Duplicate check failed:", err);
        setResults((prev) => ({ ...prev, [fieldKey]: { found: false, type: null } }));
      } finally {
        setChecking((prev) => ({ ...prev, [fieldKey]: false }));
      }
    }, 500);
  }, []);

  const clearAll = useCallback(() => {
    setResults({});
    setChecking({});
  }, []);

  return {
    checking,
    results,
    checkDuplicate,
    clearAll,
    hasDuplicates: Object.values(results).some((r) => r.found),
  };
}
