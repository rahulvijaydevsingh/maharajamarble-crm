// Customer Types
export const CUSTOMER_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
  { value: "corporate", label: "Corporate" },
  { value: "government", label: "Government" },
];

// Customer Status
export const CUSTOMER_STATUSES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-50 text-green-600 hover:bg-green-50" },
  inactive: { label: "Inactive", className: "bg-gray-100 text-gray-600 hover:bg-gray-100" },
  vip: { label: "VIP", className: "bg-purple-50 text-purple-600 hover:bg-purple-50" },
  suspended: { label: "Suspended", className: "bg-red-50 text-red-600 hover:bg-red-50" },
};

// Priority Levels
export const PRIORITY_LEVELS = {
  1: { label: "Critical", color: "text-red-600" },
  2: { label: "High", color: "text-orange-600" },
  3: { label: "Medium", color: "text-yellow-600" },
  4: { label: "Low", color: "text-blue-600" },
  5: { label: "Very Low", color: "text-gray-600" },
};

// Industries
export const INDUSTRIES = [
  { value: "retail", label: "Retail" },
  { value: "hospitality", label: "Hospitality" },
  { value: "real_estate", label: "Real Estate" },
  { value: "construction", label: "Construction" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "technology", label: "Technology" },
  { value: "finance", label: "Finance" },
  { value: "other", label: "Other" },
];

// Customer Sources
export const CUSTOMER_SOURCES = [
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "lead_conversion", label: "Lead Conversion" },
  { value: "website", label: "Website" },
  { value: "social_media", label: "Social Media" },
  { value: "trade_show", label: "Trade Show" },
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
