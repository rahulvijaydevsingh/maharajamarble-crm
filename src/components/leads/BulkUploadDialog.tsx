import React, { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  FileSpreadsheet,
  Camera,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  Save,
  X,
  Keyboard,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTasks } from "@/hooks/useTasks";
import { 
  CONSTRUCTION_STAGES, 
  MATERIAL_INTERESTS, 
  LEAD_SOURCES,
  FOLLOW_UP_PRIORITIES,
} from "@/constants/leadConstants";
import { extractGPSFromExif, coordinatesToPlusCode } from "@/lib/plusCode";
import { ConstructionStage, LeadSource, FollowUpPriority } from "@/types/lead";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { PhotoLeadForm } from "./bulk-upload/PhotoLeadForm";

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadsCreated: () => void;
}

interface ParsedLead {
  name: string;
  phone: string;
  email: string;
  source: string;
  address: string;
  status: string;
  priority: number;
  assigned_to: string;
  materials: string[];
  notes: string;
  construction_stage: string;
  estimated_quantity: string;
  referred_by: string;
  next_action_date: string;
  rowNumber: number;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  duplicateInfo?: string;
}

interface PhotoLeadData {
  id: string;
  file: File;
  previewUrl: string;
  // Contact Details
  designation: string;
  name: string;
  phone: string;
  alternatePhone: string;
  email: string;
  firmName: string;
  // Site Details
  siteLocation: string;
  sitePlusCode: string | null;
  constructionStage: ConstructionStage;
  estimatedQuantity: number | null;
  materialInterests: string[];
  otherMaterial: string;
  // Source & Assignment
  leadSource: LeadSource;
  assignedTo: string;
  referredBy: string;
  // Action Trigger
  followUpPriority: FollowUpPriority;
  nextActionDate: Date;
  nextActionTime: string;
  initialNote: string;
  // Status
  status: "pending" | "saved" | "skipped" | "duplicate";
  duplicateInfo?: string;
}

const STATUS_OPTIONS = ["new", "in-progress", "quoted", "won", "lost"];
const PRIORITY_OPTIONS = [
  { value: "1", label: "1 - Very High" },
  { value: "2", label: "2 - High" },
  { value: "3", label: "3 - Medium" },
  { value: "4", label: "4 - Low" },
  { value: "5", label: "5 - Very Low" },
];
const SOURCE_OPTIONS = LEAD_SOURCES.map(s => s.label);

