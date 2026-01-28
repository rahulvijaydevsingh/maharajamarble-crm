
export interface PhoneField {
  id: string;
  value: string;
  isValid: boolean;
  error: string;
}

export interface ValidationErrors {
  [key: string]: string;
}

// Lead Category - Customer vs Professional
export type LeadCategory = "customer" | "professional";

// Construction stages for site urgency
export type ConstructionStage = 
  | "excavation" 
  | "structure_complete" 
  | "plastering" 
  | "flooring_ready" 
  | "renovation";

// Follow-up priority levels
export type FollowUpPriority = "urgent" | "normal" | "low";

// Lead sources with smart date logic
export type LeadSource = 
  | "walk_in" 
  | "field_visit" 
  | "cold_call" 
  | "online_enquiry" 
  | "professional_referral";

// Professional reference for referral tracking
export interface ProfessionalRef {
  id: string;
  name: string;
  firmName: string;
  type: "architect" | "builder" | "contractor" | "interior_designer";
  phone?: string;
  email?: string;
}

// Smart Lead Form Data
export interface SmartLeadFormData {
  // Section A: Duplicate Gate
  primaryPhone: string;
  leadCategory: LeadCategory;
  
  // Section B: Source & Relationship
  leadSource: LeadSource;
  referredBy: ProfessionalRef | null;
  assignedTo: string;
  
  // Section C: Customer & Site Details
  fullName: string;
  email: string;
  siteLocation: string;
  constructionStage: ConstructionStage;
  materialInterests: string[];
  estimatedQuantity: number | null;
  
  // Section D: Action Trigger
  followUpPriority: FollowUpPriority;
  nextActionDate: Date;
  nextActionTime: string;
  initialNote: string;
  
  // Professional-specific fields (only if leadCategory === "professional")
  firmName?: string;
  gstNumber?: string;
}

// Duplicate check result
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

export interface LeadFormData {
  name: string;
  email: string;
  source: string;
  interests: string[];
  notes: string;
  address: string;
  status: string;
  assignedTo: string;
  priority: number;
  nextAction: string;
  nextActionDate: string;
  nextActionTime: string;
}

export interface AddLeadDialogProps {
  onAddLead?: (lead: any) => void;
}
