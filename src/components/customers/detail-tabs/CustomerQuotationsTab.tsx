import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, ExternalLink } from 'lucide-react';
import { Customer } from '@/hooks/useCustomers';
import { useQuotations } from '@/hooks/useQuotations';
import { format } from 'date-fns';

interface CustomerQuotationsTabProps {
  customer: Customer;
}

export function CustomerQuotationsTab({ customer }: CustomerQuotationsTabProps) {
  const { quotations } = useQuotations();
  
  const customerQuotations = quotations.filter(
    q => q.client_id === customer.id || q.client_name.toLowerCase() === customer.name.toLowerCase()
  );

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Quotations ({customerQuotations.length})</h3>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Create Quotation
        </Button>
      </div>

      {customerQuotations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No quotations found for this customer</p>
            <Button variant="outline" className="mt-4">
              <Plus className="h-4 w-4 mr-1" />
              Create First Quotation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {customerQuotations.map((quotation) => (
            <Card key={quotation.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{quotation.quotation_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(quotation.quotation_date), 'PPP')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">₹{quotation.total.toLocaleString('en-IN')}</p>
                      <Badge variant="secondary" className={statusColors[quotation.status] || ''}>
                        {quotation.status}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
