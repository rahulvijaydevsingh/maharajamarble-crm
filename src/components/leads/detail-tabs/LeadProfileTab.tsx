import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Edit, 
  Phone, 
  Mail, 
  MapPin, 
  Building2, 
  Calendar, 
  User, 
  Star,
  Briefcase,
  Layers,
  Box,
  FileText,
  Clock,
  UserCheck,
  Activity
} from 'lucide-react';
import { Lead } from '@/hooks/useLeads';
import { format, formatDistanceToNow } from 'date-fns';

interface LeadProfileTabProps {
  lead: Lead;
  onEdit: () => void;
  onViewActivityLog?: () => void;
}

const statusStyles: Record<string, { label: string; className: string; icon: string }> = {
  'new': { label: 'New', className: 'bg-blue-100 text-blue-700 border-blue-200', icon: '🆕' },
  'in-progress': { label: 'In Progress', className: 'bg-amber-100 text-amber-700 border-amber-200', icon: '🔄' },
  'quoted': { label: 'Quoted', className: 'bg-purple-100 text-purple-700 border-purple-200', icon: '📝' },
  'won': { label: 'Won', className: 'bg-green-100 text-green-700 border-green-200', icon: '🏆' },
  'lost': { label: 'Lost', className: 'bg-red-100 text-red-700 border-red-200', icon: '❌' },
};

const sourceLabels: Record<string, { label: string; icon: string }> = {
  'walk_in': { label: 'Walk-in', icon: '🚶' },
  'field_visit': { label: 'Field Visit', icon: '🏗️' },
  'cold_call': { label: 'Cold Call', icon: '📞' },
  'online_enquiry': { label: 'Online Enquiry', icon: '🌐' },
  'professional_referral': { label: 'Professional Referral', icon: '🤝' },
};

const priorityConfig: Record<number, { label: string; className: string; icon: string }> = {
  1: { label: 'Very High', className: 'bg-red-100 text-red-700 border-red-200', icon: '🔴' },
  2: { label: 'High', className: 'bg-orange-100 text-orange-700 border-orange-200', icon: '🟠' },
  3: { label: 'Medium', className: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: '🟡' },
  4: { label: 'Low', className: 'bg-green-100 text-green-700 border-green-200', icon: '🟢' },
  5: { label: 'Very Low', className: 'bg-gray-100 text-gray-700 border-gray-200', icon: '⚪' },
};

export function LeadProfileTab({ lead, onEdit, onViewActivityLog }: LeadProfileTabProps) {
  const statusConfig = statusStyles[lead.status] || { label: lead.status, className: 'bg-gray-100 text-gray-700 border-gray-200', icon: '📋' };
  const priority = priorityConfig[lead.priority] || priorityConfig[3];
  const source = sourceLabels[lead.source] || { label: lead.source, icon: '📍' };
  
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

  const getUserInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
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

      {/* Status & Priority Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Status</p>
                <Badge variant="outline" className={`mt-1 ${statusConfig.className}`}>
                  {statusConfig.icon} {statusConfig.label}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Priority</p>
              <Badge variant="outline" className={`mt-1 ${priority.className}`}>
                {priority.icon} {priority.label}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Source</p>
              <p className="mt-1 font-medium text-sm">{source.icon} {source.label}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Assigned To</p>
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getUserInitials(lead.assigned_to)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{lead.assigned_to}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Full Name</p>
                <p className="font-semibold text-foreground">{lead.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Designation</p>
                <p className="font-medium capitalize">{formatValue(lead.designation)}</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Primary Phone</p>
                  <a href={`tel:${lead.phone}`} className="font-medium text-primary hover:underline">
                    {lead.phone}
                  </a>
                </div>
              </div>

              {lead.alternate_phone && (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Alternate Phone</p>
                    <a href={`tel:${lead.alternate_phone}`} className="font-medium hover:underline">
                      {lead.alternate_phone}
                    </a>
                  </div>
                </div>
              )}

              {lead.email && (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100">
                    <Mail className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <a href={`mailto:${lead.email}`} className="font-medium text-blue-600 hover:underline">
                      {lead.email}
                    </a>
                  </div>
                </div>
              )}

              {lead.firm_name && (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-purple-100">
                    <Building2 className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Firm / Company</p>
                    <p className="font-medium">{lead.firm_name}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Site & Project Details Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Site & Project Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(lead.address || lead.site_location) && (
              <div className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-100 shrink-0 mt-0.5">
                  <MapPin className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Address / Site Location</p>
                  <p className="font-medium">{formatValue(lead.address || lead.site_location)}</p>
                </div>
              </div>
            )}

            {lead.construction_stage && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-orange-100">
                  <Layers className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Construction Stage</p>
                  <p className="font-medium capitalize">{lead.construction_stage.replace(/_/g, ' ')}</p>
                </div>
              </div>
            )}

            {lead.material_interests && (lead.material_interests as string[]).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                  <Box className="h-3 w-3" /> Material Interests
                </p>
                <div className="flex flex-wrap gap-2">
                  {(lead.material_interests as string[]).map((material, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary" 
                      className="bg-primary/10 text-primary border-primary/20 capitalize"
                    >
                      {material.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {lead.estimated_quantity && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100">
                  <Briefcase className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Estimated Quantity</p>
                  <p className="font-medium">{lead.estimated_quantity.toLocaleString()} sq.ft.</p>
                </div>
              </div>
            )}

            {!lead.address && !lead.site_location && !lead.construction_stage && 
             !(lead.material_interests as string[])?.length && !lead.estimated_quantity && (
              <div className="text-center py-6 text-muted-foreground">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No site details available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes Card */}
        {lead.notes && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                <p className="text-sm text-foreground whitespace-pre-wrap">{lead.notes}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timeline Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Timeline & Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-600 font-medium mb-1">Created</p>
                <p className="font-semibold text-blue-800">{formatDate(lead.created_at)}</p>
                <p className="text-xs text-blue-600">{getRelativeTime(lead.created_at)}</p>
              </div>
              
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-600 font-medium mb-1 flex items-center gap-1">
                  <UserCheck className="h-3 w-3" /> Created By
                </p>
                <p className="font-semibold text-gray-800">{lead.created_by}</p>
              </div>

              <div className={`p-3 rounded-lg ${lead.last_follow_up ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'} border`}>
                <p className={`text-xs font-medium mb-1 ${lead.last_follow_up ? 'text-green-600' : 'text-gray-600'}`}>
                  Last Follow-up
                </p>
                <p className={`font-semibold ${lead.last_follow_up ? 'text-green-800' : 'text-gray-500'}`}>
                  {formatDate(lead.last_follow_up)}
                </p>
              </div>

              <div className={`p-3 rounded-lg ${lead.next_follow_up ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'} border`}>
                <p className={`text-xs font-medium mb-1 ${lead.next_follow_up ? 'text-amber-600' : 'text-gray-600'}`}>
                  Next Follow-up
                </p>
                <p className={`font-semibold ${lead.next_follow_up ? 'text-amber-800' : 'text-gray-500'}`}>
                  {formatDate(lead.next_follow_up)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Latest Activity Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Latest Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 text-sm p-3 rounded-lg bg-muted/50">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {getUserInitials(lead.assigned_to)}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="font-medium">{lead.assigned_to}</span>
              <span className="text-muted-foreground"> - Lead created</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getRelativeTime(lead.created_at)}
              </p>
            </div>
          </div>

          <Button 
            variant="link" 
            className="px-0 text-sm mt-3" 
            onClick={onViewActivityLog}
          >
            View Full Activity Log →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}