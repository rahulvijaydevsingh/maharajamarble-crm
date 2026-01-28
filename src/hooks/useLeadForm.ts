
import { useState } from "react";
import { PhoneField, ValidationErrors, LeadFormData } from "@/types/lead";

export const useLeadForm = () => {
  const [duplicateCheck, setDuplicateCheck] = useState(true);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [customSource, setCustomSource] = useState("");
  const [showCustomSource, setShowCustomSource] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [phoneFields, setPhoneFields] = useState<PhoneField[]>([
    { id: "phone1", value: "", isValid: true, error: "" }
  ]);
  
  const [formData, setFormData] = useState<LeadFormData>({
    name: "",
    email: "",
    source: "",
    interests: [],
    notes: "",
    address: "",
    status: "Open",
    assignedTo: "",
    priority: 3,
    nextAction: "",
    nextActionDate: "",
    nextActionTime: "",
  });

  // Validation functions
  const validatePhone = (phone: string): { isValid: boolean; error: string } => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 0) {
      return { isValid: true, error: "" };
    }
    if (cleanPhone.length !== 10) {
      return { isValid: false, error: "Phone number must be exactly 10 digits" };
    }
    return { isValid: true, error: "" };
  };

  const formatPhone = (value: string): string => {
    const cleanValue = value.replace(/\D/g, '');
    return cleanValue.slice(0, 10);
  };

  const validateEmail = (email: string): boolean => {
    if (!email) return true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isBusinessHours = (time: string): boolean => {
    const hour = parseInt(time.split(':')[0]);
    return hour >= 9 && hour <= 19;
  };

  // Duplicate check simulation
  const checkForDuplicates = async (value: string, type: "phone" | "email") => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (value === "9876543210" || value === "test@example.com") {
      setDuplicateWarning(`⚠ Similar record found: John Doe - ${value} - In Progress`);
    } else {
      setDuplicateWarning(null);
    }
  };

  // Form validation
  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};
    
    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }
    
    const validPhones = phoneFields.filter(field => field.value && field.isValid);
    if (validPhones.length === 0) {
      errors.phone = "At least one valid phone number is required";
    }
    
    if (formData.email && !validateEmail(formData.email)) {
      errors.email = "Please enter a valid email address";
    }
    
    if (!formData.source) {
      errors.source = "Lead source is required";
    }
    
    if (showCustomSource && !customSource.trim()) {
      errors.customSource = "Please specify the lead source";
    }
    
    if (formData.interests.length === 0) {
      errors.interests = "At least one interest must be selected";
    }
    
    if (!formData.assignedTo) {
      errors.assignedTo = "Assignment is required";
    }
    
    if (!formData.nextAction) {
      errors.nextAction = "Next action is required";
    }
    
    if (!formData.nextActionDate) {
      errors.nextActionDate = "Next action date is required";
    } else {
      const selectedDate = new Date(formData.nextActionDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        errors.nextActionDate = "Date cannot be in the past";
      }
    }
    
    if (!formData.nextActionTime) {
      errors.nextActionTime = "Next action time is required";
    } else if (!isBusinessHours(formData.nextActionTime)) {
      errors.nextActionTime = "Time must be during business hours (9 AM - 7 PM)";
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      source: "",
      interests: [],
      notes: "",
      address: "",
      status: "Open",
      assignedTo: "",
      priority: 3,
      nextAction: "",
      nextActionDate: "",
      nextActionTime: "",
    });
    setPhoneFields([{ id: "phone1", value: "", isValid: true, error: "" }]);
    setCustomSource("");
    setShowCustomSource(false);
    setValidationErrors({});
    setDuplicateWarning(null);
  };

  return {
    // State
    duplicateCheck,
    setDuplicateCheck,
    duplicateWarning,
    setDuplicateWarning,
    customSource,
    setCustomSource,
    showCustomSource,
    setShowCustomSource,
    validationErrors,
    setValidationErrors,
    isSubmitting,
    setIsSubmitting,
    phoneFields,
    setPhoneFields,
    formData,
    setFormData,
    
    // Functions
    validatePhone,
    formatPhone,
    validateEmail,
    isBusinessHours,
    checkForDuplicates,
    validateForm,
    resetForm,
  };
};
