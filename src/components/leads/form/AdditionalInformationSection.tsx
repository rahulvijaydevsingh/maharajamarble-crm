
import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadFormData } from "@/types/lead";

interface AdditionalInformationSectionProps {
  formData: LeadFormData;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export function AdditionalInformationSection({
  formData,
  onInputChange
}: AdditionalInformationSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Additional Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={onInputChange}
            placeholder="Enter any additional information about the lead"
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
