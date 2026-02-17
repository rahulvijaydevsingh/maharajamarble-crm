import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";

interface BulkProfessionalUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProfessionalsCreated: () => void;
}

interface ParsedProfessional {
  name: string;
  phone: string;
  alternate_phone: string;
  email: string;
  firm_name: string;
  professional_type: string;
  service_category: string;
  city: string;
  status: string;
  priority: number;
  assigned_to: string;
  address: string;
  notes: string;
  rowNumber: number;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  duplicateInfo?: string;
}

export function BulkProfessionalUploadDialog({
  open,
  onOpenChange,
  onProfessionalsCreated,
}: BulkProfessionalUploadDialogProps) {
  const { toast } = useToast();
  const { staffMembers } = useActiveStaff();
  const { getFieldOptions } = useControlPanelSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "validate" | "import" | "complete">("upload");
  const [parsedProfessionals, setParsedProfessionals] = useState<ParsedProfessional[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const resetState = () => {
    setStep("upload");
    setParsedProfessionals([]);
    setImportProgress(0);
    setImportedCount(0);
    setSkippedCount(0);
    setErrorCount(0);
    setIsValidating(false);
    setIsImporting(false);
  };

  const downloadTemplate = () => {
    const workbook = XLSX.utils.book_new();

    // Get options from control panel
    const typeOptions = getFieldOptions("professionals", "professional_type");
    const categoryOptions = getFieldOptions("professionals", "service_category");
    const cityOptions = getFieldOptions("professionals", "city");
    const statusOptions = getFieldOptions("professionals", "professional_status");
    const priorityOptions = getFieldOptions("professionals", "priority");

    // Sheet 1: Template
    const templateHeaders = [
      "Name*", "Phone*", "Alternate Phone", "Email", "Firm Name",
      "Professional Type*", "Service Category", "City", "Status",
      "Priority", "Assigned To", "Address", "Notes"
    ];
    const exampleRow = [
      "John Smith", "9876543210", "", "john@example.com", "Smith Constructions",
      typeOptions[0]?.label || "Contractor", categoryOptions[0]?.label || "Construction",
      cityOptions[0]?.label || "Jaipur", statusOptions[0]?.label || "Active",
      "3 - Medium", staffMembers[0]?.name || "Staff Member", "123 Main St", "Sample professional"
    ];
    const templateData = [templateHeaders, exampleRow];
    const templateSheet = XLSX.utils.aoa_to_sheet(templateData);
    templateSheet['!cols'] = templateHeaders.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(workbook, templateSheet, "Professional Template");

    // Sheet 2: Options Reference
    const optionsData: string[][] = [
      ["FIELD OPTIONS REFERENCE"],
      [""],
      ["Professional Type Options"],
      ...typeOptions.map(o => [o.label]),
      [""],
      ["Service Category Options"],
      ...categoryOptions.map(o => [o.label]),
      [""],
      ["City Options"],
      ...cityOptions.map(o => [o.label]),
      [""],
      ["Status Options"],
      ...statusOptions.map(o => [o.label]),
      [""],
      ["Priority Options"],
      ...priorityOptions.map(o => [o.label]),
      [""],
      ["Assigned To Options"],
      ...staffMembers.map(m => [m.name]),
    ];
    const optionsSheet = XLSX.utils.aoa_to_sheet(optionsData);
    optionsSheet['!cols'] = [{ wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, optionsSheet, "Options");

    // Sheet 3: Instructions
    const instructionsData = [
      ["📋 PROFESSIONAL IMPORT TEMPLATE - INSTRUCTIONS"],
      [""],
      ["REQUIRED FIELDS:"],
      ["- Name: Full name of the professional"],
      ["- Phone: 10-digit mobile number (starts with 6-9)"],
      ["- Professional Type: Must match options in 'Options' sheet"],
      [""],
      ["OPTIONAL FIELDS:"],
      ["- All other fields are optional"],
      ["- Values should match the 'Options' sheet where applicable"],
      [""],
      ["IMPORTANT NOTES:"],
      ["1. Phone numbers must be unique - duplicates will be flagged"],
      ["2. Column order must match the template exactly"],
      ["3. Maximum 1000 professionals per upload"],
      ["4. Do not delete or rename column headers"],
    ];
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
    instructionsSheet['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

    XLSX.writeFile(workbook, "professional_import_template.xlsx");
    toast({ title: "Template Downloaded" });
  };

  const getColumnValue = (row: Record<string, any>, possibleHeaders: string[]): string => {
    for (const header of possibleHeaders) {
      if (row[header] !== undefined && row[header] !== null && row[header] !== "") {
        return row[header].toString().trim();
      }
    }
    return "";
  };

  const fetchExistingPhones = async (): Promise<Map<string, string>> => {
    const phoneMap = new Map<string, string>();
    const { data } = await supabase.from("professionals").select("phone, name");
    if (data) {
      data.forEach((p: any) => phoneMap.set(p.phone, p.name));
    }
    return phoneMap;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsValidating(true);
    setStep("validate");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 0, defval: "" }) as Record<string, any>[];

      // Skip example row
      const dataRows = jsonData.filter((row, idx) => {
        if (idx === 0) {
          const name = getColumnValue(row, ["Name*", "Name"]);
          if (name === "John Smith") return false;
        }
        return true;
      });

      const existingPhones = await fetchExistingPhones();
      const typeOptions = getFieldOptions("professionals", "professional_type");
      const parsed: ParsedProfessional[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const errors: string[] = [];
        const warnings: string[] = [];

        const name = getColumnValue(row, ["Name*", "Name"]);
        const phoneRaw = getColumnValue(row, ["Phone*", "Phone"]);
        const profType = getColumnValue(row, ["Professional Type*", "Professional Type"]);

        if (!name) errors.push("Name is required");

        const phone = phoneRaw.replace(/\D/g, "").slice(-10);
        if (!phone) {
          errors.push("Phone is required");
        } else if (phone.length !== 10) {
          errors.push("Phone must be 10 digits");
        } else if (!/^[6-9]/.test(phone)) {
          errors.push("Phone must start with 6-9");
        }

        if (!profType) errors.push("Professional Type is required");

        const isDuplicate = existingPhones.has(phone);
        let duplicateInfo = "";
        if (isDuplicate) {
          duplicateInfo = existingPhones.get(phone) || "Existing professional";
          warnings.push(`Duplicate: ${duplicateInfo}`);
        }

        // Parse priority
        let priority = 3;
        const priorityRaw = getColumnValue(row, ["Priority"]);
        if (priorityRaw) {
          const num = parseInt(priorityRaw.charAt(0));
          if (num >= 1 && num <= 5) priority = num;
        }

        // Match type value
        const matchedType = typeOptions.find(
          t => t.label.toLowerCase() === profType.toLowerCase() || t.value === profType.toLowerCase()
        );

        parsed.push({
          name,
          phone,
          alternate_phone: getColumnValue(row, ["Alternate Phone"]),
          email: getColumnValue(row, ["Email"]),
          firm_name: getColumnValue(row, ["Firm Name"]),
          professional_type: matchedType?.value || profType.toLowerCase().replace(/\s+/g, "_"),
          service_category: getColumnValue(row, ["Service Category"]).toLowerCase().replace(/\s+/g, "_") || "",
          city: getColumnValue(row, ["City"]).toLowerCase() || "",
          status: getColumnValue(row, ["Status"]).toLowerCase() || "active",
          priority,
          assigned_to: getColumnValue(row, ["Assigned To"]) || staffMembers[0]?.name || "Unassigned",
          address: getColumnValue(row, ["Address"]),
          notes: getColumnValue(row, ["Notes"]),
          rowNumber: i + 2,
          errors,
          warnings,
          isDuplicate,
          duplicateInfo,
        });
      }

      setParsedProfessionals(parsed);
    } catch (error: any) {
      toast({ title: "Error parsing file", description: error.message, variant: "destructive" });
      setStep("upload");
    } finally {
      setIsValidating(false);
    }
  };

  const startImport = async () => {
    setIsImporting(true);
    setStep("import");
    let imported = 0, skipped = 0, errors = 0;

    const toImport = parsedProfessionals.filter(p => {
      if (p.errors.length > 0) return false;
      if (skipDuplicates && p.isDuplicate) return false;
      return true;
    });

    for (let i = 0; i < toImport.length; i++) {
      const p = toImport[i];
      try {
        const { error } = await supabase.from("professionals").insert({
          name: p.name,
          phone: p.phone,
          alternate_phone: p.alternate_phone || null,
          email: p.email || null,
          firm_name: p.firm_name || null,
          professional_type: p.professional_type,
          service_category: p.service_category || null,
          city: p.city || null,
          status: p.status,
          priority: p.priority,
          assigned_to: p.assigned_to,
          address: p.address || null,
          notes: p.notes || null,
        });
        if (error) throw error;
        imported++;
      } catch {
        errors++;
      }
      setImportProgress(Math.round(((i + 1) / toImport.length) * 100));
    }

    skipped = parsedProfessionals.length - toImport.length;
    setImportedCount(imported);
    setSkippedCount(skipped);
    setErrorCount(errors);
    setIsImporting(false);
    setStep("complete");
    onProfessionalsCreated();
  };

  const validCount = parsedProfessionals.filter(p => p.errors.length === 0 && !(skipDuplicates && p.isDuplicate)).length;
  const errorRows = parsedProfessionals.filter(p => p.errors.length > 0);
  const duplicateRows = parsedProfessionals.filter(p => p.isDuplicate);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetState(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Professional Upload</DialogTitle>
          <DialogDescription>Upload professionals via Excel spreadsheet</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6">
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-4">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-semibold">Upload Excel File</h3>
                <p className="text-sm text-muted-foreground">Download the template first, fill in your data, then upload</p>
              </div>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-1" /> Download Template
                </Button>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Upload File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
          </div>
        )}

        {step === "validate" && (
          <div className="space-y-4">
            {isValidating ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>Validating data...</span>
              </div>
            ) : (
              <>
                <div className="flex gap-4">
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    <CheckCircle className="h-3 w-3 mr-1" /> {validCount} Valid
                  </Badge>
                  <Badge variant="secondary" className="bg-red-100 text-red-700">
                    <XCircle className="h-3 w-3 mr-1" /> {errorRows.length} Errors
                  </Badge>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                    <AlertTriangle className="h-3 w-3 mr-1" /> {duplicateRows.length} Duplicates
                  </Badge>
                </div>

                {duplicateRows.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Checkbox checked={skipDuplicates} onCheckedChange={(c) => setSkipDuplicates(!!c)} />
                    <span className="text-sm">Skip duplicate phone numbers</span>
                  </div>
                )}

                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedProfessionals.map((p, i) => (
                        <TableRow key={i} className={p.errors.length > 0 ? "bg-destructive/5" : p.isDuplicate ? "bg-yellow-50" : ""}>
                          <TableCell>{p.rowNumber}</TableCell>
                          <TableCell>
                            {p.errors.length > 0 ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : p.isDuplicate ? (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                          </TableCell>
                          <TableCell>{p.name || '-'}</TableCell>
                          <TableCell>{p.phone || '-'}</TableCell>
                          <TableCell className="capitalize">{p.professional_type.replace('_', ' ')}</TableCell>
                          <TableCell className="text-sm">
                            {p.errors.map((e, j) => <div key={j} className="text-destructive">{e}</div>)}
                            {p.warnings.map((w, j) => <div key={j} className="text-yellow-600">{w}</div>)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={resetState}>Cancel</Button>
                  <Button onClick={startImport} disabled={validCount === 0}>
                    Import {validCount} Professional{validCount !== 1 ? 's' : ''}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "import" && (
          <div className="space-y-4 py-8">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Importing professionals...</p>
            </div>
            <Progress value={importProgress} />
            <p className="text-sm text-center text-muted-foreground">{importProgress}% complete</p>
          </div>
        )}

        {step === "complete" && (
          <div className="space-y-4 py-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h3 className="font-semibold text-lg">Import Complete</h3>
            <div className="flex gap-4 justify-center">
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                {importedCount} Imported
              </Badge>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                {skippedCount} Skipped
              </Badge>
              {errorCount > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-700">
                  {errorCount} Failed
                </Badge>
              )}
            </div>
            <Button onClick={() => { resetState(); onOpenChange(false); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
