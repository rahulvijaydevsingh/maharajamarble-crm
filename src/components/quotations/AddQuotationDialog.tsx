import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuotationLineItems } from './QuotationLineItems';
import { QuotationAttachments } from './QuotationAttachments';
import { ClientSearchSelect, ClientOption } from './ClientSearchSelect';
import { Quotation, QuotationItem, QuotationInsert, QUOTATION_STATUSES } from '@/types/quotation';
import { useQuotations } from '@/hooks/useQuotations';
import { useLeads } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

interface AddQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editQuotation?: Quotation | null;
  prefillData?: {
    client_name?: string;
    client_phone?: string;
    client_email?: string;
    client_address?: string;
    client_id?: string;
    client_type?: 'lead' | 'customer';
  };
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File;
  preview?: string;
}

export function AddQuotationDialog({ 
  open, 
  onOpenChange, 
  editQuotation,
  prefillData 
}: AddQuotationDialogProps) {
  const { addQuotation, updateQuotation } = useQuotations();
  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { profile } = useAuth();
  
  const [formData, setFormData] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    client_address: '',
    quotation_date: format(new Date(), 'yyyy-MM-dd'),
    gst_percentage: 18,
    status: 'draft',
    notes: '',
  });

  const [items, setItems] = useState<QuotationItem[]>([]);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedClientType, setSelectedClientType] = useState<'lead' | 'customer'>('lead');

  // Transform leads and customers to ClientOption format
  const leadOptions: ClientOption[] = useMemo(() => 
    leads.map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      address: l.address,
      type: 'lead' as const,
    })), [leads]);

  const customerOptions: ClientOption[] = useMemo(() => 
    customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      type: 'customer' as const,
    })), [customers]);

  // Calculate totals
  const calculations = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const gstAmount = subtotal * (formData.gst_percentage / 100);
    const total = subtotal + gstAmount;
    return { subtotal, gstAmount, total };
  }, [items, formData.gst_percentage]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (editQuotation) {
        setFormData({
          client_name: editQuotation.client_name,
          client_phone: editQuotation.client_phone || '',
          client_email: editQuotation.client_email || '',
          client_address: editQuotation.client_address || '',
          quotation_date: editQuotation.quotation_date,
          gst_percentage: editQuotation.gst_percentage,
          status: editQuotation.status,
          notes: editQuotation.notes || '',
        });
        setItems(editQuotation.items || []);
        setSelectedClientId(editQuotation.client_id || '');
        setSelectedClientType(editQuotation.client_type || 'lead');
      } else if (prefillData) {
        setFormData(prev => ({
          ...prev,
          client_name: prefillData.client_name || '',
          client_phone: prefillData.client_phone || '',
          client_email: prefillData.client_email || '',
          client_address: prefillData.client_address || '',
        }));
        setSelectedClientId(prefillData.client_id || '');
        setSelectedClientType(prefillData.client_type || 'lead');
      } else {
        // Reset to defaults
        setFormData({
          client_name: '',
          client_phone: '',
          client_email: '',
          client_address: '',
          quotation_date: format(new Date(), 'yyyy-MM-dd'),
          gst_percentage: 18,
          status: 'draft',
          notes: '',
        });
        setItems([]);
        setSelectedClientId('');
        setSelectedClientType('lead');
      }
      setAttachments([]);
    }
  }, [open, editQuotation, prefillData]);

  // Handle client selection from search
  const handleClientSelect = (client: ClientOption | null) => {
    if (client) {
      setSelectedClientId(client.id);
      setSelectedClientType(client.type);
      setFormData(prev => ({
        ...prev,
        client_name: client.name,
        client_phone: client.phone,
        client_email: client.email || '',
        client_address: client.address || '',
      }));
    } else {
      setSelectedClientId('');
      setFormData(prev => ({
        ...prev,
        client_name: '',
        client_phone: '',
        client_email: '',
        client_address: '',
      }));
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.client_name) {
      return;
    }

    setIsSubmitting(true);

    try {
      const quotationData: QuotationInsert = {
        client_name: formData.client_name,
        client_phone: formData.client_phone,
        client_email: formData.client_email,
        client_address: formData.client_address,
        client_id: selectedClientId || undefined,
        client_type: selectedClientType,
        quotation_date: formData.quotation_date,
        gst_percentage: formData.gst_percentage,
        status: formData.status,
        notes: formData.notes,
        assigned_to: profile?.full_name || profile?.email || 'System',
      };

      const itemsData = items.map(({ id, ...item }) => item);

      if (editQuotation) {
        await updateQuotation(editQuotation.id, quotationData, itemsData);
      } else {
        await addQuotation(quotationData, itemsData);
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving quotation:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editQuotation ? 'Edit Quotation' : 'New Quotation'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client Selection */}
          <div className="space-y-2">
            <Label>Select Client (Lead/Customer)</Label>
            <ClientSearchSelect
              leads={leadOptions}
              customers={customerOptions}
              selectedId={selectedClientId}
              onSelect={handleClientSelect}
              placeholder="Search and select a client..."
            />
            <p className="text-xs text-muted-foreground">
              Search by name or phone number. Or enter details manually below.
            </p>
          </div>

          {/* Client Information */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client_name">Client Name *</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData(prev => ({ ...prev, client_name: e.target.value }))}
                placeholder="Enter client name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_phone">Phone</Label>
              <Input
                id="client_phone"
                value={formData.client_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, client_phone: e.target.value }))}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quotation_date">Date</Label>
              <Input
                id="quotation_date"
                type="date"
                value={formData.quotation_date}
                onChange={(e) => setFormData(prev => ({ ...prev, quotation_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_address">Address</Label>
            <Input
              id="client_address"
              value={formData.client_address}
              onChange={(e) => setFormData(prev => ({ ...prev, client_address: e.target.value }))}
              placeholder="Client address"
            />
          </div>

          {/* Line Items */}
          <QuotationLineItems items={items} onChange={setItems} />

          {/* Attachments */}
          <QuotationAttachments attachments={attachments} onChange={setAttachments} />

          {/* Calculations */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span>{formatCurrency(calculations.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">GST (%):</span>
                <Input
                  type="number"
                  value={formData.gst_percentage}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    gst_percentage: parseFloat(e.target.value) || 0 
                  }))}
                  className="w-20 h-8 text-right"
                  min={0}
                  max={100}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GST Amount:</span>
                <span>{formatCurrency(calculations.gstAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold border-t pt-2">
                <span>Total:</span>
                <span>{formatCurrency(calculations.total)}</span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {QUOTATION_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !formData.client_name}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isSubmitting 
                  ? 'Saving...' 
                  : editQuotation 
                    ? 'Update Quotation' 
                    : 'Save Quotation'
                }
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
