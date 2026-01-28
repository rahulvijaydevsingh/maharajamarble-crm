import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Paperclip, Upload } from 'lucide-react';
import { Customer } from '@/hooks/useCustomers';

interface CustomerAttachmentsTabProps {
  customer: Customer;
}

export function CustomerAttachmentsTab({ customer }: CustomerAttachmentsTabProps) {
  // TODO: Implement attachments storage and retrieval
  const attachments: any[] = [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Attachments ({attachments.length})</h3>
        <Button size="sm">
          <Upload className="h-4 w-4 mr-1" />
          Upload File
        </Button>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <Paperclip className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No attachments yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Upload documents, images, or other files related to this customer
          </p>
          <Button variant="outline" className="mt-4">
            <Plus className="h-4 w-4 mr-1" />
            Upload First File
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
