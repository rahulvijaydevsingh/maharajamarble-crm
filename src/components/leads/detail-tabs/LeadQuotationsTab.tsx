import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Download, Share2, Edit, Loader2 } from 'lucide-react';
import { Lead } from '@/hooks/useLeads';
import { useQuotations } from '@/hooks/useQuotations';
import { AddQuotationDialog } from '@/components/quotations/AddQuotationDialog';
import { QUOTATION_STATUSES, Quotation } from '@/types/quotation';
import { format } from 'date-fns';

interface LeadQuotationsTabProps {
  lead: Lead;
}

export function LeadQuotationsTab({ lead }: LeadQuotationsTabProps) {
  const { quotations, loading } = useQuotations();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null);

  // Filter quotations for this lead
  const leadQuotations = quotations.filter(q => q.client_id === lead.id);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStatusStyle = (status: string) => {
    const statusConfig = QUOTATION_STATUSES.find(s => s.value === status);
    return statusConfig?.color || 'bg-gray-100 text-gray-700';
  };

  const getStatusLabel = (status: string) => {
    const statusConfig = QUOTATION_STATUSES.find(s => s.value === status);
    return statusConfig?.label || status;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Quotations</h3>
        <Button onClick={() => {
          setEditQuotation(null);
          setAddDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Quotation
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : leadQuotations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No quotations yet. Create the first one!</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadQuotations.map((quotation) => (
                <TableRow key={quotation.id}>
                  <TableCell className="font-medium">
                    {quotation.quotation_number}
                  </TableCell>
                  <TableCell>
                    {format(new Date(quotation.quotation_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(quotation.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getStatusStyle(quotation.status)}>
                      {getStatusLabel(quotation.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddQuotationDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        editQuotation={editQuotation}
        prefillData={{
          client_name: lead.name,
          client_phone: lead.phone,
          client_email: lead.email || '',
          client_address: lead.address || lead.site_location || '',
          client_id: lead.id,
          client_type: 'lead',
        }}
      />
    </div>
  );
}
