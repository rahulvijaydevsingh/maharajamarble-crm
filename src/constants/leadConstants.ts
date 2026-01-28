
// Material Interests - Specific inventory categories
export const MATERIAL_INTERESTS = [
  { value: "italian_marble", label: "Italian Marble" },
  { value: "granite_south", label: "Granite (South)" },
  { value: "granite_north", label: "Granite (North)" },
  { value: "quartz", label: "Quartz" },
  { value: "sandstone", label: "Sandstone" },
  { value: "tiles", label: "Tiles" },
  { value: "onyx", label: "Onyx" },
  { value: "engineered_marble", label: "Engineered Marble" },
  { value: "cladding_stone", label: "Cladding Stone" },
  { value: "wooden_flooring", label: "Wooden Flooring" },
];

// Legacy export for backward compatibility
export const MATERIALS = MATERIAL_INTERESTS.map(m => m.label);

// Lead Sources with smart date logic
export const LEAD_SOURCES = [
  { value: "walk_in", label: "Walk-in", autoFollowUpHours: 48 },
  { value: "field_visit", label: "Field Visit", autoFollowUpHours: 4 },
  { value: "cold_call", label: "Cold Call", autoFollowUpHours: 24 },
  { value: "online_enquiry", label: "Online Enquiry", autoFollowUpHours: 24 },
  { value: "professional_referral", label: "Professional Referral", autoFollowUpHours: 24 },
];

// Construction Stages with urgency levels
export const CONSTRUCTION_STAGES = [
  { value: "excavation", label: "Excavation", urgency: "low", followUpDays: 30 },
  { value: "structure_complete", label: "Structure Complete", urgency: "medium", followUpDays: 14 },
  { value: "plastering", label: "Plastering", urgency: "medium", followUpDays: 7 },
  { value: "flooring_ready", label: "Flooring Ready", urgency: "high", followUpDays: 1 },
  { value: "renovation", label: "Renovation", urgency: "high", followUpDays: 3 },
];

// Follow-up Priority Levels
export const FOLLOW_UP_PRIORITIES = [
  { value: "urgent", label: "Urgent (Hot)", color: "bg-red-500", textColor: "text-red-600" },
  { value: "normal", label: "Normal", color: "bg-yellow-500", textColor: "text-yellow-600" },
  { value: "low", label: "Low (Cold)", color: "bg-blue-500", textColor: "text-blue-600" },
];

// Lead Categories
export const LEAD_CATEGORIES = [
  { value: "customer", label: "Customer (Homeowner)" },
  { value: "professional", label: "Professional (Architect/Builder)" },
];

// Next Actions
export const NEXT_ACTIONS = [
  "Call", 
  "Meeting", 
  "Send Quotation", 
  "Site Visit", 
  "Send Samples", 
  "Follow-up Email"
];

// Priority Levels (legacy)
export const PRIORITY_LEVELS = [
  { value: 1, label: "Very High", color: "text-red-600" },
  { value: 2, label: "High", color: "text-orange-600" },
  { value: 3, label: "Medium", color: "text-yellow-600" },
  { value: 4, label: "Low", color: "text-blue-600" },
  { value: 5, label: "Very Low", color: "text-gray-600" }
];

// Team Members
export const TEAM_MEMBERS = [
  { id: "vijay", name: "Vijay Kumar" },
  { id: "ankit", name: "Ankit Sharma" },
  { id: "sanjay", name: "Sanjay Patel" },
  { id: "meera", name: "Meera Singh" },
];

// Designation Categories
export type DesignationCategory = "individual" | "professional";

export interface DesignationOption {
  value: string;
  label: string;
  category: DesignationCategory;
}

// Designations with category classification
export const DESIGNATIONS: DesignationOption[] = [
  { value: "owner", label: "Owner", category: "individual" },
  { value: "family_member", label: "Family Member", category: "individual" },
  { value: "architect", label: "Architect", category: "professional" },
  { value: "builder", label: "Builder", category: "professional" },
  { value: "contractor", label: "Contractor", category: "professional" },
  { value: "interior_designer", label: "Interior Designer", category: "professional" },
  { value: "site_supervisor", label: "Site Supervisor", category: "professional" },
  { value: "real_estate_developer", label: "Real Estate Developer", category: "professional" },
  { value: "other", label: "Other", category: "individual" },
];

// Helper function to check if designation is professional
export const isProfessionalDesignation = (designation: string): boolean => {
  const found = DESIGNATIONS.find(d => d.value === designation);
  return found?.category === "professional";
};

// Mock Professional Database with extended fields
export const MOCK_PROFESSIONALS = [
  { 
    id: "prof_1", 
    name: "Architect Ramesh Kumar", 
    firmName: "RK Architects", 
    type: "architect" as const,
    phone: "9876543100",
    email: "ramesh@rkarchitects.com"
  },
  { 
    id: "prof_2", 
    name: "Builder Suresh Patel", 
    firmName: "Patel Constructions", 
    type: "builder" as const,
    phone: "9876543101",
    email: "suresh@patelcon.com"
  },
  { 
    id: "prof_3", 
    name: "Interior Designer Priya Sharma", 
    firmName: "Priya Interiors", 
    type: "interior_designer" as const,
    phone: "9876543102",
    email: "priya@priyainteriors.com"
  },
  { 
    id: "prof_4", 
    name: "Contractor Mukesh Singh", 
    firmName: "Singh & Sons", 
    type: "contractor" as const,
    phone: "9876543103",
    email: "mukesh@singhandsons.com"
  },
  { 
    id: "prof_5", 
    name: "Architect Neha Gupta", 
    firmName: "NG Design Studio", 
    type: "architect" as const,
    phone: "9876543104",
    email: "neha@ngdesign.com"
  },
];

// Mock existing leads for duplicate check
export const MOCK_EXISTING_RECORDS = [
  { id: "lead_1", name: "John Doe", phone: "9876543210", assignedTo: "Vijay Kumar", status: "In Progress", type: "lead" as const },
  { id: "cust_1", name: "Rahul Sharma", phone: "9876543211", assignedTo: "Ankit Sharma", status: "Active", type: "customer" as const },
  { id: "prof_1", name: "Architect Ramesh Kumar", phone: "9876543212", assignedTo: "Sanjay Patel", status: "Active", type: "professional" as const },
];
