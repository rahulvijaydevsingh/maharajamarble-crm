import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Edit, DollarSign, Loader2 } from 'lucide-react';
import { Lead, useLeads } from '@/hooks/useLeads';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface LeadProfileTabProps {
  lead: Lead;
  onEdit: () => void;
  onViewActivityLog?: () => void;
}

const LEAD_STATUSES: Record<string, { label: string; className: string }> = {
  'new': { label: 'New', className: 'bg-blue-100 text-blue-700' },
  'in-progress': { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700' },
  'quoted': { label: 'Quoted', className: 'bg-purple-100 text-purple-700' },
  'won': { label: 'Won', className: 'bg-green-100 text-green-700' },
  'lost': { label: 'Lost', className: 'bg-red-100 text-red-700' },
};

const PRIORITY_LEVELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Very High', color: 'text-red-600' },
  2: { label: 'High', color: 'text-orange-600' },
  3: { label: 'Medium', color: 'text-yellow-600' },
  4: { label: 'Low', color: 'text-blue-600' },
  5: { label: 'Very Low', color: 'text-gray-600' },
};

const sourceLabels: Record<string, string> = {
  'walk_in': 'Walk-in',
  'field_visit': 'Field Visit',
  'cold_call': 'Cold Call',
  'online_enquiry': 'Online Enquiry',
  'professional_referral': 'Professional Referral',
};

export function LeadProfileTab({ lead, onEdit, onViewActivityLog }: LeadProfileTabProps) {
  const { updateLead } = useLeads();
  const { toast } = useToast();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  const statusConfig = LEAD_STATUSES[lead.status] || { label: lead.status, className: 'bg-gray-100 text-gray-700' };
  const priorityConfig = PRIORITY_LEVELS[lead.priority] || { label: 'Medium', color: 'text-yellow-600' };
  
  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await updateLead(lead.id, { status: newStatus });
      toast({
        title: "Status Updated",
        description: `Lead status changed to ${LEAD_STATUSES[newStatus]?.label || newStatus}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

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
          Edit Lead
        </Button>
      </div>

      {/* Main Content Grid - Two Column Layout matching Customer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Lead Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Lead Information
          </h3>
          
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Name</div>
              <div className="font-medium">{lead.name}</div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Designation</div>
              <div className="capitalize">{formatValue(lead.designation)}</div>
            </div>
            
            {lead.email && (
              <div>
                <div className="text-xs text-muted-foreground">Email Address</div>
                <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">
                  {lead.email}
                </a>
              </div>
            )}
            
            {lead.firm_name && (
              <div>
                <div className="text-xs text-muted-foreground">Firm / Company</div>
                <div>{lead.firm_name}</div>
              </div>
            )}
            
            <div>
              <div className="text-xs text-muted-foreground">Phone</div>
              <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">
                {lead.phone}
              </a>
              {lead.alternate_phone && (
                <span className="text-muted-foreground ml-2">
                  / {lead.alternate_phone}
                </span>
              )}
            </div>

            {(lead.address || lead.site_location) && (
              <div>
                <div className="text-xs text-muted-foreground">Address / Site Location</div>
                <div>{formatValue(lead.address || lead.site_location)}</div>
              </div>
            )}

            {lead.construction_stage && (
              <div>
                <div className="text-xs text-muted-foreground">Construction Stage</div>
                <div className="capitalize">{lead.construction_stage.replace(/_/g, ' ')}</div>
              </div>
            )}

            {lead.material_interests && (lead.material_interests as string[]).length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Material Interests</div>
                <div className="flex flex-wrap gap-1">
                  {(lead.material_interests as string[]).map((material, idx) => (
                    <Badge key={idx} variant="secondary" className="capitalize text-xs">
                      {material.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {lead.estimated_quantity && (
              <div>
                <div className="text-xs text-muted-foreground">Estimated Quantity</div>
                <div>{lead.estimated_quantity.toLocaleString()} sq.ft.</div>
              </div>
            )}

            {lead.notes && (
              <div>
                <div className="text-xs text-muted-foreground">Notes</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {lead.notes}
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
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <Select 
                value={lead.status} 
                onValueChange={handleStatusChange}
                disabled={updatingStatus}
              >
                <SelectTrigger className="w-40">
                  <SelectValue>
                    <Badge variant="secondary" className={statusConfig.className}>
                      {updatingStatus ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : null}
                      {statusConfig.label}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_STATUSES).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      <Badge variant="secondary" className={config.className}>
                        {config.label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Source</div>
              <div>{sourceLabels[lead.source] || lead.source}</div>
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
                    {lead.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                {lead.assigned_to}
              </div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Created</div>
              <div>
                {formatDate(lead.created_at)}
                <span className="text-muted-foreground ml-1 text-sm">
                  ({getRelativeTime(lead.created_at)})
                </span>
              </div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground">Created By</div>
              <div>{lead.created_by}</div>
            </div>
            
            {lead.last_follow_up && (
              <div>
                <div className="text-xs text-muted-foreground">Last Follow-up</div>
                <div>{formatDate(lead.last_follow_up)}</div>
              </div>
            )}
            
            {lead.next_follow_up && (
              <div>
                <div className="text-xs text-muted-foreground">Next Follow-up</div>
                <div>{formatDate(lead.next_follow_up)}</div>
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
                {lead.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="font-medium">{lead.assigned_to}</span>
              <span className="text-muted-foreground"> - Lead created</span>
              <div className="text-xs text-muted-foreground">
                {getRelativeTime(lead.created_at)}
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