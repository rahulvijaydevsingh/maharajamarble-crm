import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BULK_LEAD_FIELDS, type BulkLeadField, type ColumnMapping } from "@/lib/bulkUploadColumnDetector";

interface ColumnMappingStepProps {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (header: string, field: BulkLeadField | null) => void;
  onContinue: () => void;
  onBack: () => void;
}

const fieldLabels: Record<BulkLeadField, string> = {
  name: "Name", phone: "Phone", alternate_phone: "Alternate phone", email: "Email",
  designation: "Designation", firm_name: "Firm name", source: "Source", address: "Address",
  construction_stage: "Construction stage", estimated_quantity: "Estimated quantity", materials: "Materials",
  assigned_to: "Assigned to", priority: "Priority", status: "Status", referred_by: "Referred by",
  next_action_date: "Next action date", next_action_time: "Next action time", notes: "Notes", site_plus_code: "Site Plus Code",
};

export function ColumnMappingStep({ headers, mapping, onChange, onContinue, onBack }: ColumnMappingStepProps) {
  const canContinue = headers.some((header) => mapping[header] === "name") && headers.some((header) => mapping[header] === "phone");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h3 className="font-semibold">Column mapping</h3>
        <p className="text-sm text-muted-foreground">Map the uploaded file to CRM fields. Name and Phone are required.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <div className="min-w-[620px] divide-y">
          {headers.map((header) => (
            <div key={header} className="grid grid-cols-[1fr_1fr_auto] items-center gap-4 p-3">
              <span className="truncate font-medium">{header}</span>
              <Select value={mapping[header] ?? "skip"} onValueChange={(value) => onChange(header, value === "skip" ? null : value as BulkLeadField)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip column</SelectItem>
                  {BULK_LEAD_FIELDS.map((field) => <SelectItem key={field} value={field}>{fieldLabels[field]}</SelectItem>)}
                </SelectContent>
              </Select>
              {mapping[header] ? <Badge variant="secondary">Mapped</Badge> : <Badge variant="outline">Skipped</Badge>}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between border-t pt-4">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onContinue} disabled={!canContinue}>Validate import</Button>
      </div>
    </div>
  );
}