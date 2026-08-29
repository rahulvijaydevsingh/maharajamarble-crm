import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BULK_PROFESSIONAL_FIELDS, type BulkProfessionalColumnMapping, type BulkProfessionalField } from "@/lib/bulkUploadColumnDetector";

interface ProfessionalColumnMappingStepProps {
  headers: string[];
  mapping: BulkProfessionalColumnMapping;
  onChange: (header: string, field: BulkProfessionalField | null) => void;
  onContinue: () => void;
  onBack: () => void;
}

const fieldLabels: Record<BulkProfessionalField, string> = {
  name: "Name", phone: "Phone", alternate_phone: "Alternate phone", email: "Email",
  firm_name: "Firm name", professional_type: "Designation", service_category: "Service category",
  city: "City", status: "Status", priority: "Priority", assigned_to: "Assigned to",
  address: "Address", notes: "Notes",
};

export function ProfessionalColumnMappingStep({ headers, mapping, onChange, onContinue, onBack }: ProfessionalColumnMappingStepProps) {
  const canContinue = headers.some((header) => mapping[header] === "name") &&
    headers.some((header) => mapping[header] === "phone") &&
    headers.some((header) => mapping[header] === "professional_type");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h3 className="font-semibold">Column mapping</h3>
        <p className="text-sm text-muted-foreground">Map the uploaded file to CRM fields. Name, Phone, and Designation are required.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <div className="min-w-[620px] divide-y">
          {headers.map((header) => (
            <div key={header} className="grid grid-cols-[1fr_1fr_auto] items-center gap-4 p-3">
              <span className="truncate font-medium">{header}</span>
              <Select value={mapping[header] ?? "skip"} onValueChange={(value) => onChange(header, value === "skip" ? null : value as BulkProfessionalField)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip column</SelectItem>
                  {BULK_PROFESSIONAL_FIELDS.map((field) => <SelectItem key={field} value={field}>{fieldLabels[field]}</SelectItem>)}
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