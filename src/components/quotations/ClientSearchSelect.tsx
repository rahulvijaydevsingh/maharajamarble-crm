import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, User, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

export interface ClientOption {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  type: 'lead' | 'customer';
}

interface ClientSearchSelectProps {
  leads: ClientOption[];
  customers: ClientOption[];
  selectedId?: string;
  onSelect: (client: ClientOption | null) => void;
  placeholder?: string;
}

export function ClientSearchSelect({
  leads,
  customers,
  selectedId,
  onSelect,
  placeholder = "Select client...",
}: ClientSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Combine and filter options
  const allOptions = useMemo(() => {
    const leadOptions: ClientOption[] = leads.map(l => ({
      ...l,
      type: 'lead' as const,
    }));
    const customerOptions: ClientOption[] = customers.map(c => ({
      ...c,
      type: 'customer' as const,
    }));
    return [...leadOptions, ...customerOptions];
  }, [leads, customers]);

  const filteredOptions = useMemo(() => {
    if (!search) return allOptions;
    const searchLower = search.toLowerCase();
    return allOptions.filter(
      (opt) =>
        opt.name.toLowerCase().includes(searchLower) ||
        opt.phone.includes(search)
    );
  }, [allOptions, search]);

  const selectedClient = selectedId 
    ? allOptions.find(o => o.id === selectedId) 
    : null;

  const handleSelect = (client: ClientOption) => {
    onSelect(client);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selectedClient ? (
            <div className="flex items-center gap-2 truncate">
              {selectedClient.type === 'lead' ? (
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">{selectedClient.name}</span>
              <Badge variant="secondary" className="ml-1 text-xs">
                {selectedClient.type === 'lead' ? 'Lead' : 'Customer'}
              </Badge>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search by name or phone..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No clients found.</CommandEmpty>
            
            {/* Leads Group */}
            {filteredOptions.filter(o => o.type === 'lead').length > 0 && (
              <CommandGroup heading="Leads">
                {filteredOptions
                  .filter(o => o.type === 'lead')
                  .slice(0, 10)
                  .map((client) => (
                    <CommandItem
                      key={client.id}
                      value={client.id}
                      onSelect={() => handleSelect(client)}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          selectedId === client.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <User className="h-4 w-4 text-blue-500" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{client.name}</div>
                        <div className="text-xs text-muted-foreground">{client.phone}</div>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}

            {/* Customers Group */}
            {filteredOptions.filter(o => o.type === 'customer').length > 0 && (
              <CommandGroup heading="Customers">
                {filteredOptions
                  .filter(o => o.type === 'customer')
                  .slice(0, 10)
                  .map((client) => (
                    <CommandItem
                      key={client.id}
                      value={client.id}
                      onSelect={() => handleSelect(client)}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          selectedId === client.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <Building2 className="h-4 w-4 text-green-500" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{client.name}</div>
                        <div className="text-xs text-muted-foreground">{client.phone}</div>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
