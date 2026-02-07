import type { ActiveStaffMember } from "@/hooks/useActiveStaff";
import { getRoleLabel } from "@/lib/staffSelect";

// Helper to get staff display name in "Role - Name" format
export function getStaffDisplayName(
  assignee: string,
  staffMembers: ActiveStaffMember[]
): string {
  // Try to find by email first, then by name
  const staff = staffMembers.find(
    (s) => s.email === assignee || s.name === assignee
  );
  if (staff) {
    const roleLabel = getRoleLabel(staff.role);
    return `${roleLabel} - ${staff.name}`;
  }
  return assignee;
}

// Helper to build WhatsApp link
export function getWhatsAppLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = phone.replace(/[^\d+]/g, '');
  return `https://wa.me/${normalized}`;
}

// Helper to build entity URL for navigation
export function getEntityUrl(entityType: string, entityId: string, tab?: string): string {
  const typeMap: Record<string, string> = {
    lead: 'leads',
    customer: 'customers',
    professional: 'professionals',
  };
  const basePath = `/${typeMap[entityType] || entityType}`;
  const queryParams = new URLSearchParams();
  queryParams.set('selected', entityId);
  if (tab) {
    queryParams.set('tab', tab);
  }
  return `${basePath}?${queryParams.toString()}`;
}
