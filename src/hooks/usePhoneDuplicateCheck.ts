import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/hooks/useLeads";

export interface DuplicateCheckResult {
  found: boolean;
  type: "lead" | "customer" | "professional" | null;
  existingRecord?: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
    status: string;
    assigned_to: string;
    created_at: string;
    firm_name: string | null;
  };
}

export function usePhoneDuplicateCheck() {
  const [checking, setChecking] = useState<{ [key: string]: boolean }>({});
  const [results, setResults] = useState<{ [key: string]: DuplicateCheckResult }>({});
  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const normalizePhone = (phone: string): string => {
    // Remove all non-digits and take last 10 digits
    const digits = phone.replace(/\D/g, "");
    return digits.slice(-10);
  };

  const checkDuplicate = useCallback(async (phone: string, fieldKey: string) => {
    const normalizedPhone = normalizePhone(phone);
    
    if (normalizedPhone.length !== 10) {
      setResults(prev => ({ ...prev, [fieldKey]: { found: false, type: null } }));
      return;
    }

    // Clear existing timer for this field
    if (debounceTimers.current[fieldKey]) {
      clearTimeout(debounceTimers.current[fieldKey]);
    }

    // Debounce by 500ms
    debounceTimers.current[fieldKey] = setTimeout(async () => {
      setChecking(prev => ({ ...prev, [fieldKey]: true }));

      try {
        // Search for duplicates - check phone and alternate_phone
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .or(`phone.eq.${normalizedPhone},alternate_phone.eq.${normalizedPhone}`)
          .limit(1);

        if (error) {
          console.error("Duplicate check error:", error);
          setResults(prev => ({ ...prev, [fieldKey]: { found: false, type: null } }));
          return;
        }

        if (data && data.length > 0) {
          const lead = data[0];
          const result: DuplicateCheckResult = {
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
          };
          setResults(prev => ({ ...prev, [fieldKey]: result }));
        } else {
          setResults(prev => ({ ...prev, [fieldKey]: { found: false, type: null } }));
        }
      } catch (err) {
        console.error("Duplicate check failed:", err);
        setResults(prev => ({ ...prev, [fieldKey]: { found: false, type: null } }));
      } finally {
        setChecking(prev => ({ ...prev, [fieldKey]: false }));
      }
    }, 500);
  }, []);

  const clearResult = useCallback((fieldKey: string) => {
    setResults(prev => {
      const newResults = { ...prev };
      delete newResults[fieldKey];
      return newResults;
    });
  }, []);

  const clearAll = useCallback(() => {
    setResults({});
    setChecking({});
  }, []);

  return {
    checking,
    results,
    checkDuplicate,
    clearResult,
    clearAll,
    hasDuplicates: Object.values(results).some(r => r.found),
  };
}
