import { Customer } from '@/hooks/useCustomers';
import { EntityAttachmentsTab } from '@/components/shared/EntityAttachmentsTab';

interface CustomerAttachmentsTabProps {
  customer: Customer;
}

export function CustomerAttachmentsTab({ customer }: CustomerAttachmentsTabProps) {
  return <EntityAttachmentsTab entityType="customer" entityId={customer.id} />;
}