export function BulkUploadDialog({
  open,
  onOpenChange,
  onLeadsCreated,
}: BulkUploadDialogProps) {
  const { toast } = useToast();
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  const { addTask } = useTasks();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"excel" | "photo">("excel");
  const [step, setStep] = useState<"upload" | "select-photos" | "validate" | "import" | "complete">("upload");

  // Excel upload state
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const uploadToAttachmentsBucket = async (file: File, path: string) => {
    const { error } = await supabase.storage.from('crm-attachments').upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
  };

  const createAttachmentRecord = async (entityType: 'lead' | 'customer', entityId: string, file: { name: string; path: string; type?: string | null; size?: number | null; }) => {
    const { error } = await supabase.from('entity_attachments').insert({
      entity_type: entityType,
      entity_id: entityId,
      file_name: file.name,
      file_path: file.path,
      mime_type: file.type || null,
      file_size: file.size || null,
    });
    if (error) throw error;
  };

  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Photo upload state
  const [photoLeads, setPhotoLeads] = useState<PhotoLeadData[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isExtractingGPS, setIsExtractingGPS] = useState(false);
  const [extractGPSEnabled, setExtractGPSEnabled] = useState(true);
  
  // Apply to remaining state
  const [applyToRemaining, setApplyToRemaining] = useState({
    enabled: false,
    leadSource: false,
    assignedTo: false,
    constructionStage: false,
    followUpPriority: false,
    materialInterests: false,
  });

  // Draft state
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  // Stats
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [duplicateAttachedCount, setDuplicateAttachedCount] = useState(0);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || step !== "validate" || activeTab !== "photo") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePrevious();
      } else if (e.altKey && e.key === "ArrowRight" || (e.ctrlKey && e.key === "Enter")) {
        e.preventDefault();
        saveCurrentPhotoLead();
      } else if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        skipCurrentPhoto();
      } else if (e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        saveDraft();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, step, activeTab, currentPhotoIndex]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (step !== "validate" || activeTab !== "photo" || photoLeads.length === 0) return;

    const interval = setInterval(() => {
      saveDraft(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [step, activeTab, photoLeads]);

  const resetState = () => {
    setStep("upload");
    setExcelFile(null);
    setParsedLeads([]);
    setPhotoLeads([]);
    setCurrentPhotoIndex(0);
    setImportProgress(0);
    setImportedCount(0);
    setSkippedCount(0);
    setErrorCount(0);
    setDuplicateAttachedCount(0);
    setIsValidating(false);
    setIsImporting(false);
    setApplyToRemaining({
      enabled: false,
      leadSource: false,
      assignedTo: false,
      constructionStage: false,
      followUpPriority: false,
      materialInterests: false,
    });
    setLastSavedTime(null);
  };

  // Enhanced template download with multiple sheets
  const downloadTemplate = () => {
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Lead Template with example data
    const templateHeaders = [
      "Name*", "Phone*", "Email", "Source*", "Address", "Priority", 
      "Assigned To", "Materials", "Notes", "Status", "Construction Stage",
      "Estimated Quantity", "Site Photo URL", "Referred By", "Next Action Date", "Initial Note"
    ];
    
    const exampleRow = [
      "John Doe", "1234567890", "john@example.com", "Walk In", 
      "123 Main Street, City", "3 - Medium", staffMembers[0]?.name || "Staff Member",
      "Tiles, Marbles", "Sample lead", "new", "Medium Density",
      "500 sq ft", "", "", format(addDays(new Date(), 7), "dd-MM-yyyy"), "Follow up on tiles selection"
    ];

    const templateData = [templateHeaders, exampleRow];
    const templateSheet = XLSX.utils.aoa_to_sheet(templateData);
    
    // Set column widths
    templateSheet['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 35 },
      { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 30 }, { wch: 12 },
      { wch: 18 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 30 }
    ];
    
    XLSX.utils.book_append_sheet(workbook, templateSheet, "Lead Template");

    // Sheet 2: Options Reference
    const optionsData = [
      ["FIELD OPTIONS REFERENCE"],
      [""],
      ["Status Options"],
      ...STATUS_OPTIONS.map(s => [s]),
      [""],
      ["Priority Options"],
      ...PRIORITY_OPTIONS.map(p => [p.label]),
      [""],
      ["Assigned To Options"],
      ...staffMembers.map(m => [m.name]),
      [""],
      ["Source Options"],
      ...SOURCE_OPTIONS.map(s => [s]),
      [""],
      ["Construction Stage Options"],
      ...CONSTRUCTION_STAGES.map(s => [s.label]),
      [""],
      ["Materials Options"],
      ...MATERIAL_INTERESTS.map(m => [m.label]),
    ];
    const optionsSheet = XLSX.utils.aoa_to_sheet(optionsData);
    optionsSheet['!cols'] = [{ wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, optionsSheet, "Options");

    // Sheet 3: Instructions
    const instructionsData = [
      ["📋 LEAD IMPORT TEMPLATE - INSTRUCTIONS"],
      [""],
      ["REQUIRED FIELDS:"],
      ["- Name: Lead/customer full name (text)"],
      ["- Phone: Contact number - NO DUPLICATES ALLOWED (format: 10 digits)"],
      ["- Source: Lead acquisition source (must match options in 'Options' sheet)"],
      [""],
      ["OPTIONAL FIELDS:"],
      ["- Email: Valid email address (format: name@domain.com)"],
      ["- Priority: Use values from 'Options' sheet (1-Very High to 5-Very Low)"],
      ["- Assigned To: Team member name - must exactly match names in 'Options' sheet"],
      ["- Status: Lead status - must match values in 'Options' sheet (default: 'new')"],
      ["- Materials: Comma-separated list (e.g., 'Tiles, Marbles, Sanitary')"],
      ["- Construction Stage: Project stage from 'Options' sheet"],
      ["- Estimated Quantity: Expected order quantity (e.g., '500 sq ft')"],
      ["- Next Action Date: Format DD-MM-YYYY (e.g., 25-12-2025)"],
      [""],
      ["IMPORTANT NOTES:"],
      ["1. DUPLICATE PHONE NUMBERS: System will reject leads with phone numbers that already exist"],
      ["2. Column order must match the template exactly"],
      ["3. Do not delete or rename column headers"],
      ["4. Maximum 1000 leads per upload"],
      ["5. File size limit: 5MB"],
      ["6. Date format: DD-MM-YYYY (e.g., 25-12-2025)"],
      [""],
      ["VALIDATION ERRORS:"],
      ["If upload fails, you will receive a detailed error report showing:"],
      ["- Row number with error"],
      ["- Field name with issue"],
      ["- Error description"],
      ["- Suggested fix"],
      [""],
      ["STEPS TO IMPORT:"],
      ["1. Fill in your lead data starting from Row 3"],
      ["2. Save the file (keep it as .xlsx format)"],
      ["3. Go to Leads Management → Bulk Upload → Excel Upload"],
      ["4. Upload your file"],
      ["5. Review validation results"],
      ["6. Confirm import"],
      [""],
      ["For questions, contact system administrator."],
    ];
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
    instructionsSheet['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

    XLSX.writeFile(workbook, "lead_import_template.xlsx");
    toast({ title: "Template Downloaded", description: "Fill in the template starting from row 3 and upload it back." });
  };

  // Helper function to get column value with flexible header matching
  const getColumnValue = (row: Record<string, any>, possibleHeaders: string[]): string => {
    for (const header of possibleHeaders) {
      if (row[header] !== undefined && row[header] !== null && row[header] !== "") {
        return row[header].toString().trim();
      }
    }
    return "";
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFile(file);
    setIsValidating(true);
    setStep("validate");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Parse sheet with headers from first row - data starts from second row
      const jsonData = XLSX.utils.sheet_to_json(sheet, { 
        header: 0,  // Use first row as headers
        defval: "", // Default empty values
      }) as Record<string, any>[];

      // Skip example row if it exists (check if first data row is the example)
      const dataRows = jsonData.filter((row, idx) => {
        // Skip if this looks like the example row
        if (idx === 0) {
          const name = getColumnValue(row, ["Name*", "Name"]);
          if (name === "John Doe") return false;
        }
        return true;
      });

      const parsed: ParsedLead[] = [];
      const existingPhones = await fetchExistingPhones();

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const errors: string[] = [];
        const warnings: string[] = [];

        // Map columns (handle multiple header variations)
        const name = getColumnValue(row, ["Name*", "Name"]);
        const phoneRaw = getColumnValue(row, ["Phone*", "Phone"]);
        const source = getColumnValue(row, ["Source*", "Source"]);
        
        // Check required fields
        if (!name) {
          errors.push("Name is required");
        }

        const phone = phoneRaw.replace(/\D/g, "").slice(-10);
        if (!phone) {
          errors.push("Phone is required");
        } else if (phone.length !== 10) {
          errors.push("Phone must be 10 digits");
        }

        if (!source) {
          errors.push("Source is required");
        }

        // Check for duplicates
        const isDuplicate = existingPhones.has(phone);
        let duplicateInfo = "";
        if (isDuplicate) {
          duplicateInfo = existingPhones.get(phone) || "Existing lead";
          warnings.push(`Duplicate: ${duplicateInfo}`);
        }

        // Validate email
        const email = getColumnValue(row, ["Email"]);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          warnings.push("Invalid email format");
        }

        // Parse priority
        let priority = 3;
        const priorityRaw = getColumnValue(row, ["Priority"]);
        if (priorityRaw) {
          const priorityNum = parseInt(priorityRaw.charAt(0));
          if (priorityNum >= 1 && priorityNum <= 5) {
            priority = priorityNum;
          }
        }

        // Parse materials
        const materialsRaw = getColumnValue(row, ["Materials"]);
        const materials = materialsRaw
          ? materialsRaw.split(",").map((m: string) => m.trim()).filter(Boolean)
          : [];

        // Calculate actual row number in Excel (header is row 1, data starts row 2)
        const actualRowNumber = i + 2; // +2 because we skip example row "John Doe" if present

        parsed.push({
          name,
          phone,
          email,
          source: source || getColumnValue(row, ["Source*", "Source"]) || "Other",
          address: getColumnValue(row, ["Address"]),
          status: getColumnValue(row, ["Status"]).toLowerCase() || "new",
          priority,
          assigned_to: getColumnValue(row, ["Assigned To"]) || staffMembers[0]?.name || "Unassigned",
          materials,
          notes: getColumnValue(row, ["Notes"]),
          construction_stage: getColumnValue(row, ["Construction Stage"]),
          estimated_quantity: getColumnValue(row, ["Estimated Quantity"]),
          referred_by: getColumnValue(row, ["Referred By"]),
          next_action_date: getColumnValue(row, ["Next Action Date"]),
          rowNumber: actualRowNumber,
          errors,
          warnings,
          isDuplicate,
          duplicateInfo,
        });
      }

      setParsedLeads(parsed);
    } catch (error) {
      console.error("Error parsing Excel:", error);
      toast({ title: "Error parsing file", variant: "destructive" });
      setStep("upload");
    } finally {
      setIsValidating(false);
    }
  };

  const fetchExistingPhones = async (): Promise<Map<string, string>> => {
    const { data } = await supabase.from("leads").select("phone, alternate_phone, name");
    const map = new Map<string, string>();
    data?.forEach((lead) => {
      if (lead.phone) map.set(lead.phone, lead.name);
      if (lead.alternate_phone) map.set(lead.alternate_phone, lead.name);
    });
    return map;
  };

  const handleImport = async () => {
    setIsImporting(true);
    setStep("import");
    setImportProgress(0);

    const validLeads = parsedLeads.filter(
      (lead) => lead.errors.length === 0 && (!skipDuplicates || !lead.isDuplicate)
    );

    // Upload the Excel file once and attach it to every created lead
    let excelAttachmentPath: string | null = null;
    if (excelFile) {
      try {
        const safeName = excelFile.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
        excelAttachmentPath = `imports/${crypto.randomUUID()}-${safeName}`;
        await uploadToAttachmentsBucket(excelFile, excelAttachmentPath);
      } catch (e) {
        console.error('Excel upload failed:', e);
        // Non-blocking: importing leads should still work
        excelAttachmentPath = null;
      }
    }

    let imported = 0;
    let errors = 0;

    for (let i = 0; i < validLeads.length; i++) {
      const lead = validLeads[i];

      try {
        const { data: insertedLead, error } = await supabase
          .from("leads")
          .insert({
          name: lead.name,
          phone: lead.phone,
          email: lead.email || null,
          source: lead.source,
          address: lead.address || null,
          status: lead.status,
          priority: lead.priority,
          assigned_to: lead.assigned_to,
          material_interests: lead.materials.length > 0 ? lead.materials : null,
          notes: lead.notes || null,
          construction_stage: lead.construction_stage || null,
          estimated_quantity: lead.estimated_quantity ? parseInt(lead.estimated_quantity) : null,
          created_by: "Bulk Import",
        })
        .select('id')
        .single();

        if (error) {
          errors++;
          console.error("Insert error:", error);
        } else {
          imported++;

          if (excelAttachmentPath && insertedLead?.id) {
            try {
              await createAttachmentRecord('lead', insertedLead.id, {
                name: excelFile?.name || 'lead_import.xlsx',
                path: excelAttachmentPath,
                type: excelFile?.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                size: excelFile?.size || null,
              });
            } catch (e) {
              console.error('Failed attaching import file to lead:', e);
            }
          }
        }
      } catch (err) {
        errors++;
        console.error("Import error:", err);
      }

      setImportProgress(Math.round(((i + 1) / validLeads.length) * 100));
    }

    const skipped = parsedLeads.filter(
      (lead) => lead.errors.length > 0 || (skipDuplicates && lead.isDuplicate)
    ).length;

    setImportedCount(imported);
    setSkippedCount(skipped);
    setErrorCount(errors);
    setIsImporting(false);
    setStep("complete");
    onLeadsCreated();
  };

  // Photo Upload Handlers
  const handlePhotoSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPhotoLeads: PhotoLeadData[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const previewUrl = URL.createObjectURL(file);
      
      newPhotoLeads.push({
        id: `photo_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        previewUrl,
        designation: "owner",
        name: "",
        phone: "",
        alternatePhone: "",
        email: "",
        firmName: "",
        siteLocation: "",
        sitePlusCode: null,
        constructionStage: "plastering",
        estimatedQuantity: null,
        materialInterests: [],
        otherMaterial: "",
        leadSource: "field_visit",
        assignedTo: staffMembers[0]?.id || "",
        referredBy: "",
        followUpPriority: "normal",
        nextActionDate: addDays(new Date(), 2),
        nextActionTime: "10:00",
        initialNote: `Photo uploaded on ${format(new Date(), "PPP")}`,
        status: "pending",
      });
    }

    setPhotoLeads(newPhotoLeads);
    setStep("select-photos");
  };

  const removePhotoFromBatch = (index: number) => {
    const updated = photoLeads.filter((_, i) => i !== index);
    setPhotoLeads(updated);
    if (updated.length === 0) {
      setStep("upload");
    }
  };

  const startPhotoProcessing = async () => {
    if (extractGPSEnabled) {
      setIsExtractingGPS(true);
      
      // Extract GPS from all photos
      const updatedLeads = await Promise.all(
        photoLeads.map(async (lead) => {
          try {
            const gpsData = await extractGPSFromExif(lead.file);
            if (gpsData) {
              const plusCode = coordinatesToPlusCode(gpsData.latitude, gpsData.longitude);
              return { ...lead, sitePlusCode: plusCode };
            }
          } catch (error) {
            console.error("GPS extraction failed for", lead.file.name);
          }
          return lead;
        })
      );
      
      setPhotoLeads(updatedLeads);
      setIsExtractingGPS(false);
    }
    
    setStep("validate");
  };

  const updateCurrentPhotoLead = <K extends keyof PhotoLeadData>(field: K, value: PhotoLeadData[K]) => {
    setPhotoLeads(prev => {
      const updated = [...prev];
      updated[currentPhotoIndex] = { ...updated[currentPhotoIndex], [field]: value };
      return updated;
    });
  };

  const navigatePrevious = () => {
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(prev => prev - 1);
    }
  };

  const scrollPhotoFormToTop = () => {
    const viewport = document.querySelector(
      "#photo-lead-form [data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
    viewport?.scrollTo({ top: 0, behavior: "smooth" });

    // Focus first input after the scroll animation starts
    window.setTimeout(() => {
      const firstInput = document.querySelector(
        "#photo-lead-form input:not([disabled])"
      ) as HTMLInputElement | null;
      firstInput?.focus();
    }, 250);
  };

  const skipCurrentPhoto = () => {
    setPhotoLeads(prev => {
      const updated = [...prev];
      updated[currentPhotoIndex] = { ...updated[currentPhotoIndex], status: "skipped" };
      return updated;
    });
    setSkippedCount(prev => prev + 1);

    if (currentPhotoIndex < photoLeads.length - 1) {
      setCurrentPhotoIndex(prev => prev + 1);
    } else {
      checkBatchComplete();
    }
  };

  const saveCurrentPhotoLead = async () => {
    const lead = photoLeads[currentPhotoIndex];
    
    // Validate required fields
    if (!lead.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!lead.phone || lead.phone.length !== 10) {
      toast({ title: "Valid 10-digit phone number is required", variant: "destructive" });
      return;
    }

    // Check for duplicate
    const existingPhones = await fetchExistingPhones();
    if (existingPhones.has(lead.phone)) {
      setPhotoLeads(prev => {
        const updated = [...prev];
        updated[currentPhotoIndex] = { 
          ...updated[currentPhotoIndex], 
          status: "duplicate",
          duplicateInfo: existingPhones.get(lead.phone)
        };
        return updated;
      });
      toast({ 
        title: "Duplicate Phone Found", 
        description: `This phone belongs to: ${existingPhones.get(lead.phone)}`,
        variant: "destructive" 
      });
      return;
    }

    try {
      const assignedMember = staffMembers.find(m => m.id === lead.assignedTo);

      // Upload photo first (so attachment tab can show it immediately)
      let photoPath: string | null = null;
      try {
        const safeName = lead.file.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
        photoPath = `lead-photos/${crypto.randomUUID()}-${safeName}`;
        await uploadToAttachmentsBucket(lead.file, photoPath);
      } catch (e) {
        console.error('Photo upload failed:', e);
        photoPath = null;
      }

      const { data: insertedLead, error } = await supabase
        .from("leads")
        .insert({
        name: lead.name,
        phone: lead.phone,
        alternate_phone: lead.alternatePhone || null,
        email: lead.email || null,
        designation: lead.designation,
        firm_name: lead.firmName || null,
        source: LEAD_SOURCES.find(s => s.value === lead.leadSource)?.label || lead.leadSource,
        address: lead.siteLocation || null,
        site_location: lead.siteLocation || null,
        site_plus_code: lead.sitePlusCode,
        site_photo_url: photoPath,
        construction_stage: lead.constructionStage,
        estimated_quantity: lead.estimatedQuantity,
        material_interests: lead.materialInterests.length > 0 
          ? (lead.otherMaterial ? [...lead.materialInterests, lead.otherMaterial] : lead.materialInterests)
          : (lead.otherMaterial ? [lead.otherMaterial] : null),
        status: "new",
        priority: lead.followUpPriority === "urgent" ? 1 : lead.followUpPriority === "normal" ? 3 : 5,
        assigned_to: assignedMember?.name || staffMembers[0]?.name || "Unassigned",
        notes: lead.initialNote ? `${lead.initialNote}${lead.referredBy ? ` | Referred by: ${lead.referredBy}` : ''}` : (lead.referredBy ? `Referred by: ${lead.referredBy}` : null),
        next_follow_up: `${format(lead.nextActionDate, "yyyy-MM-dd")}T${lead.nextActionTime || '10:00'}:00`,
        created_by: "Photo Upload",
        })
        .select("id")
        .single();

      if (error) throw error;

      if (insertedLead?.id && photoPath) {
        try {
          await createAttachmentRecord('lead', insertedLead.id, {
            name: lead.file.name,
            path: photoPath,
            type: lead.file.type || 'image/*',
            size: lead.file.size,
          });
        } catch (e) {
          console.error('Failed creating attachment record for photo:', e);
        }
      }

      // Auto-create follow-up task (non-blocking; must not fail lead save)
      if (insertedLead?.id) {
        try {
          await addTask({
            title: `First Follow-up: ${lead.name}`,
            description: lead.initialNote || "Initial follow-up for new lead",
            type: "Follow-up Call",
            priority:
              lead.followUpPriority === "urgent"
                ? "High"
                : lead.followUpPriority === "normal"
                ? "Medium"
                : "Low",
            status: "Pending",
            assigned_to: assignedMember?.name || staffMembers[0]?.name || "Unassigned",
            due_date: format(lead.nextActionDate, "yyyy-MM-dd"),
            due_time: lead.nextActionTime || "10:00",
            lead_id: insertedLead.id,
            created_by: "Photo Upload",
          });
        } catch (taskError) {
          console.error("Task creation failed for photo lead:", taskError);
          toast({
            title: "Lead saved, but task creation failed",
            description: "You can create the follow-up task manually from Tasks.",
            variant: "destructive",
          });
        }
      }

      setPhotoLeads(prev => {
        const updated = [...prev];
        updated[currentPhotoIndex] = { ...updated[currentPhotoIndex], status: "saved" };
        return updated;
      });
      setImportedCount(prev => prev + 1);

      scrollPhotoFormToTop();

      // Apply values to remaining if enabled
      if (applyToRemaining.enabled && currentPhotoIndex < photoLeads.length - 1) {
        applyValuesToRemaining();
      }

      if (currentPhotoIndex < photoLeads.length - 1) {
        setCurrentPhotoIndex(prev => prev + 1);
      } else {
        checkBatchComplete();
      }
    } catch (error) {
      console.error("Error saving photo lead:", error);
      toast({ title: "Error saving lead", variant: "destructive" });
    }
  };

  const applyValuesToRemaining = () => {
    const currentLead = photoLeads[currentPhotoIndex];
    
    setPhotoLeads(prev => {
      return prev.map((lead, index) => {
        if (index <= currentPhotoIndex || lead.status !== "pending") return lead;
        
        return {
          ...lead,
          ...(applyToRemaining.leadSource && { leadSource: currentLead.leadSource }),
          ...(applyToRemaining.assignedTo && { assignedTo: currentLead.assignedTo }),
          ...(applyToRemaining.constructionStage && { constructionStage: currentLead.constructionStage }),
          ...(applyToRemaining.followUpPriority && { followUpPriority: currentLead.followUpPriority }),
          ...(applyToRemaining.materialInterests && { materialInterests: currentLead.materialInterests }),
        };
      });
    });
  };

  const checkBatchComplete = () => {
    const hasSkipped = photoLeads.some(l => l.status === "skipped");
    setStep("complete");
    onLeadsCreated();
  };

  const saveDraft = (silent = false) => {
    // In a real app, this would save to localStorage or server
    setLastSavedTime(new Date());
    if (!silent) {
      toast({ title: "Draft Saved", description: "You can continue later." });
    }
  };

  const processSkippedPhotos = () => {
    const firstSkippedIndex = photoLeads.findIndex(l => l.status === "skipped");
    if (firstSkippedIndex !== -1) {
      // Reset skipped photos to pending
      setPhotoLeads(prev => prev.map(l => l.status === "skipped" ? { ...l, status: "pending" } : l));
      setCurrentPhotoIndex(firstSkippedIndex);
      setStep("validate");
    }
  };

  const currentLead = photoLeads[currentPhotoIndex];
  const validLeadsCount = parsedLeads.filter((l) => l.errors.length === 0).length;
  const errorLeadsCount = parsedLeads.filter((l) => l.errors.length > 0).length;
  const duplicateLeadsCount = parsedLeads.filter((l) => l.isDuplicate).length;
  const completedCount = photoLeads.filter(l => l.status === "saved").length;
  const pendingCount = photoLeads.filter(l => l.status === "pending").length;
  const skippedPhotoCount = photoLeads.filter(l => l.status === "skipped").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetState();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Lead Upload
          </DialogTitle>
          <DialogDescription>
            Import multiple leads from Excel/CSV or upload site photos to create leads.
          </DialogDescription>
        </DialogHeader>

        {/* Upload Selection Step */}
        {step === "upload" && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "excel" | "photo")} className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="excel" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Excel/CSV Upload
              </TabsTrigger>
              <TabsTrigger value="photo" className="gap-2">
                <Camera className="h-4 w-4" />
                Photo Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="excel" className="mt-4 space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Download our template with multiple sheets for options reference.
                </p>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </Button>
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Accepts .xlsx, .xls, .csv (Max 5MB, up to 1000 leads)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelUpload}
                />
              </div>
            </TabsContent>

            <TabsContent value="photo" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload site photos to create leads using the Smart Lead Entry form. GPS coordinates will be extracted automatically.
              </p>

              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => photoInputRef.current?.click()}
              >
                <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">📷 Select Photos to Create Leads</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Accepts .jpg, .jpeg, .png, .heic (Max 10MB per photo, up to 50 photos)
                </p>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoSelection}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Photo Selection Preview Step */}
        {step === "select-photos" && activeTab === "photo" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="font-medium">Selected: {photoLeads.length} photos</span>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="extractGPS"
                  checked={extractGPSEnabled}
                  onCheckedChange={(checked) => setExtractGPSEnabled(checked === true)}
                />
                <Label htmlFor="extractGPS" className="text-sm">
                  ☑️ Extract GPS coordinates from all photos
                </Label>
              </div>
            </div>

            <ScrollArea className="flex-1 border rounded-lg p-4">
              <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                {photoLeads.map((photo, index) => (
                  <div key={photo.id} className="relative group">
                    <img
                      src={photo.previewUrl}
                      alt={`Photo ${index + 1}`}
                      className="w-full aspect-square object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => removePhotoFromBatch(index)}
                      className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                      {index + 1}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Cancel
              </Button>
              <Button onClick={startPhotoProcessing} disabled={isExtractingGPS}>
                {isExtractingGPS ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting GPS...
                  </>
                ) : (
                  <>
                    Start Processing →
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Excel Validation Step */}
        {step === "validate" && activeTab === "excel" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {isValidating ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Validating data...</span>
              </div>
            ) : (
              <>
                <div className="flex gap-4 mb-4">
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    Valid: {validLeadsCount}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    Errors: {errorLeadsCount}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Duplicates: {duplicateLeadsCount}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <Checkbox
                    id="skipDuplicates"
                    checked={skipDuplicates}
                    onCheckedChange={(checked) => setSkipDuplicates(checked === true)}
                  />
                  <Label htmlFor="skipDuplicates">Skip duplicate phone numbers</Label>
                </div>

                <ScrollArea className="flex-1 border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Row</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[200px]">Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedLeads.map((lead, idx) => (
                        <TableRow
                          key={idx}
                          className={lead.errors.length > 0 ? "bg-destructive/10" : lead.isDuplicate ? "bg-amber-500/10" : ""}
                        >
                          <TableCell>{lead.rowNumber}</TableCell>
                          <TableCell>{lead.name || "-"}</TableCell>
                          <TableCell>{lead.phone || "-"}</TableCell>
                          <TableCell>{lead.source || "-"}</TableCell>
                          <TableCell>{lead.status}</TableCell>
                          <TableCell>
                            {lead.errors.length > 0 && (
                              <div className="text-xs text-destructive">{lead.errors.join(", ")}</div>
                            )}
                            {lead.warnings.length > 0 && (
                              <div className="text-xs text-amber-600">{lead.warnings.join(", ")}</div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <div className="flex justify-between mt-4 pt-4 border-t">
                  <Button variant="outline" onClick={() => setStep("upload")}>
                    Back
                  </Button>
                  <Button onClick={handleImport} disabled={validLeadsCount === 0}>
                    Import {skipDuplicates ? validLeadsCount - duplicateLeadsCount : validLeadsCount} Leads
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Photo Lead Entry Step - Smart Form Integration */}
        {step === "validate" && activeTab === "photo" && photoLeads.length > 0 && currentLead && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Batch Navigation Header */}
            <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg mb-4">
              <div className="flex items-center gap-3">
                <Camera className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  Lead {currentPhotoIndex + 1} of {photoLeads.length}
                </span>
                <Progress value={((currentPhotoIndex + 1) / photoLeads.length) * 100} className="w-24 h-2" />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {completedCount}
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <SkipForward className="h-3 w-3 text-amber-500" />
                  {skippedPhotoCount}
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="h-3 w-3" />
                  {pendingCount}
                </Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Keyboard className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p>Alt+← Previous | Alt+→/Ctrl+Enter Save & Next</p>
                      <p>Alt+S Skip | Ctrl+D Save Draft</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Main Content - Photo + Form */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden min-h-0">
              {/* Photo Preview */}
              <div className="flex flex-col gap-3 min-h-0">
                <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden border">
                  <img
                    src={currentLead.previewUrl}
                    alt={`Photo ${currentPhotoIndex + 1}`}
                    className="w-full h-full object-contain"
                  />
                  {currentLead.sitePlusCode && (
                    <Badge className="absolute bottom-2 left-2 bg-green-600">
                      📍 {currentLead.sitePlusCode}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Photo {currentPhotoIndex + 1} of {photoLeads.length}: {currentLead.file.name}
                </p>
              </div>

              {/* Lead Entry Form */}
              <div className="min-h-0">
                <PhotoLeadForm
                  currentLead={currentLead}
                  onUpdateLead={updateCurrentPhotoLead}
                  applyToRemaining={applyToRemaining}
                  onApplyToRemainingChange={setApplyToRemaining}
                />
              </div>
            </div>

            {/* Navigation Footer */}
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigatePrevious}
                  disabled={currentPhotoIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                {lastSavedTime && (
                  <span className="text-xs text-muted-foreground">
                    💾 Last saved: {format(lastSavedTime, "h:mm a")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => saveDraft()}>
                  <Save className="h-4 w-4 mr-1" />
                  Save Draft
                </Button>
                <Button variant="secondary" size="sm" onClick={skipCurrentPhoto}>
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip Photo
                </Button>
                <Button size="sm" onClick={saveCurrentPhotoLead}>
                  💾 Save & Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Import Progress */}
        {step === "import" && (
          <div className="flex-1 flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Importing leads...</p>
            <Progress value={importProgress} className="w-64 mt-4" />
            <p className="text-sm text-muted-foreground mt-2">{importProgress}% complete</p>
          </div>
        )}

        {/* Completion Screen */}
        {step === "complete" && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold">
              {activeTab === "photo" ? "Batch Upload Complete!" : "Import Complete!"}
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{importedCount}</p>
                <p className="text-sm text-muted-foreground">Leads Created</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-600">{skippedCount}</p>
                <p className="text-sm text-muted-foreground">Skipped</p>
              </div>
              {duplicateAttachedCount > 0 && (
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">{duplicateAttachedCount}</p>
                  <p className="text-sm text-muted-foreground">Photos Attached</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">{errorCount}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-3 mt-8">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                📋 View Created Leads
              </Button>
              {skippedPhotoCount > 0 && activeTab === "photo" && (
                <Button variant="secondary" onClick={processSkippedPhotos}>
                  ⏭️ Process Skipped Photos ({skippedPhotoCount})
                </Button>
              )}
              <Button onClick={resetState}>
                ✨ Start New Batch
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
