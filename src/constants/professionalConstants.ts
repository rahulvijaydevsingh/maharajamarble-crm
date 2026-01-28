// Professional Types
export const PROFESSIONAL_TYPES = [
  { value: "contractor", label: "Contractor" },
  { value: "supplier", label: "Supplier" },
  { value: "consultant", label: "Consultant" },
  { value: "partner", label: "Partner" },
  { value: "vendor", label: "Vendor" },
  { value: "architect", label: "Architect" },
  { value: "engineer", label: "Engineer" },
  { value: "interior_designer", label: "Interior Designer" },
];

// Professional Status
export const PROFESSIONAL_STATUSES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-50 text-green-600 hover:bg-green-50" },
  inactive: { label: "Inactive", className: "bg-gray-100 text-gray-600 hover:bg-gray-100" },
  preferred: { label: "Preferred", className: "bg-blue-50 text-blue-600 hover:bg-blue-50" },
  blacklisted: { label: "Blacklisted", className: "bg-red-50 text-red-600 hover:bg-red-50" },
};

// Service Categories
export const SERVICE_CATEGORIES = [
  { value: "construction", label: "Construction" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "flooring", label: "Flooring" },
  { value: "painting", label: "Painting" },
  { value: "carpentry", label: "Carpentry" },
  { value: "fabrication", label: "Fabrication" },
  { value: "interior_design", label: "Interior Design" },
  { value: "landscaping", label: "Landscaping" },
  { value: "hvac", label: "HVAC" },
];

// Cities
export const CITIES = [
  { value: "jaipur", label: "Jaipur" },
  { value: "delhi", label: "Delhi" },
  { value: "mumbai", label: "Mumbai" },
  { value: "bangalore", label: "Bangalore" },
  { value: "chennai", label: "Chennai" },
  { value: "hyderabad", label: "Hyderabad" },
  { value: "pune", label: "Pune" },
  { value: "ahmedabad", label: "Ahmedabad" },
];

// Priorities
export const PRIORITIES = {
  1: { label: "Very High", color: "text-red-600" },
  2: { label: "High", color: "text-orange-600" },
  3: { label: "Medium", color: "text-yellow-600" },
  4: { label: "Low", color: "text-blue-600" },
  5: { label: "Very Low", color: "text-gray-600" },
};
