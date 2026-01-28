import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Edit, DollarSign } from 'lucide-react';
import { Customer } from '@/hooks/useCustomers';
import { format, formatDistanceToNow } from 'date-fns';
import { PRIORITY_LEVELS, CUSTOMER_STATUSES } from '@/constants/customerConstants';

interface CustomerProfileTabProps {
  customer: Customer;
  onEdit: () => void;
  onViewActivityLog?: () => void;
}

const sourceLabels: Record<string, string> = {
  'direct': 'Direct',
  'referral': 'Referral',
  'website': 'Website',
  'social_media': 'Social Media',
  'marketing': 'Marketing',
  'lead_conversion': 'Lead Conversion',
};

export function CustomerProfileTab({ customer, onEdit, onViewActivityLog }: CustomerProfileTabProps) {
  const statusConfig = CUSTOMER_STATUSES[customer.status] || { label: customer.status, className: 'bg-gray-100 text-gray-700' };
  const priorityConfig = PRIORITY_LEVELS[customer.priority] || { label: 'Normal', color: 'text-gray-600' };
  
  const formatValue = (value: string | null | undefined, fallback = '-') => {
    return value || fallback;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  const getRelativeTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Edit Button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Customer
        </Button>
      </div>

      {/* Main Content Grid - Two Column Layout like Leads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Customer Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Customer Information
          </h3>
          
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Name</div>
              <div className="font-medium">{customer.name}</div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Type</div>
              <div className="capitalize">{customer.customer_type}</div>
            </div>
            
            {customer.email && (
              <div>
                <div className="text-xs text-muted-foreground">Email Address</div>
                <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">
                  {customer.email}
                </a>
              </div>
            )}
            
            {customer.company_name && (
              <div>
                <div className="text-xs text-muted-foreground">Company</div>
                <div>{customer.company_name}</div>
              </div>
            )}
            
            <div>
              <div className="text-xs text-muted-foreground">Phone</div>
              <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">
                {customer.phone}
              </a>
              {customer.alternate_phone && (
                <span className="text-muted-foreground ml-2">
                  / {customer.alternate_phone}
                </span>
              )}
            </div>

            {customer.address && (
              <div>
                <div className="text-xs text-muted-foreground">Address</div>
                <div>{customer.address}</div>
                {customer.city && (
                  <div className="text-sm text-muted-foreground">{customer.city}</div>
                )}
              </div>
            )}

            {customer.industry && (
              <div>
                <div className="text-xs text-muted-foreground">Industry</div>
                <div className="capitalize">{customer.industry.replace(/_/g, ' ')}</div>
              </div>
            )}

            {customer.notes && (
              <div>
                <div className="text-xs text-muted-foreground">Notes</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {customer.notes}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - General Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            General Information
          </h3>
          
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <Badge variant="secondary" className={statusConfig.className}>
                {statusConfig.label}
              </Badge>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Source</div>
              <div>{sourceLabels[customer.source || ''] || customer.source || '-'}</div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Priority</div>
              <div className={priorityConfig.color}>{priorityConfig.label}</div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Assigned To</div>
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {customer.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                {customer.assigned_to}
              </div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Created</div>
              <div>
                {formatDate(customer.created_at)}
                <span className="text-muted-foreground ml-1 text-sm">
                  ({getRelativeTime(customer.created_at)})
                </span>
              </div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Created By</div>
              <div>{customer.created_by}</div>
            </div>
            
            {customer.last_follow_up && (
              <div>
                <div className="text-xs text-muted-foreground">Last Follow-up</div>
                <div>{formatDate(customer.last_follow_up)}</div>
              </div>
            )}
            
            {customer.next_follow_up && (
              <div>
                <div className="text-xs text-muted-foreground">Next Follow-up</div>
                <div>{formatDate(customer.next_follow_up)}</div>
              </div>
            )}
          </div>

          {/* Financial Summary */}
          <div className="pt-4 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Financial Summary
            </h3>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Spent</div>
                <div className="font-medium">₹{customer.total_spent?.toLocaleString('en-IN') || 0}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Orders</div>
              <div>{customer.total_orders || 0}</div>
            </div>
            {customer.last_purchase && (
              <div>
                <div className="text-xs text-muted-foreground">Last Purchase</div>
                <div>{formatDate(customer.last_purchase)}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Latest Activity Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Latest Activity
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-start gap-3 text-sm">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                {customer.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="font-medium">{customer.assigned_to}</span>
              <span className="text-muted-foreground"> - Customer created</span>
              <div className="text-xs text-muted-foreground">
                {getRelativeTime(customer.created_at)}
              </div>
            </div>
          </div>
        </div>

        {onViewActivityLog && (
          <Button 
            variant="link" 
            className="px-0 text-sm" 
            onClick={onViewActivityLog}
          >
            View Full Activity Log →
          </Button>
        )}
      </div>
    </div>
  );
}