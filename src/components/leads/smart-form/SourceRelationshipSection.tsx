import React, { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Users, Search, X, Phone, Mail, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeadSource, ProfessionalRef } from "@/types/lead";
import { LEAD_SOURCES, MOCK_PROFESSIONALS } from "@/constants/leadConstants";
import { useActiveStaff } from "@/hooks/useActiveStaff";

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

  // Show "Referred By" field only for Professional Referral or Walk-in sources
  const showReferredBy = leadSource === "professional_referral" || leadSource === "walk_in";
  const referralRequired = leadSource === "professional_referral";

  // Filter professionals based on search query - search by name, phone, firm name, designation, email
  const filteredProfessionals = useMemo(() => {
    if (!searchQuery) return MOCK_PROFESSIONALS;
    const query = searchQuery.toLowerCase();
    return MOCK_PROFESSIONALS.filter(
      prof => 
        prof.name.toLowerCase().includes(query) || 
        prof.firmName.toLowerCase().includes(query) ||
        prof.phone?.includes(query) ||
        prof.email?.toLowerCase().includes(query) ||
        prof.type.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const getProfessionalTypeLabel = (type: string) => {
    switch (type) {
      case "architect": return "Architect";
      case "builder": return "Builder";
      case "contractor": return "Contractor";
      case "interior_designer": return "Interior Designer";
      default: return type;
    }
  };

  const getProfessionalTypeBadgeColor = (type: string) => {
    switch (type) {
      case "architect": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "builder": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "contractor": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "interior_designer": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default: return "bg-gray-100 text-gray-800";
    }
  };

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
                {staffMembers.map((member) => (
                  <SelectItem key={member.id} value={member.name}>
                    {member.name}
                  </SelectItem>
                ))}
                {/* Show current assigned_to if not in staff list */}
                {assignedTo && !staffMembers.find(m => m.name === assignedTo) && (
                  <SelectItem key={assignedTo} value={assignedTo}>
                    {assignedTo}
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
                  <Command>
                    <CommandInput 
                      placeholder="Search by name, phone, firm, designation, email..." 
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No professional found.</CommandEmpty>
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
                                type: prof.type,
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
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            
            {validationErrors.referredBy && (
              <p className="text-sm text-destructive">{validationErrors.referredBy}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
