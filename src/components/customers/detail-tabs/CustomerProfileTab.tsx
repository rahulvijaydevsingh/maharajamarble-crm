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
  DollarSign,
  Star,
  Clock,
  ShoppingBag
} from 'lucide-react';
import { Customer, useCustomers } from '@/hooks/useCustomers';
import { format, formatDistanceToNow } from 'date-fns';
import { PRIORITY_LEVELS, CUSTOMER_STATUSES } from '@/constants/customerConstants';
import { useToast } from '@/hooks/use-toast';
import { PhoneLink } from '@/components/shared/PhoneLink';

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
  'customer_conversion': 'Customer Conversion',
};

export function CustomerProfileTab({ customer, onEdit, onViewActivityLog }: CustomerProfileTabProps) {
  const { updateCustomer } = useCustomers();
  const { toast } = useToast();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  const statusConfig = CUSTOMER_STATUSES[customer.status] || { label: customer.status, className: 'bg-gray-100 text-gray-700' };
  const priorityConfig = PRIORITY_LEVELS[customer.priority] || { label: 'Normal', color: 'text-gray-600' };
  
  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await updateCustomer(customer.id, { status: newStatus });
      toast({
        title: "Status Updated",
        description: `Customer status changed to ${CUSTOMER_STATUSES[newStatus]?.label || newStatus}`,
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
              {customer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-2xl font-bold">{customer.name}</h2>
            <p className="text-muted-foreground capitalize">{customer.customer_type}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Customer
        </Button>
      </div>

      {/* Status & Priority Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Status</div>
            <Select 
              value={customer.status} 
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
                {Object.entries(CUSTOMER_STATUSES).map(([value, config]) => (
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
            <Badge variant="secondary" className="px-3 py-1">
              <Star className="h-3 w-3 mr-1" />
              <span className={priorityConfig.color}>{priorityConfig.label}</span>
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Source</div>
            <div className="font-medium">{sourceLabels[customer.source || ''] || customer.source || '-'}</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Assigned To</div>
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">
                  {customer.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">{customer.assigned_to}</span>
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
                <PhoneLink phone={customer.phone} className="font-medium" />
                {customer.alternate_phone && (
                  <span className="text-muted-foreground text-sm ml-2">
                    / <PhoneLink phone={customer.alternate_phone} className="text-sm" />
                  </span>
                )}
              </div>
            </div>

            {customer.email && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-green-50 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <a href={`mailto:${customer.email}`} className="text-primary hover:underline font-medium">
                    {customer.email}
                  </a>
                </div>
              </div>
            )}

            {customer.company_name && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-purple-50 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Company</div>
                  <div className="font-medium">{customer.company_name}</div>
                </div>
              </div>
            )}

            {customer.address && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-orange-50 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Address</div>
                  <div className="font-medium">{customer.address}</div>
                  {customer.city && <div className="text-sm text-muted-foreground">{customer.city}</div>}
                </div>
              </div>
            )}

            {customer.site_plus_code && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Plus Code</div>
                  <div className="font-medium">{customer.site_plus_code}</div>
                </div>
              </div>
            )}

            {customer.industry && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Industry</div>
                  <div className="font-medium capitalize">{customer.industry.replace(/_/g, ' ')}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial Summary Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-green-50 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Spent</div>
                <div className="text-xl font-bold text-green-600">
                  ₹{customer.total_spent?.toLocaleString('en-IN') || 0}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center">
                <ShoppingBag className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Orders</div>
                <div className="text-xl font-bold">{customer.total_orders || 0}</div>
              </div>
            </div>

            {customer.last_purchase && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-amber-50 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Last Purchase</div>
                  <div className="font-medium">{formatDate(customer.last_purchase)}</div>
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
                  {customer.last_follow_up ? formatDate(customer.last_follow_up) : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Calendar className="h-3 w-3" />
                  Next Follow-up
                </div>
                <div className="font-medium text-sm">
                  {customer.next_follow_up ? formatDate(customer.next_follow_up) : '-'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes Section */}
      {customer.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
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
                {customer.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div>
                <span className="font-medium">{customer.assigned_to}</span>
                <span className="text-muted-foreground"> - Customer created</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(customer.created_at)} ({getRelativeTime(customer.created_at)})
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