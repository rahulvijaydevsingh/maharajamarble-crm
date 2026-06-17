import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PhoneFieldState {
  id: string;
  value: string;
  isValid: boolean;
  error: string;
  requiresValidation: boolean; // Only first 2 fields require validation
  isDuplicateChecking: boolean;
  duplicateFound: boolean;
  duplicateRecord?: {
    id: string;
    name: string;
    phone: string;
    firm_name: string | null;
    professional_type: string;
  };
}

export interface AddressFieldState {
  id: string;
  value: string;
}

export interface EmailWebsiteValidation {
  value: string;
  type: "email" | "website" | "invalid";
  isValid: boolean;
}

export function useProfessionalForm() {
  const [phoneFields, setPhoneFields] = useState<PhoneFieldState[]>([
    { id: "phone_1", value: "", isValid: true, error: "", requiresValidation: true, isDuplicateChecking: false, duplicateFound: false },
    { id: "phone_2", value: "", isValid: true, error: "", requiresValidation: true, isDuplicateChecking: false, duplicateFound: false },
  ]);
  
  const [additionalPhoneFields, setAdditionalPhoneFields] = useState<PhoneFieldState[]>([]);
  const [addressFields, setAddressFields] = useState<AddressFieldState[]>([
    { id: "address_1", value: "" },
  ]);
  
  const [emailWebsite, setEmailWebsite] = useState("");
  const [emailWebsiteErrors, setEmailWebsiteErrors] = useState<string[]>([]);
  
  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, "");
    return digits.slice(-10);
  };

  const validatePhoneFormat = (phone: string): { isValid: boolean; error: string } => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return { isValid: true, error: "" }; // Empty is valid (optional field)
    }
    if (normalized.length !== 10) {
      return { isValid: false, error: "Phone number must be exactly 10 digits" };
    }
    if (!/^[6-9]/.test(normalized)) {
      return { isValid: false, error: "Phone number must start with 6, 7, 8, or 9" };
    }
    return { isValid: true, error: "" };
  };

  const checkPhoneDuplicate = useCallback(async (phone: string, fieldId: string, excludeId?: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return;

    // Clear existing timer
    if (debounceTimers.current[fieldId]) {
      clearTimeout(debounceTimers.current[fieldId]);
    }

    debounceTimers.current[fieldId] = setTimeout(async () => {
      setPhoneFields(prev => prev.map(f => 
        f.id === fieldId ? { ...f, isDuplicateChecking: true } : f
      ));

      try {
        let query = supabase
          .from("professionals")
          .select("id, name, phone, firm_name, professional_type")
          .or(`phone.eq.${normalized},alternate_phone.eq.${normalized}`)
          .limit(1);

        if (excludeId) {
          query = query.neq("id", excludeId);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Duplicate check error:", error);
          return;
        }

        if (data && data.length > 0) {
          setPhoneFields(prev => prev.map(f => 
            f.id === fieldId ? { 
              ...f, 
              isDuplicateChecking: false,
              duplicateFound: true,
              duplicateRecord: data[0]
            } : f
          ));
        } else {
          setPhoneFields(prev => prev.map(f => 
            f.id === fieldId ? { 
              ...f, 
              isDuplicateChecking: false,
              duplicateFound: false,
              duplicateRecord: undefined
            } : f
          ));
        }
      } catch (err) {
        console.error("Duplicate check failed:", err);
        setPhoneFields(prev => prev.map(f => 
          f.id === fieldId ? { ...f, isDuplicateChecking: false } : f
        ));
      }
    }, 500);
  }, []);

  const handlePhoneChange = useCallback((fieldId: string, value: string, excludeId?: string) => {
    const formatted = value.replace(/\D/g, "").slice(0, 10);
    
    // Check if this is a main phone field (requires validation)
    const isMainField = phoneFields.some(f => f.id === fieldId);
    
    if (isMainField) {
      const validation = validatePhoneFormat(formatted);
      setPhoneFields(prev => prev.map(f => 
        f.id === fieldId ? { 
          ...f, 
          value: formatted, 
          isValid: validation.isValid, 
          error: validation.error,
          duplicateFound: false,
          duplicateRecord: undefined
        } : f
      ));

      // Only check for duplicates if valid 10-digit number
      if (formatted.length === 10 && validation.isValid) {
        checkPhoneDuplicate(formatted, fieldId, excludeId);
      }
    } else {
      // Additional phone fields - no validation
      setAdditionalPhoneFields(prev => prev.map(f => 
        f.id === fieldId ? { ...f, value: formatted } : f
      ));
    }
  }, [phoneFields, checkPhoneDuplicate]);

  const addAdditionalPhoneField = useCallback(() => {
    if (additionalPhoneFields.length >= 2) return;
    
    const newId = `phone_${3 + additionalPhoneFields.length}`;
    setAdditionalPhoneFields(prev => [
      ...prev,
      { id: newId, value: "", isValid: true, error: "", requiresValidation: false, isDuplicateChecking: false, duplicateFound: false }
    ]);
  }, [additionalPhoneFields.length]);

  const removeAdditionalPhoneField = useCallback((fieldId: string) => {
    setAdditionalPhoneFields(prev => prev.filter(f => f.id !== fieldId));
  }, []);

  const addAddressField = useCallback(() => {
    if (addressFields.length >= 2) return;
    setAddressFields(prev => [
      ...prev,
      { id: `address_${prev.length + 1}`, value: "" }
    ]);
  }, [addressFields.length]);

  const removeAddressField = useCallback((fieldId: string) => {
    setAddressFields(prev => prev.filter(f => f.id !== fieldId));
  }, []);

  const handleAddressChange = useCallback((fieldId: string, value: string) => {
    setAddressFields(prev => prev.map(f => 
      f.id === fieldId ? { ...f, value } : f
    ));
  }, []);

  const validateEmailOrWebsite = (entry: string): EmailWebsiteValidation => {
    const trimmed = entry.trim();
    if (!trimmed) return { value: trimmed, type: "email", isValid: true };

    // Email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // URL regex (http/https/www)
    const urlRegex = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;

    if (emailRegex.test(trimmed)) {
      return { value: trimmed, type: "email", isValid: true };
    }
    if (urlRegex.test(trimmed)) {
      return { value: trimmed, type: "website", isValid: true };
    }
    return { value: trimmed, type: "invalid", isValid: false };
  };

  const handleEmailWebsiteChange = useCallback((value: string) => {
    setEmailWebsite(value);
    
    if (!value.trim()) {
      setEmailWebsiteErrors([]);
      return;
    }

    const entries = value.split(",").map(e => e.trim()).filter(Boolean);
    const errors: string[] = [];
    
    entries.forEach((entry, index) => {
      const validation = validateEmailOrWebsite(entry);
      if (!validation.isValid) {
        errors.push(`Entry ${index + 1} "${entry}" is not a valid email or website URL`);
      }
    });
    
    setEmailWebsiteErrors(errors);
  }, []);

  const validateForm = useCallback((): boolean => {
    let isValid = true;

    // Validate primary phone (required)
    const primaryPhone = phoneFields[0];
    if (!primaryPhone.value) {
      setPhoneFields(prev => prev.map((f, i) => 
        i === 0 ? { ...f, isValid: false, error: "Primary phone is required" } : f
      ));
      isValid = false;
    } else {
      const validation = validatePhoneFormat(primaryPhone.value);
      if (!validation.isValid) {
        setPhoneFields(prev => prev.map((f, i) => 
          i === 0 ? { ...f, isValid: false, error: validation.error } : f
        ));
        isValid = false;
      }
    }

    // Check for duplicates
    const hasDuplicates = phoneFields.some(f => f.duplicateFound);
    if (hasDuplicates) {
      isValid = false;
    }

    return isValid;
  }, [phoneFields]);

  const resetForm = useCallback(() => {
    setPhoneFields([
      { id: "phone_1", value: "", isValid: true, error: "", requiresValidation: true, isDuplicateChecking: false, duplicateFound: false },
      { id: "phone_2", value: "", isValid: true, error: "", requiresValidation: true, isDuplicateChecking: false, duplicateFound: false },
    ]);
    setAdditionalPhoneFields([]);
    setAddressFields([{ id: "address_1", value: "" }]);
    setEmailWebsite("");
    setEmailWebsiteErrors([]);
  }, []);

  const setInitialValues = useCallback((data: {
    phone?: string;
    alternate_phone?: string;
    additional_phones?: string[];
    email?: string;
    address?: string;
    additional_address?: string;
  }) => {
    setPhoneFields([
      { id: "phone_1", value: data.phone || "", isValid: true, error: "", requiresValidation: true, isDuplicateChecking: false, duplicateFound: false },
      { id: "phone_2", value: data.alternate_phone || "", isValid: true, error: "", requiresValidation: true, isDuplicateChecking: false, duplicateFound: false },
    ]);

    if (data.additional_phones && data.additional_phones.length > 0) {
      setAdditionalPhoneFields(data.additional_phones.map((phone, idx) => ({
        id: `phone_${3 + idx}`,
        value: phone,
        isValid: true,
        error: "",
        requiresValidation: false,
        isDuplicateChecking: false,
        duplicateFound: false,
      })));
    } else {
      setAdditionalPhoneFields([]);
    }

    setEmailWebsite(data.email || "");
    setEmailWebsiteErrors([]);

    const addresses: AddressFieldState[] = [{ id: "address_1", value: data.address || "" }];
    if (data.additional_address) {
      addresses.push({ id: "address_2", value: data.additional_address });
    }
    setAddressFields(addresses);
  }, []);

  const getFormValues = useCallback(() => {
    return {
      phone: phoneFields[0]?.value || "",
      alternate_phone: phoneFields[1]?.value || "",
      additional_phones: additionalPhoneFields.map(f => f.value).filter(Boolean),
      email: emailWebsite,
      address: addressFields[0]?.value || "",
      additional_address: addressFields[1]?.value || "",
    };
  }, [phoneFields, additionalPhoneFields, emailWebsite, addressFields]);

  return {
    phoneFields,
    additionalPhoneFields,
    addressFields,
    emailWebsite,
    emailWebsiteErrors,
    handlePhoneChange,
    addAdditionalPhoneField,
    removeAdditionalPhoneField,
    addAddressField,
    removeAddressField,
    handleAddressChange,
    handleEmailWebsiteChange,
    validateForm,
    resetForm,
    setInitialValues,
    getFormValues,
    hasDuplicates: phoneFields.some(f => f.duplicateFound),
    canAddMorePhones: additionalPhoneFields.length < 2,
    canAddMoreAddresses: addressFields.length < 2,
  };
}
