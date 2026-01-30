import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Edit, 
  Loader2, 
  Phone, 
  Mail, 
  MapPin, 
  Building2, 
  User, 
  Calendar, 
  Target, 
  Package,
  Clock,
  Star
} from 'lucide-react';
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

const PRIORITY_LEVELS: Record<number, { label: string; color: string; bgColor: string }> = {
  1: { label: 'Very High', color: 'text-red-700', bgColor: 'bg-red-50' },
  2: { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  3: { label: 'Medium', color: 'text-yellow-700', bgColor: 'bg-yellow-50' },
  4: { label: 'Low', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  5: { label: 'Very Low', color: 'text-gray-700', bgColor: 'bg-gray-50' },
};

const sourceLabels: Record<string, string> = {
  'walk_in': 'Walk-in',
  'field_visit': 'Field Visit',
  'cold_call': 'Cold Call',
  'online_enquiry': 'Online Enquiry',
  'professional_referral': 'Professional Referral',
  'customer_conversion': 'Customer Conversion',
};

export function LeadProfileTab({ lead, onEdit, onViewActivityLog }: LeadProfileTabProps) {
  const { updateLead } = useLeads();
  const { toast } = useToast();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  const statusConfig = LEAD_STATUSES[lead.status] || { label: lead.status, className: 'bg-gray-100 text-gray-700' };
  const priorityConfig = PRIORITY_LEVELS[lead.priority] || { label: 'Medium', color: 'text-yellow-700', bgColor: 'bg-yellow-50' };
  
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
      {/* Header with Edit Button */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">
              {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-2xl font-bold">{lead.name}</h2>
            <p className="text-muted-foreground capitalize">{lead.designation}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Lead
        </Button>
      </div>

      {/* Status & Priority Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Status</div>
            <Select 
              value={lead.status} 
              onValueChange={handleStatusChange}
              disabled={updatingStatus}
            >
              <SelectTrigger className="w-full h-auto p-0 border-0 bg-transparent">
                <SelectValue>
                  <Badge variant="secondary" className={`${statusConfig.className} px-3 py-1`}>
                    {updatingStatus && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
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
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Priority</div>
            <Badge variant="secondary" className={`${priorityConfig.bgColor} ${priorityConfig.color} px-3 py-1`}>
              <Star className="h-3 w-3 mr-1" />
              {priorityConfig.label}
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Source</div>
            <div className="font-medium">{sourceLabels[lead.source] || lead.source}</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Assigned To</div>
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">
                  {lead.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">{lead.assigned_to}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center">
                <Phone className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Phone</div>
                <a href={`tel:${lead.phone}`} className="text-primary hover:underline font-medium">
                  {lead.phone}
                </a>
                {lead.alternate_phone && (
                  <span className="text-muted-foreground text-sm ml-2">/ {lead.alternate_phone}</span>
                )}
              </div>
            </div>

            {lead.email && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-green-50 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline font-medium">
                    {lead.email}
                  </a>
                </div>
              </div>
            )}

            {lead.firm_name && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-purple-50 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Company / Firm</div>
                  <div className="font-medium">{lead.firm_name}</div>
                </div>
              </div>
            )}

            {(lead.address || lead.site_location) && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-orange-50 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Address / Site Location</div>
                  <div className="font-medium">{lead.address || lead.site_location}</div>
                </div>
              </div>
            )}

            {lead.site_plus_code && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Plus Code</div>
                  <div className="font-medium">{lead.site_plus_code}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Details Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Target className="h-4 w-4" />
              Project Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lead.construction_stage && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-amber-50 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Construction Stage</div>
                  <div className="font-medium capitalize">{lead.construction_stage.replace(/_/g, ' ')}</div>
                </div>
              </div>
            )}

            {lead.estimated_quantity && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-cyan-50 flex items-center justify-center">
                  <Package className="h-4 w-4 text-cyan-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Estimated Quantity</div>
                  <div className="font-medium">{lead.estimated_quantity.toLocaleString()} sq.ft.</div>
                </div>
              </div>
            )}

            {lead.material_interests && (lead.material_interests as string[]).length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Material Interests</div>
                <div className="flex flex-wrap gap-1.5">
                  {(lead.material_interests as string[]).map((material, idx) => (
                    <Badge key={idx} variant="outline" className="capitalize text-xs">
                      {material.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up Dates */}
            <Separator />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Clock className="h-3 w-3" />
                  Last Follow-up
                </div>
                <div className="font-medium text-sm">
                  {lead.last_follow_up ? formatDate(lead.last_follow_up) : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Calendar className="h-3 w-3" />
                  Next Follow-up
                </div>
                <div className="font-medium text-sm">
                  {lead.next_follow_up ? formatDate(lead.next_follow_up) : '-'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes Section */}
      {lead.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Latest Activity Section */}
      <Card className="border-0 bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Latest Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {lead.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div>
                <span className="font-medium">{lead.assigned_to}</span>
                <span className="text-muted-foreground"> - Lead created</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(lead.created_at)} ({getRelativeTime(lead.created_at)})
              </div>
            </div>
          </div>

          {onViewActivityLog && (
            <Button 
              variant="link" 
              className="px-0 text-sm mt-4" 
              onClick={onViewActivityLog}
            >
              View Full Activity Log →
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}