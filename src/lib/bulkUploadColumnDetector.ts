export const BULK_LEAD_FIELDS = [
  "name",
  "phone",
  "alternate_phone",
  "email",
  "designation",
  "firm_name",
  "source",
  "address",
  "construction_stage",
  "estimated_quantity",
  "materials",
  "assigned_to",
  "priority",
  "status",
  "referred_by",
  "next_action_date",
  "next_action_time",
  "notes",
  "site_plus_code",
] as const;

export type BulkLeadField = (typeof BULK_LEAD_FIELDS)[number];
export type ColumnMapping = Record<string, BulkLeadField | null>;

const aliases: Record<BulkLeadField, string[]> = {
  name: ["name", "full_name", "lead_name", "customer_name", "contact_person"],
  phone: ["phone", "mobile", "mobile_no", "mobile_number", "phone_number", "contact_number", "contact_no", "primary_phone", "mobile_1"],
  alternate_phone: ["alternate_phone", "alt_phone", "mobile_2", "mobile2", "secondary_phone", "alt_mobile", "alternate_mobile", "phone_2"],
  email: ["email", "email_address", "email_id", "mail"],
  designation: ["designation", "title", "role", "position", "contact_type", "person_type"],
  firm_name: ["firm_name", "company", "company_name", "firm", "organization", "organisation"],
  source: ["source", "lead_source", "source_type", "lead_origin", "origin"],
  address: ["address", "site_location", "site_address", "location", "site", "project_location"],
  construction_stage: ["construction_stage", "stage", "construction_status", "build_stage", "stage_of_work"],
  estimated_quantity: ["estimated_quantity", "quantity", "est_quantity", "approx_quantity", "est_qty", "quantity_sqft"],
  materials: ["materials", "material", "material_interests", "material_interest", "interested_materials", "product_interest"],
  assigned_to: ["assigned_to", "assignee", "assigned", "assigned_staff", "sales_person", "owner", "responsible", "handler"],
  priority: ["priority", "priority_level", "urgency", "priority_value"],
  status: ["status", "lead_status"],
  referred_by: ["referred_by", "referral", "referrer"],
  next_action_date: ["next_action_date", "follow_up_date", "next_follow_up", "next_action"],
  next_action_time: ["next_action_time", "follow_up_time"],
  notes: ["notes", "remarks", "comments", "additional_info", "extra_info", "initial_note"],
  site_plus_code: ["site_plus_code", "plus_code", "sitepluscode"],
};

export const normalizeBulkHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const detectBulkLeadColumns = (headers: string[]): ColumnMapping => {
  const mapping: ColumnMapping = {};
  const usedFields = new Set<BulkLeadField>();

  headers.forEach((header) => {
    const normalized = normalizeBulkHeader(header);
    const field = BULK_LEAD_FIELDS.find(
      (candidate) => !usedFields.has(candidate) && aliases[candidate].includes(normalized),
    );
    mapping[header] = field ?? null;
    if (field) usedFields.add(field);
  });

  return mapping;
};

export const mappingScore = (mapping: ColumnMapping): number => {
  const mapped = Object.values(mapping).filter(Boolean).length;
  return mapped / BULK_LEAD_FIELDS.length;
};

export const mappedValue = (
  row: Record<string, unknown>,
  mapping: ColumnMapping,
  field: BulkLeadField,
): string => {
  const header = Object.entries(mapping).find(([, mappedField]) => mappedField === field)?.[0];
  const value = header ? row[header] : undefined;
  return value === null || value === undefined ? "" : String(value).trim();
};