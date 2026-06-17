import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ExportConfig } from "@/lib/exportProfessionals";

interface ExportProfessionalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalProfessionals: number;
  filteredProfessionals: number;
  selectedProfessionals: number;
  onExport: (config: ExportConfig) => void;
}

export function ExportProfessionalsDialog({
  open,
  onOpenChange,
  totalProfessionals,
  filteredProfessionals,
  selectedProfessionals,
  onExport
}: ExportProfessionalsDialogProps) {
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    scope: selectedProfessionals > 0 ? 'selected' : 'filtered',
    format: 'excel',
    columns: ['name', 'phone', 'professionalType', 'status', 'assignedTo', 'city'],
    includeTaskStatus: true,
    includeTimestamp: true
  });

  const { toast } = useToast();

  const handleExport = () => {
    onExport(exportConfig);

    toast({
      title: "Export Started",
      description: "Your export is being processed and will be ready shortly.",
    });

    onOpenChange(false);
  };

  const handleColumnToggle = (column: string) => {
    setExportConfig(prev => {
      if (prev.columns.includes(column)) {
        return {
          ...prev,
          columns: prev.columns.filter(col => col !== column)
        };
      } else {
        return {
          ...prev,
          columns: [...prev.columns, column]
        };
      }
    });
  };

  const columnsList = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'alternatePhone', label: 'Alternate Phone' },
    { key: 'email', label: 'Email' },
    { key: 'firmName', label: 'Firm Name' },
    { key: 'professionalType', label: 'Type' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'city', label: 'City' },
    { key: 'address', label: 'Address' },
    { key: 'assignedTo', label: 'Assigned To' },
    { key: 'rating', label: 'Rating' },
    { key: 'serviceCategory', label: 'Service Category' },
    { key: 'notes', label: 'Notes' },
    { key: 'createdAt', label: 'Created Date' },
  ];

  const handleSelectAllColumns = () => {
    setExportConfig(prev => ({
      ...prev,
      columns: columnsList.map(c => c.key)
    }));
  };

  const handleClearAllColumns = () => {
    setExportConfig(prev => ({
      ...prev,
      columns: ['name']
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Export Professionals Data</DialogTitle>
          <DialogDescription>
            Configure your export preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Export Scope */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Export Scope</h4>
            <RadioGroup
              value={exportConfig.scope}
              onValueChange={(value) =>
                setExportConfig(prev => ({
                  ...prev,
                  scope: value as any
                }))
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="selected"
                  id="scope-selected"
                  disabled={selectedProfessionals === 0}
                />
                <Label htmlFor="scope-selected" className={selectedProfessionals === 0 ? "text-muted-foreground" : ""}>
                  Selected professionals ({selectedProfessionals})
                  {selectedProfessionals === 0 && " - Select professionals first"}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="filtered" id="scope-filtered" />
                <Label htmlFor="scope-filtered">
                  Filtered view ({filteredProfessionals})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all">
                  All professionals ({totalProfessionals})
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Export Format */}
          <div className="space-y-2">
            <Label htmlFor="format">Format</Label>
            <Select
              value={exportConfig.format}
              onValueChange={(value) =>
                setExportConfig(prev => ({
                  ...prev,
                  format: value as any
                }))
              }
            >
              <SelectTrigger id="format">
                <SelectValue placeholder="Select export format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="pdf">PDF (Print)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Columns to Export */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Columns to Export</Label>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllColumns}
                  className="text-xs h-7"
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAllColumns}
                  className="text-xs h-7"
                >
                  Clear All
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {columnsList.map((col) => (
                <div key={col.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${col.key}`}
                    checked={exportConfig.columns.includes(col.key)}
                    onCheckedChange={() => handleColumnToggle(col.key)}
                    disabled={col.key === 'name'}
                  />
                  <Label htmlFor={`col-${col.key}`} className="text-sm cursor-pointer">{col.label}</Label>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Options */}
          <div className="space-y-2">
            <Label>Include</Label>
            <div className="space-y-2 mt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="opt-taskStatus"
                  checked={exportConfig.includeTaskStatus}
                  onCheckedChange={(checked) =>
                    setExportConfig(prev => ({
                      ...prev,
                      includeTaskStatus: checked === true
                    }))
                  }
                />
                <Label htmlFor="opt-taskStatus" className="text-sm cursor-pointer">Include task summary</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="opt-timestamp"
                  checked={exportConfig.includeTimestamp}
                  onCheckedChange={(checked) =>
                    setExportConfig(prev => ({
                      ...prev,
                      includeTimestamp: checked === true
                    }))
                  }
                />
                <Label htmlFor="opt-timestamp" className="text-sm cursor-pointer">Add export timestamp</Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export {
              exportConfig.scope === 'selected' ? selectedProfessionals :
              exportConfig.scope === 'filtered' ? filteredProfessionals :
              totalProfessionals
            } Professionals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
