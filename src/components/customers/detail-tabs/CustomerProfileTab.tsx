import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
import { PlusCodeLink } from '@/components/shared/PlusCodeLink';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useControlPanelSettings } from '@/hooks/useControlPanelSettings';
import { realtimeRegistry } from '@/lib/realtimeRegistry';
import { QUOTATION_UNITS } from '@/types/quotation';
import { getCustomerSourceLabel } from '@/lib/customerSource';

interface CustomerProfileTabProps {
  customer: Customer;
  onEdit: () => void;
  onViewActivityLog?: () => void;
}

export function CustomerProfileTab({ customer, onEdit, onViewActivityLog }: CustomerProfileTabProps) {
  const { getOptionLabel } = useControlPanelSettings();
  const navigate = useNavigate();
  const { updateCustomer } = useCustomers();
  const { toast } = useToast();
  const { logActivity } = useLogActivity();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [originalLead, setOriginalLead] = useState<{
    id: string;
    source: string;
    construction_stage: string | null;
    material_interests: string[] | null;
    site_location: string | null;
    estimated_quantity: number | null;
  } | null>(null);
  const [latestActivity, setLatestActivity] = useState<{
    activity_type: string;
    title: string;
    user_name: string;
    created_at: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setOriginalLead(null);

    const leadIds = Array.from(
      new Set(
        [customer.created_from_lead_id, customer.lead_id, customer.original_lead_id].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );

    if (leadIds.length > 0) {
      (async () => {
        const { data } = await supabase
          .from("leads")
          .select(
            "id, source, construction_stage, material_interests, site_location, estimated_quantity",
          )
          .in("id", leadIds);

        if (!active) {
          return;
        }

        const orderedLead = leadIds
          .map((leadId) => data?.find((lead) => lead.id === leadId))
          .find((lead) => Boolean(lead));

        if (orderedLead) {
          setOriginalLead(orderedLead);
        }
      })();
    }

    setLatestActivity(null);
    if (!customer?.id) {
      return () => {
        active = false;
      };
    }

    const load = () => {
      supabase
        .from('activity_log')
        .select('activity_type, title, user_name, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setLatestActivity((data as any) || null));
    };

    load();

    const unsubscribe = realtimeRegistry.subscribe(
      `customer_activity_${customer.id}`,
      {
        event: '*',
        schema: 'public',
        table: 'activity_log',
        filter: `customer_id=eq.${customer.id}`,
      },
      () => load()
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    customer.id,
    customer.created_from_lead_id,
    customer.lead_id,
    customer.original_lead_id,
  ]);
  
  const statusConfig = CUSTOMER_STATUSES[customer.status] || { label: customer.status, className: 'bg-gray-100 text-gray-700' };
  const priorityConfig = PRIORITY_LEVELS[customer.priority] || { label: 'Normal', color: 'text-gray-600' };
  
  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const oldStatus = customer.status;
      await updateCustomer(customer.id, { status: newStatus });
      if (oldStatus !== newStatus) {
        await logActivity({
          customer_id: customer.id,
          activity_type: 'status_change',
          activity_category: 'status_change',
          title: 'Status Updated',
          description: `Customer status changed from ${CUSTOMER_STATUSES[oldStatus]?.label || oldStatus} to ${CUSTOMER_STATUSES[newStatus]?.label || newStatus}`,
          metadata: {
            old_value: oldStatus,
            new_value: newStatus,
            field_name: 'status',
          },
        });
      }
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
            <div className="font-medium">
              {getCustomerSourceLabel(customer.source, getOptionLabel)}
            </div>
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
                <PhoneLink
                  phone={customer.phone}
                  className="font-medium"
                  log={{ customerId: customer.id, relatedEntityType: 'customer', relatedEntityId: customer.id }}
                />
                {customer.alternate_phone && (
                  <span className="text-muted-foreground text-sm ml-2">
                    / <PhoneLink
                      phone={customer.alternate_phone}
                      className="text-sm"
                      log={{ customerId: customer.id, relatedEntityType: 'customer', relatedEntityId: customer.id }}
                    />
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
                  <div className="font-medium">
                    <PlusCodeLink
                      plusCode={customer.site_plus_code}
                      log={{ customerId: customer.id, relatedEntityType: 'customer', relatedEntityId: customer.id }}
                    />
                  </div>
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
                {(() => {
                  if (!customer.next_follow_up) return <div className="font-medium text-sm">-</div>;
                  const due = new Date(customer.next_follow_up);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isOverdue = due < today;
                  return (
                    <div className={`font-medium text-sm ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
                      {formatDate(customer.next_follow_up)}
                      {isOverdue && <span className="ml-1 text-xs">(Overdue)</span>}
                    </div>
                  );
                })()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Purchase details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.materials_purchased?.length ? (
              <div>
                <div className="mb-2 text-xs text-muted-foreground">Materials purchased</div>
                <div className="flex flex-wrap gap-2">
                  {customer.materials_purchased.map((value) => (
                    <Badge key={value} variant="secondary">
                      {getOptionLabel("materials", "materials", value)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {customer.quantity_purchased !== null && customer.quantity_purchased !== undefined ? (
              <div>
                <div className="text-xs text-muted-foreground">Quantity</div>
                <div className="font-medium">
                  {customer.quantity_purchased}{" "}
                  {QUOTATION_UNITS.find((unit) => unit.value === customer.quantity_unit)?.label ||
                    customer.quantity_unit}
                </div>
              </div>
            ) : null}
            {customer.bill_number ? (
              <div>
                <div className="text-xs text-muted-foreground">Bill number</div>
                <div className="font-medium">{customer.bill_number}</div>
              </div>
            ) : null}
            {customer.profession ? (
              <div>
                <div className="text-xs text-muted-foreground">Profession</div>
                <div className="font-medium">{customer.profession}</div>
              </div>
            ) : null}
            {customer.pending_followups?.length ? (
              <div>
                <div className="mb-2 text-xs text-muted-foreground">Pending follow-ups</div>
                <div className="flex flex-wrap gap-2">
                  {customer.pending_followups.map((value) => (
                    <Badge key={value} variant="outline">
                      {getOptionLabel("customers", "pending_followup", value)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {customer.referred_by ? (
              <div>
                <div className="text-xs text-muted-foreground">Referred by</div>
                <div className="font-medium">{customer.referred_by}</div>
              </div>
            ) : null}
            {Array.isArray(customer.additional_contacts) && customer.additional_contacts.length > 0 ? (
              <div>
                <div className="mb-2 text-xs text-muted-foreground">Additional contacts</div>
                <div className="space-y-2">
                  {customer.additional_contacts.map((contact, index) => {
                    if (!contact || typeof contact !== "object" || Array.isArray(contact)) return null;
                    const record = contact as Record<string, unknown>;
                    return (
                      <div key={index} className="rounded-md border p-2">
                        <div className="font-medium">
                          {typeof record.name === "string" ? record.name : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[
                            typeof record.designation === "string" ? record.designation : "",
                            typeof record.phone === "string" ? record.phone : "",
                            typeof record.email === "string" ? record.email : "",
                          ].filter(Boolean).join(" • ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {customer.site_plus_code ? (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Location code</div>
                <PlusCodeLink
                  plusCode={customer.site_plus_code}
                  log={{
                    customerId: customer.id,
                    relatedEntityType: "customer",
                    relatedEntityId: customer.id,
                  }}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {originalLead ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Original lead
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground">Lead source</div>
                <div className="font-medium">{getOptionLabel("leads", "source", originalLead.source)}</div>
              </div>
              {originalLead.construction_stage ? (
                <div>
                  <div className="text-xs text-muted-foreground">Construction stage</div>
                  <div className="font-medium">
                    {getOptionLabel("leads", "construction_stage", originalLead.construction_stage)}
                  </div>
                </div>
              ) : null}
              {originalLead.material_interests?.length ? (
                <div>
                  <div className="mb-2 text-xs text-muted-foreground">Material interests</div>
                  <div className="flex flex-wrap gap-2">
                    {originalLead.material_interests.map((value) => (
                      <Badge key={value} variant="secondary">
                        {getOptionLabel("materials", "materials", value)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {originalLead.site_location ? (
                <div>
                  <div className="text-xs text-muted-foreground">Site location</div>
                  <div className="font-medium">{originalLead.site_location}</div>
                </div>
              ) : null}
              {originalLead.estimated_quantity !== null && originalLead.estimated_quantity !== undefined ? (
                <div>
                  <div className="text-xs text-muted-foreground">Estimated quantity</div>
                  <div className="font-medium">{originalLead.estimated_quantity}</div>
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate("/leads?view=" + originalLead.id)}
              >
                View original lead
              </Button>
            </CardContent>
          </Card>
        ) : null}
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
          {(() => {
            const display = latestActivity ?? {
              user_name: customer.assigned_to,
              title: 'Customer created',
              created_at: customer.created_at,
            };
            const initials = (display.user_name || customer.assigned_to || '?')
              .split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div>
                    <span className="font-medium">{display.user_name}</span>
                    <span className="text-muted-foreground"> - {display.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(display.created_at)} ({getRelativeTime(display.created_at)})
                  </div>
                </div>
              </div>
            );
          })()}

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