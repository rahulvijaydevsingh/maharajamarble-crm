import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Search, X, Loader2, User, Briefcase, Users } from "lucide-react";
import { ENTITY_TYPES } from "@/constants/taskConstants";
import { useLeads, Lead } from "@/hooks/useLeads";
import { useProfessionals, Professional } from "@/hooks/useProfessionals";
import { useCustomers, Customer } from "@/hooks/useCustomers";

interface RelatedEntity {
  id: string;
  name: string;
  phone: string;
  type: "lead" | "professional" | "customer";
}

interface RelatedEntitySectionProps {
  entityType: string | null;
  selectedEntity: RelatedEntity | null;
  onEntityTypeChange: (type: string | null) => void;
  onEntitySelect: (entity: RelatedEntity | null) => void;
  disabled?: boolean;
}

const EntityIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "lead":
      return <User className="h-4 w-4" />;
    case "professional":
      return <Briefcase className="h-4 w-4" />;
    case "customer":
      return <Users className="h-4 w-4" />;
    default:
      return null;
  }
};

export function RelatedEntitySection({
  entityType,
  selectedEntity,
  onEntityTypeChange,
  onEntitySelect,
  disabled = false,
}: RelatedEntitySectionProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { leads, loading: leadsLoading } = useLeads();
  const { professionals, loading: professionalsLoading } = useProfessionals();
  const { customers, loading: customersLoading } = useCustomers();

  const isLoading = leadsLoading || professionalsLoading || customersLoading;

  // Filter entities based on selected type and search term
  const filteredEntities = useMemo(() => {
    if (!entityType) return [];

    let entities: RelatedEntity[] = [];

    if (entityType === "lead") {
      entities = leads.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        type: "lead" as const,
      }));
    } else if (entityType === "professional") {
      entities = professionals.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        type: "professional" as const,
      }));
    } else if (entityType === "customer") {
      entities = customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        type: "customer" as const,
      }));
    }

    if (!searchTerm || searchTerm.length < 2) return entities.slice(0, 10);

    const term = searchTerm.toLowerCase().trim();
    const phoneSearchTerm = searchTerm.replace(/\D/g, "");

    return entities
      .filter((e) => {
        const nameMatch = e.name.toLowerCase().includes(term);
        const phoneDigits = e.phone.replace(/\D/g, "");
        const phoneMatch = phoneSearchTerm.length > 0 && phoneDigits.includes(phoneSearchTerm);
        return nameMatch || phoneMatch;
      })
      .slice(0, 20);
  }, [entityType, leads, professionals, customers, searchTerm]);

  const handleClear = () => {
    onEntitySelect(null);
    onEntityTypeChange(null);
    setSearchTerm("");
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm">Related To (Optional)</Label>

      {selectedEntity ? (
        <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <EntityIcon type={selectedEntity.type} />
            </div>
            <div>
              <div className="font-medium text-sm">{selectedEntity.name}</div>
              <div className="text-xs text-muted-foreground">
                {selectedEntity.phone} •{" "}
                {ENTITY_TYPES.find((t) => t.value === selectedEntity.type)?.label}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={disabled}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Entity Type Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              value={entityType || ""}
              onValueChange={(value) => onEntityTypeChange(value || null)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent className="z-[80]">
                {ENTITY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <EntityIcon type={type.value} />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entity Search */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={searchOpen}
                  className="w-full justify-between font-normal"
                  disabled={!entityType || disabled}
                >
                  <span className="text-muted-foreground">
                    {entityType ? `Search ${ENTITY_TYPES.find((t) => t.value === entityType)?.label}s...` : "Select type first"}
                  </span>
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 z-[80]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type name or phone..."
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                  />
                  <CommandList>
                    {isLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : filteredEntities.length === 0 ? (
                      <CommandEmpty>No results found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredEntities.map((entity) => (
                          <CommandItem
                            key={entity.id}
                            value={`${entity.name} ${entity.phone}`}
                            onSelect={() => {
                              onEntitySelect(entity);
                              setSearchOpen(false);
                              setSearchTerm("");
                            }}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <EntityIcon type={entity.type} />
                              <div className="flex flex-col">
                                <span className="font-medium">{entity.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {entity.phone}
                                </span>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
    </div>
  );
}
