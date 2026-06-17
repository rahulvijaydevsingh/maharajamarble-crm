import { Lead } from '@/hooks/useLeads';
import { EntityAttachmentsTab } from '@/components/shared/EntityAttachmentsTab';

interface LeadAttachmentsTabProps {
  lead: Lead;
}

export function LeadAttachmentsTab({ lead }: LeadAttachmentsTabProps) {
  return <EntityAttachmentsTab entityType="lead" entityId={lead.id} />;
}

