import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Users, Search, X, Phone, Mail, Building2, Loader2, PlusCircle, UserPlus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeadSource, ProfessionalRef } from "@/types/lead";
import { LEAD_SOURCES as FALLBACK_LEAD_SOURCES } from "@/constants/leadConstants";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { buildStaffGroups } from "@/lib/staffSelect";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import { useProfessionals } from "@/hooks/useProfessionals";
import { usePhoneDuplicateCheck, DuplicateCheckResult } from "@/hooks/usePhoneDuplicateCheck";
import { DuplicateLeadModal } from "@/components/leads/DuplicateLeadModal";

interface SourceRelationshipSectionProps {
  leadSource: LeadSource;
  referredBy: ProfessionalRef | null;
  assignedTo: string;
  onSourceChange: (source: LeadSource) => void;
  onReferredByChange: (professional: ProfessionalRef | null) => void;
  onAssignedToChange: (assignedTo: string) => void;
  validationErrors?: { [key: string]: string };
}

export function SourceRelationshipSection({
  leadSource,
  referredBy,
  assignedTo,
  onSourceChange,
  onReferredByChange,
  onAssignedToChange,
  validationErrors = {},
}: SourceRelationshipSectionProps) {
  const [professionalSearchOpen, setProfessionalSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  const { getFieldOptions } = useControlPanelSettings();
  const { professionals, addProfessional, loading: profLoading } = useProfessionals();
  const { checkDuplicate, results: dupResults, clearResult } = usePhoneDuplicateCheck();

  // Lead duplicate local state
  const [leadDupResult, setLeadDupResult] = useState<DuplicateCheckResult | null>(null);
  const [leadDupModalOpen, setLeadDupModalOpen] = useState(false);
  const lastOpenedPhoneRef = useRef<string>("");

  // Inline Quick-Add state
  const [showInlineQuickAdd, setShowInlineQuickAdd] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddPhone, setQuickAddPhone] = useState("");
  const [quickAddType, setQuickAddType] = useState("");
  const [quickAddFirmName, setQuickAddFirmName] = useState("");
  const [quickAddEmail, setQuickAddEmail] = useState("");
  const [quickAddCity, setQuickAddCity] = useState("");
  const [quickAddServiceCategory, setQuickAddServiceCategory] = useState("");
  const [quickAddStatus, setQuickAddStatus] = useState("");
  const [quickAddPriority, setQuickAddPriority] = useState("");
  const [quickAddAdvancedOpen, setQuickAddAdvancedOpen] = useState(false);
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  // Dynamic option lists from Control Panel
  const professionalTypeOptions = useMemo(() => getFieldOptions("professionals", "professional_type"), [getFieldOptions]);
  const professionalCityOptions = useMemo(() => getFieldOptions("professionals", "city"), [getFieldOptions]);
  const professionalServiceCategoryOptions = useMemo(() => getFieldOptions("professionals", "service_category"), [getFieldOptions]);
  const professionalStatusOptions = useMemo(() => getFieldOptions("professionals", "professional_status"), [getFieldOptions]);
  const professionalPriorityOptions = useMemo(() => getFieldOptions("professionals", "priority"), [getFieldOptions]);

  // Map DB professionals to the format used by the UI
  const mappedProfessionals = useMemo(() => {
    return professionals.map(p => ({
      id: p.id,
      name: p.name,
      firmName: p.firm_name || "",
      type: p.professional_type || "contractor",
      phone: p.phone || undefined,
      email: p.email || undefined,
    }));
  }, [professionals]);

  // Use control panel options, fallback to constants
  const LEAD_SOURCES = useMemo(() => {
    const cpOptions = getFieldOptions("leads", "source");
    if (cpOptions.length > 0) {
      return cpOptions.map(o => ({ value: o.value, label: o.label, autoFollowUpHours: 24 }));
    }
    return FALLBACK_LEAD_SOURCES;
  }, [getFieldOptions]);

  const staffGroups = useMemo(() => buildStaffGroups(staffMembers), [staffMembers]);

  // Show "Referred By" field only for Professional Referral or Walk-in sources
  const showReferredBy = leadSource === "professional_referral" || leadSource === "walk_in";
  const referralRequired = leadSource === "professional_referral";

  // Filter professionals based on search query
  const filteredProfessionals = useMemo(() => {
    if (!searchQuery) return mappedProfessionals;
    const query = searchQuery.toLowerCase();
    return mappedProfessionals.filter(
      prof =>
        prof.name.toLowerCase().includes(query) ||
        prof.firmName.toLowerCase().includes(query) ||
        prof.phone?.includes(query) ||
        prof.email?.toLowerCase().includes(query) ||
        prof.type.toLowerCase().includes(query)
    );
  }, [searchQuery, mappedProfessionals]);

  // Dynamic label lookup against Control Panel options
  const getProfessionalTypeLabel = useCallback((type: string) => {
    return professionalTypeOptions.find(o => o.value === type)?.label || type;
  }, [professionalTypeOptions]);

  // Cosmetic badge color mapping (preserved Tailwind colors)
  const getProfessionalTypeBadgeColor = (type: string) => {
    switch (type) {
      case "architect": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "builder": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "contractor": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "interior_designer": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const resetQuickAdd = () => {
    setShowInlineQuickAdd(false);
    setQuickAddName(""); setQuickAddPhone(""); setQuickAddType("");
    setQuickAddFirmName(""); setQuickAddEmail(""); setQuickAddCity("");
    setQuickAddServiceCategory(""); setQuickAddStatus("");
    setQuickAddPriority(""); setQuickAddAdvancedOpen(false);
    clearResult("quickAddPhone");
    setLeadDupResult(null);
    lastOpenedPhoneRef.current = "";
  };

  useEffect(() => {
    const result = dupResults["quickAddPhone"];
    if (result?.found && result.type === "lead") {
      setLeadDupResult(result);
      const digits = quickAddPhone.replace(/\D/g, "");
      if (digits !== lastOpenedPhoneRef.current) {
        setLeadDupModalOpen(true);
        lastOpenedPhoneRef.current = digits;
      }
    } else {
      setLeadDupResult(null);
      lastOpenedPhoneRef.current = "";
    }
  }, [dupResults]);

  const handleQuickAddSubmit = useCallback(async () => {
    if (!quickAddName.trim() || !quickAddPhone.trim() || !quickAddType) return;
    setQuickAddLoading(true);
    try {
      const staff = staffMembers.find(m => m.id === assignedTo);
      const newProf = await addProfessional({
        name: quickAddName.trim(),
        phone: quickAddPhone.replace(/\D/g, ""),
        professional_type: quickAddType,
        firm_name: quickAddFirmName.trim() || null,
        email: quickAddEmail.trim() || null,
        city: quickAddCity || null,
        service_category: quickAddServiceCategory || null,
        status: quickAddStatus || "active",
        priority: quickAddPriority ? Number(quickAddPriority) : undefined,
        assigned_to: staff?.full_name || null,
      });
      if (newProf) {
        onReferredByChange({
          id: newProf.id,
          name: newProf.name,
          firmName: newProf.firm_name || "",
          type: (newProf.professional_type || "contractor") as any,
          phone: newProf.phone || undefined,
          email: newProf.email || undefined,
        });
        setProfessionalSearchOpen(false);
        setShowInlineQuickAdd(false);
        resetQuickAdd();
      }
    } finally {
      setQuickAddLoading(false);
    }
  }, [
    quickAddName, quickAddPhone, quickAddType, quickAddFirmName, quickAddEmail,
    quickAddCity, quickAddServiceCategory, quickAddStatus, quickAddPriority,
    assignedTo, addProfessional, onReferredByChange, staffMembers
  ]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Group 3: Source & Relationship
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lead Source */}
          <div className="space-y-2">
            <Label htmlFor="leadSource">Lead Source *</Label>
            <Select
              value={leadSource}
              onValueChange={(value) => onSourceChange(value as LeadSource)}
            >
              <SelectTrigger className={validationErrors.leadSource ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select lead source" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((source) => (
                  <SelectItem key={source.value} value={source.value}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.leadSource && (
              <p className="text-sm text-destructive">{validationErrors.leadSource}</p>
            )}
          </div>

          {/* Assign To */}
          <div className="space-y-2">
            <Label htmlFor="assignedTo">Assign To *</Label>
            <Select value={assignedTo} onValueChange={onAssignedToChange}>
              <SelectTrigger className={validationErrors.assignedTo ? 'border-destructive' : ''}>
                <SelectValue placeholder={staffLoading ? "Loading..." : "Select team member"} />
              </SelectTrigger>
              <SelectContent>
                {staffGroups.map((group, idx) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-xs text-muted-foreground">
                      {group.label}
                    </SelectLabel>
                    {group.members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <span className="truncate">{member._display}</span>
                      </SelectItem>
                    ))}
                    {idx < staffGroups.length - 1 && <SelectSeparator />}
                  </SelectGroup>
                ))}
                {assignedTo && !staffMembers.find(m => m.id === assignedTo) && (
                  <SelectItem key={assignedTo} value={assignedTo}>
                    Unassigned - {assignedTo}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {validationErrors.assignedTo && (
              <p className="text-sm text-destructive">{validationErrors.assignedTo}</p>
            )}
          </div>
        </div>

        {/* Referred By - Searchable Professional Lookup */}
        {showReferredBy && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Referred By {referralRequired && "*"}
              {!referralRequired && <span className="text-muted-foreground text-xs">(Optional)</span>}
            </Label>

            {referredBy ? (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <p className="font-medium">{referredBy.name}</p>
                  <p className="text-sm text-muted-foreground">{referredBy.firmName}</p>
                  {referredBy.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {referredBy.phone}
                    </p>
                  )}
                </div>
                <Badge className={getProfessionalTypeBadgeColor(referredBy.type)}>
                  {getProfessionalTypeLabel(referredBy.type)}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onReferredByChange(null)}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Popover open={professionalSearchOpen} onOpenChange={setProfessionalSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={professionalSearchOpen}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      validationErrors.referredBy && "border-destructive"
                    )}
                  >
                    <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                    Search by name, phone, firm, email...
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[450px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by name, phone, firm, designation, email..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      {filteredProfessionals.length === 0 && !searchQuery.trim() && (
                        <CommandEmpty>{profLoading ? "Loading professionals..." : "No professional found."}</CommandEmpty>
                      )}
                      <CommandGroup heading="Professionals">
                        {filteredProfessionals.map((prof) => (
                          <CommandItem
                            key={prof.id}
                            value={`${prof.id}-${prof.name}-${prof.phone}-${prof.firmName}`}
                            onSelect={() => {
                              onReferredByChange({
                                id: prof.id,
                                name: prof.name,
                                firmName: prof.firmName,
                                type: prof.type as "architect" | "builder" | "contractor" | "interior_designer",
                                phone: prof.phone,
                                email: prof.email,
                              });
                              setProfessionalSearchOpen(false);
                              setSearchQuery("");
                            }}
                            className="flex flex-col items-start gap-1 py-3"
                          >
                            <div className="flex items-center justify-between w-full">
                              <div>
                                <p className="font-medium">{prof.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Building2 className="h-3 w-3" />
                                    {prof.firmName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  {prof.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {prof.phone}
                                    </span>
                                  )}
                                  {prof.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {prof.email}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Badge className={cn("ml-2 shrink-0", getProfessionalTypeBadgeColor(prof.type))}>
                                {getProfessionalTypeLabel(prof.type)}
                              </Badge>
                            </div>
                          </CommandItem>
                        ))}
                        {searchQuery.trim().length > 1 && filteredProfessionals.length === 0 && (
                          <CommandItem
                            value={`__quick_add__${searchQuery}`}
                            onSelect={() => {
                              setQuickAddName(searchQuery.trim());
                              setShowInlineQuickAdd(true);
                              setProfessionalSearchOpen(false);
                              setSearchQuery("");
                            }}
                            className="text-primary flex items-center gap-2 py-2"
                          >
                            <PlusCircle className="h-4 w-4" />
                            Quick-Add "{searchQuery.trim()}" as New Professional
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}

            {/* Inline Quick-Add Expansion Panel */}
            {showInlineQuickAdd && !referredBy && (
              <div className="mt-3 border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-primary" />
                  Quick-Add New Professional
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={quickAddName}
                      onChange={e => setQuickAddName(e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input
                      value={quickAddPhone}
                      onChange={e => {
                        const val = e.target.value;
                        setQuickAddPhone(val);
                        const digits = val.replace(/\D/g, "");
                        if (digits.length === 10) {
                          checkDuplicate(digits, "quickAddPhone");
                        } else {
                          clearResult("quickAddPhone");
                          setLeadDupResult(null);
                        }
                      }}
                      placeholder="Phone number"
                    />
                  </div>
                </div>

                {dupResults["quickAddPhone"]?.found &&
                  dupResults["quickAddPhone"]?.type === "lead" && (
                  <div className="col-span-full flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        Lead already exists with this phone number
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {dupResults["quickAddPhone"].existingRecord?.name}
                        {" · "}
                        {dupResults["quickAddPhone"].existingRecord?.status}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Category / Type *</Label>
                  <Select value={quickAddType} onValueChange={setQuickAddType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {professionalTypeOptions.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="border-b-0">
                    <AccordionTrigger className="text-xs text-muted-foreground py-1 hover:no-underline">
                      Advanced Options
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Firm Name</Label>
                          <Input value={quickAddFirmName} onChange={e => setQuickAddFirmName(e.target.value)} placeholder="Firm / company" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Email</Label>
                          <Input value={quickAddEmail} onChange={e => setQuickAddEmail(e.target.value)} placeholder="Email address" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">City</Label>
                          <Select value={quickAddCity} onValueChange={setQuickAddCity}>
                            <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                            <SelectContent>
                              {professionalCityOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Service Category</Label>
                          <Select value={quickAddServiceCategory} onValueChange={setQuickAddServiceCategory}>
                            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                            <SelectContent>
                              {professionalServiceCategoryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Status</Label>
                          <Select value={quickAddStatus} onValueChange={setQuickAddStatus}>
                            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                              {professionalStatusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Priority</Label>
                          <Select value={quickAddPriority} onValueChange={setQuickAddPriority}>
                            <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                            <SelectContent>
                              {professionalPriorityOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => {
                      resetQuickAdd();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button" size="sm"
                    disabled={
                      !quickAddName.trim() ||
                      !quickAddPhone.trim() ||
                      !quickAddType ||
                      quickAddLoading ||
                      (dupResults["quickAddPhone"]?.found &&
                       dupResults["quickAddPhone"]?.type === "lead")
                    }
                    onClick={handleQuickAddSubmit}
                  >
                    {quickAddLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Add Professional
                  </Button>
                </div>
              </div>
            )}

            {validationErrors.referredBy && (
              <p className="text-sm text-destructive">{validationErrors.referredBy}</p>
            )}
          </div>
        )}
      </CardContent>

      {/* Duplicate Lead Modal */}
      {leadDupResult && (
        <DuplicateLeadModal
          open={leadDupModalOpen}
          onOpenChange={setLeadDupModalOpen}
          duplicateResult={leadDupResult}
          onViewExisting={() => {
            if (leadDupResult.existingRecord?.id) {
              window.open(`/leads?view=${leadDupResult.existingRecord.id}`, "_blank");
            }
            setLeadDupModalOpen(false);
            resetQuickAdd();
          }}
          onAddToExisting={() => {
            if (leadDupResult.existingRecord?.id) {
              window.open(`/leads?edit=${leadDupResult.existingRecord.id}`, "_blank");
            }
            setLeadDupModalOpen(false);
            resetQuickAdd();
          }}
          onCancel={() => {
            setLeadDupModalOpen(false);
            resetQuickAdd();
          }}
        />
      )}
    </Card>
  );
}
