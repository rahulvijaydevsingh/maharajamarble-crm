export interface LeadConversionState {
  status?: string | null;
  is_converted?: boolean | null;
  converted_to_customer_id?: string | null;
}

export function isLeadConverted(lead: LeadConversionState): boolean {
  return lead.is_converted === true || Boolean(lead.converted_to_customer_id);
}

export function getLeadConversionAction(
  lead: LeadConversionState,
  canConvert: boolean,
  hasParentHandler: boolean,
): 'parent' | 'fallback' | 'converted' | 'hidden' {
  if (!canConvert || lead.status === 'deleted') return 'hidden';
  if (isLeadConverted(lead)) return 'converted';
  return hasParentHandler ? 'parent' : 'fallback';
}