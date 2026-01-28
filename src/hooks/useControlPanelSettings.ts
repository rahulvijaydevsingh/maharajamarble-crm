import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SystemOption {
  id: string;
  label: string;
  value: string;
  color?: string;
  isActive: boolean;
  isDefault: boolean;
  isSystemReserved: boolean;
  sortOrder: number;
}

export interface OptionField {
  id?: string;
  fieldName: string;
  displayName: string;
  options: SystemOption[];
  allowColors: boolean;
}

export interface OptionModule {
  moduleName: string;
  displayName: string;
  icon?: React.ReactNode;
  fields: OptionField[];
}

// Default options to seed the database
const defaultSystemOptions: OptionModule[] = [
  {
    moduleName: "leads",
    displayName: "Leads Management",
    fields: [
      {
        fieldName: "status",
        displayName: "Lead Status",
        allowColors: true,
        options: [
          { id: "1", label: "New", value: "new", color: "#3B82F6", isActive: true, isDefault: true, isSystemReserved: true, sortOrder: 1 },
          { id: "2", label: "In Progress", value: "in-progress", color: "#F59E0B", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "3", label: "Quoted", value: "quoted", color: "#8B5CF6", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "4", label: "Won", value: "won", color: "#10B981", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "5", label: "Lost", value: "lost", color: "#EF4444", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
          { id: "6", label: "On Hold", value: "on-hold", color: "#6B7280", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 6 },
        ],
      },
      {
        fieldName: "priority",
        displayName: "Lead Priority",
        allowColors: true,
        options: [
          { id: "7", label: "Very High", value: "1", color: "#EF4444", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 1 },
          { id: "8", label: "High", value: "2", color: "#F59E0B", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "9", label: "Medium", value: "3", color: "#3B82F6", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 3 },
          { id: "10", label: "Low", value: "4", color: "#10B981", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "11", label: "Very Low", value: "5", color: "#6B7280", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
        ],
      },
      {
        fieldName: "source",
        displayName: "Lead Source",
        allowColors: false,
        options: [
          { id: "12", label: "Walk-in", value: "walk_in", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 1 },
          { id: "13", label: "Field Visit", value: "field_visit", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "14", label: "Cold Call", value: "cold_call", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "15", label: "Online Enquiry", value: "online_enquiry", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "16", label: "Professional Referral", value: "professional_referral", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
        ],
      },
      {
        fieldName: "construction_stage",
        displayName: "Construction Stage",
        allowColors: false,
        options: [
          { id: "18", label: "Excavation", value: "excavation", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 1 },
          { id: "19", label: "Structure Complete", value: "structure_complete", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "20", label: "Plastering", value: "plastering", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "21", label: "Flooring Ready", value: "flooring_ready", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "22", label: "Renovation", value: "renovation", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
        ],
      },
      {
        fieldName: "designation",
        displayName: "Designation",
        allowColors: false,
        options: [
          // Individuals category
          { id: "des1", label: "Owner", value: "owner", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 1 },
          { id: "des2", label: "Family Member", value: "family_member", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "des9", label: "Other (Individual)", value: "other", isActive: true, isDefault: false, isSystemReserved: true, sortOrder: 3 },
          // Professionals category
          { id: "des3", label: "Architect", value: "architect", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "des4", label: "Builder", value: "builder", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
          { id: "des5", label: "Contractor", value: "contractor", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 6 },
          { id: "des6", label: "Interior Designer", value: "interior_designer", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 7 },
          { id: "des7", label: "Site Supervisor", value: "site_supervisor", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 8 },
          { id: "des8", label: "Real Estate Developer", value: "real_estate_developer", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 9 },
        ],
      },
    ],
  },
  {
    moduleName: "professionals",
    displayName: "Professionals Management",
    fields: [
      {
        fieldName: "professional_type",
        displayName: "Professional Type",
        allowColors: false,
        options: [
          { id: "pt1", label: "Contractor", value: "contractor", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 1 },
          { id: "pt2", label: "Supplier", value: "supplier", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "pt3", label: "Consultant", value: "consultant", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "pt4", label: "Partner", value: "partner", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "pt5", label: "Vendor", value: "vendor", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
          { id: "pt6", label: "Architect", value: "architect", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 6 },
          { id: "pt7", label: "Engineer", value: "engineer", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 7 },
          { id: "pt8", label: "Interior Designer", value: "interior_designer", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 8 },
        ],
      },
      {
        fieldName: "professional_status",
        displayName: "Professional Status",
        allowColors: true,
        options: [
          { id: "ps1", label: "Active", value: "active", color: "#10B981", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 1 },
          { id: "ps2", label: "Inactive", value: "inactive", color: "#6B7280", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "ps3", label: "Preferred", value: "preferred", color: "#3B82F6", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "ps4", label: "Blacklisted", value: "blacklisted", color: "#EF4444", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
        ],
      },
      {
        fieldName: "service_category",
        displayName: "Service Category",
        allowColors: false,
        options: [
          { id: "sc1", label: "Construction", value: "construction", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 1 },
          { id: "sc2", label: "Electrical", value: "electrical", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "sc3", label: "Plumbing", value: "plumbing", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "sc4", label: "Flooring", value: "flooring", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "sc5", label: "Painting", value: "painting", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
          { id: "sc6", label: "Carpentry", value: "carpentry", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 6 },
          { id: "sc7", label: "Fabrication", value: "fabrication", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 7 },
          { id: "sc8", label: "Interior Design", value: "interior_design", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 8 },
          { id: "sc9", label: "Landscaping", value: "landscaping", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 9 },
          { id: "sc10", label: "HVAC", value: "hvac", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 10 },
        ],
      },
      {
        fieldName: "city",
        displayName: "City",
        allowColors: false,
        options: [
          { id: "pc1", label: "Jaipur", value: "jaipur", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 1 },
          { id: "pc2", label: "Delhi", value: "delhi", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "pc3", label: "Mumbai", value: "mumbai", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "pc4", label: "Bangalore", value: "bangalore", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "pc5", label: "Chennai", value: "chennai", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
          { id: "pc6", label: "Hyderabad", value: "hyderabad", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 6 },
          { id: "pc7", label: "Pune", value: "pune", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 7 },
          { id: "pc8", label: "Ahmedabad", value: "ahmedabad", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 8 },
        ],
      },
      {
        fieldName: "priority",
        displayName: "Priority",
        allowColors: true,
        options: [
          { id: "pp1", label: "Very High", value: "1", color: "#EF4444", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 1 },
          { id: "pp2", label: "High", value: "2", color: "#F59E0B", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "pp3", label: "Medium", value: "3", color: "#3B82F6", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 3 },
          { id: "pp4", label: "Low", value: "4", color: "#10B981", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "pp5", label: "Very Low", value: "5", color: "#6B7280", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
        ],
      },
    ],
  },
  {
    moduleName: "tasks",
    displayName: "Task Management",
    fields: [
      {
        fieldName: "status",
        displayName: "Task Status",
        allowColors: true,
        options: [
          { id: "ts1", label: "Pending", value: "Pending", color: "#3B82F6", isActive: true, isDefault: true, isSystemReserved: true, sortOrder: 1 },
          { id: "ts2", label: "In Progress", value: "In Progress", color: "#F59E0B", isActive: true, isDefault: false, isSystemReserved: true, sortOrder: 2 },
          { id: "ts3", label: "Overdue", value: "Overdue", color: "#EF4444", isActive: true, isDefault: false, isSystemReserved: true, sortOrder: 3 },
          { id: "ts4", label: "Completed", value: "Completed", color: "#10B981", isActive: true, isDefault: false, isSystemReserved: true, sortOrder: 4 },
        ],
      },
      {
        fieldName: "priority",
        displayName: "Task Priority",
        allowColors: true,
        options: [
          { id: "tp1", label: "High", value: "High", color: "#EF4444", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 1 },
          { id: "tp2", label: "Medium", value: "Medium", color: "#F59E0B", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 2 },
          { id: "tp3", label: "Low", value: "Low", color: "#10B981", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
        ],
      },
      {
        fieldName: "type",
        displayName: "Task Type",
        allowColors: false,
        options: [
          { id: "tt1", label: "Follow-up Call", value: "Follow-up Call", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 1 },
          { id: "tt2", label: "Follow-up Meeting", value: "Follow-up Meeting", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "tt3", label: "Sample Delivery", value: "Sample Delivery", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "tt4", label: "Site Visit", value: "Site Visit", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "tt5", label: "Quotation Preparation", value: "Quotation Preparation", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
          { id: "tt6", label: "Feedback Collection", value: "Feedback Collection", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 6 },
          { id: "tt7", label: "Other", value: "Other", isActive: true, isDefault: false, isSystemReserved: true, sortOrder: 7 },
        ],
      },
    ],
  },
  {
    moduleName: "customers",
    displayName: "Customer Management",
    fields: [
      {
        fieldName: "customer_type",
        displayName: "Customer Type",
        allowColors: false,
        options: [
          { id: "ct1", label: "Individual", value: "individual", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 1 },
          { id: "ct2", label: "Business", value: "business", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "ct3", label: "Corporate", value: "corporate", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "ct4", label: "Government", value: "government", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
        ],
      },
      {
        fieldName: "customer_status",
        displayName: "Customer Status",
        allowColors: true,
        options: [
          { id: "cs1", label: "Active", value: "active", color: "#10B981", isActive: true, isDefault: true, isSystemReserved: false, sortOrder: 1 },
          { id: "cs2", label: "Inactive", value: "inactive", color: "#6B7280", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "cs3", label: "VIP", value: "vip", color: "#8B5CF6", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "cs4", label: "Suspended", value: "suspended", color: "#EF4444", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
        ],
      },
      {
        fieldName: "industry",
        displayName: "Industry",
        allowColors: false,
        options: [
          { id: "ind1", label: "Retail", value: "retail", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 1 },
          { id: "ind2", label: "Hospitality", value: "hospitality", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "ind3", label: "Real Estate", value: "real_estate", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "ind4", label: "Construction", value: "construction", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "ind5", label: "Manufacturing", value: "manufacturing", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
          { id: "ind6", label: "Healthcare", value: "healthcare", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 6 },
          { id: "ind7", label: "Education", value: "education", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 7 },
          { id: "ind8", label: "Technology", value: "technology", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 8 },
        ],
      },
    ],
  },
  {
    moduleName: "materials",
    displayName: "Material Options",
    fields: [
      {
        fieldName: "materials",
        displayName: "Materials",
        allowColors: false,
        options: [
          { id: "mat1", label: "Italian Marble", value: "Italian Marble", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 1 },
          { id: "mat2", label: "Indian Marble", value: "Indian Marble", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 2 },
          { id: "mat3", label: "Granite", value: "Granite", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 3 },
          { id: "mat4", label: "Quartz", value: "Quartz", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 4 },
          { id: "mat5", label: "Tiles", value: "Tiles", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 5 },
          { id: "mat6", label: "Onyx", value: "Onyx", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 6 },
        ],
      },
    ],
  },
];

export function useControlPanelSettings() {
  const { toast } = useToast();
  const [systemOptions, setSystemOptions] = useState<OptionModule[]>(defaultSystemOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load settings from database
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all fields
      const { data: fields, error: fieldsError } = await supabase
        .from('control_panel_options')
        .select('*')
        .order('module_name', { ascending: true });

      if (fieldsError) throw fieldsError;

      // If no fields exist, use defaults (first time setup)
      if (!fields || fields.length === 0) {
        setSystemOptions(defaultSystemOptions);
        setLoading(false);
        return;
      }

      // Fetch all option values
      const { data: optionValues, error: optionsError } = await supabase
        .from('control_panel_option_values')
        .select('*')
        .order('sort_order', { ascending: true });

      if (optionsError) throw optionsError;

      // Build the module structure from database data
      const moduleMap = new Map<string, OptionModule>();
      
      fields.forEach((field: any) => {
        if (!moduleMap.has(field.module_name)) {
          // Find display name from defaults
          const defaultModule = defaultSystemOptions.find(m => m.moduleName === field.module_name);
          moduleMap.set(field.module_name, {
            moduleName: field.module_name,
            displayName: defaultModule?.displayName || field.module_name,
            fields: [],
          });
        }
        
        const module = moduleMap.get(field.module_name)!;
        const fieldOptions = (optionValues || [])
          .filter((opt: any) => opt.field_id === field.id)
          .map((opt: any) => ({
            id: opt.id,
            label: opt.label,
            value: opt.value,
            color: opt.color || undefined,
            isActive: opt.is_active,
            isDefault: opt.is_default,
            isSystemReserved: opt.is_system_reserved,
            sortOrder: opt.sort_order,
          }));

        module.fields.push({
          id: field.id,
          fieldName: field.field_name,
          displayName: field.display_name,
          allowColors: field.allow_colors,
          options: fieldOptions,
        });
      });

      // Convert map to array, maintaining default order
      const loadedModules = defaultSystemOptions.map(defaultModule => {
        const dbModule = moduleMap.get(defaultModule.moduleName);
        if (dbModule) {
          // Merge with default module to get icon
          return {
            ...dbModule,
            displayName: defaultModule.displayName,
          };
        }
        return defaultModule;
      });

      setSystemOptions(loadedModules);
    } catch (error) {
      console.error('Error loading control panel settings:', error);
      toast({
        title: "Error loading settings",
        description: "Using default options. Changes may not persist.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Save all settings to database
  const saveSettings = useCallback(async () => {
    try {
      setSaving(true);

      for (const module of systemOptions) {
        for (const field of module.fields) {
          // Upsert field
          const { data: fieldData, error: fieldError } = await supabase
            .from('control_panel_options')
            .upsert({
              id: field.id || undefined,
              module_name: module.moduleName,
              field_name: field.fieldName,
              display_name: field.displayName,
              allow_colors: field.allowColors,
            }, {
              onConflict: 'module_name,field_name',
            })
            .select()
            .single();

          if (fieldError) throw fieldError;

          const fieldId = fieldData.id;

          // Delete existing options for this field
          await supabase
            .from('control_panel_option_values')
            .delete()
            .eq('field_id', fieldId);

          // Insert all current options
          if (field.options.length > 0) {
            const optionsToInsert = field.options.map((opt, index) => ({
              field_id: fieldId,
              label: opt.label,
              value: opt.value,
              color: opt.color || null,
              is_active: opt.isActive,
              is_default: opt.isDefault,
              is_system_reserved: opt.isSystemReserved,
              sort_order: index + 1,
            }));

            const { error: optionsError } = await supabase
              .from('control_panel_option_values')
              .insert(optionsToInsert);

            if (optionsError) throw optionsError;
          }
        }
      }

      setHasUnsavedChanges(false);
      toast({
        title: "Settings saved",
        description: "All control panel settings have been saved successfully.",
      });
    } catch (error) {
      console.error('Error saving control panel settings:', error);
      toast({
        title: "Error saving settings",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [systemOptions, toast]);

  // Update options locally (marks as having unsaved changes)
  const updateSystemOptions = useCallback((newOptions: OptionModule[]) => {
    setSystemOptions(newOptions);
    setHasUnsavedChanges(true);
  }, []);

  // Get options for a specific field
  const getFieldOptions = useCallback((moduleName: string, fieldName: string): SystemOption[] => {
    const module = systemOptions.find(m => m.moduleName === moduleName);
    if (!module) return [];
    const field = module.fields.find(f => f.fieldName === fieldName);
    return field?.options.filter(o => o.isActive) || [];
  }, [systemOptions]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    systemOptions,
    setSystemOptions: updateSystemOptions,
    loading,
    saving,
    hasUnsavedChanges,
    saveSettings,
    loadSettings,
    getFieldOptions,
  };
}
