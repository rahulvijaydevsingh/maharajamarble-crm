
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
  DialogTrigger
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

interface ExportDialogProps {
  totalLeads: number;
  filteredLeads: number;
  selectedLeads: number;
  onExport: (config: ExportConfig) => void;
}

interface ExportConfig {
  scope: 'filtered' | 'selected' | 'all';
  format: 'excel' | 'csv' | 'pdf';
  columns: string[];
  includeTaskStatus: boolean;
  includeLastFollowUp: boolean;
  includeTimestamp: boolean;
}

export function ExportDialog({ totalLeads, filteredLeads, selectedLeads, onExport }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    scope: 'filtered',
    format: 'excel',
    columns: ['name', 'phone', 'email', 'status', 'assignedTo', 'source'],
    includeTaskStatus: true,
    includeLastFollowUp: true,
    includeTimestamp: true
  });

  const { toast } = useToast();

  const handleExport = () => {
    console.log("Exporting with config:", exportConfig);
    
    onExport(exportConfig);
    
    toast({
      title: "Export Started",
      description: "Your export is being processed and will be ready shortly.",
    });
    
    setOpen(false);
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

  const handleSelectAllColumns = () => {
    setExportConfig(prev => ({
      ...prev,
      columns: ['name', 'phone', 'email', 'status', 'assignedTo', 'source', 'address', 'notes', 'priority', 'nextFollowUp', 'createdDate', 'materials']
    }));
  };

  const handleClearAllColumns = () => {
    setExportConfig(prev => ({
      ...prev,
      columns: ['name'] // Name is always required
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Export Leads Data</DialogTitle>
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
                  scope: value as 'filtered' | 'selected' | 'all'
                }))
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="filtered" id="scope-filtered" />
                <Label htmlFor="scope-filtered">
                  Current filtered results ({filteredLeads} leads)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem 
                  value="selected" 
                  id="scope-selected" 
                  disabled={selectedLeads === 0}
                />
                <Label htmlFor="scope-selected" className={selectedLeads === 0 ? "text-muted-foreground" : ""}>
                  Selected leads ({selectedLeads} leads)
                  {selectedLeads === 0 && " - Select leads first"}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all">
                  All leads ({totalLeads} leads)
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
                  format: value as 'excel' | 'csv' | 'pdf'
                }))
              }
            >
              <SelectTrigger id="format">
                <SelectValue placeholder="Select export format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="pdf">PDF Report (.pdf)</SelectItem>
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
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-name" 
                  checked={exportConfig.columns.includes('name')}
                  onCheckedChange={() => handleColumnToggle('name')}
                  disabled={true} // Name is always required
                />
                <Label htmlFor="col-name" className="text-sm">Name</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-phone" 
                  checked={exportConfig.columns.includes('phone')}
                  onCheckedChange={() => handleColumnToggle('phone')}
                />
                <Label htmlFor="col-phone" className="text-sm">Phone</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-email" 
                  checked={exportConfig.columns.includes('email')}
                  onCheckedChange={() => handleColumnToggle('email')}
                />
                <Label htmlFor="col-email" className="text-sm">Email</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-status" 
                  checked={exportConfig.columns.includes('status')}
                  onCheckedChange={() => handleColumnToggle('status')}
                />
                <Label htmlFor="col-status" className="text-sm">Status</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-assigned" 
                  checked={exportConfig.columns.includes('assignedTo')}
                  onCheckedChange={() => handleColumnToggle('assignedTo')}
                />
                <Label htmlFor="col-assigned" className="text-sm">Assigned To</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-source" 
                  checked={exportConfig.columns.includes('source')}
                  onCheckedChange={() => handleColumnToggle('source')}
                />
                <Label htmlFor="col-source" className="text-sm">Source</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-address" 
                  checked={exportConfig.columns.includes('address')}
                  onCheckedChange={() => handleColumnToggle('address')}
                />
                <Label htmlFor="col-address" className="text-sm">Address</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-notes" 
                  checked={exportConfig.columns.includes('notes')}
                  onCheckedChange={() => handleColumnToggle('notes')}
                />
                <Label htmlFor="col-notes" className="text-sm">Notes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-priority" 
                  checked={exportConfig.columns.includes('priority')}
                  onCheckedChange={() => handleColumnToggle('priority')}
                />
                <Label htmlFor="col-priority" className="text-sm">Priority</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-nextFollowUp" 
                  checked={exportConfig.columns.includes('nextFollowUp')}
                  onCheckedChange={() => handleColumnToggle('nextFollowUp')}
                />
                <Label htmlFor="col-nextFollowUp" className="text-sm">Next Follow Up</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-createdDate" 
                  checked={exportConfig.columns.includes('createdDate')}
                  onCheckedChange={() => handleColumnToggle('createdDate')}
                />
                <Label htmlFor="col-createdDate" className="text-sm">Created Date</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="col-materials" 
                  checked={exportConfig.columns.includes('materials')}
                  onCheckedChange={() => handleColumnToggle('materials')}
                />
                <Label htmlFor="col-materials" className="text-sm">Materials</Label>
              </div>
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
                <Label htmlFor="opt-taskStatus" className="text-sm">Task Status Summary</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="opt-lastFollowUp" 
                  checked={exportConfig.includeLastFollowUp}
                  onCheckedChange={(checked) => 
                    setExportConfig(prev => ({ 
                      ...prev, 
                      includeLastFollowUp: checked === true
                    }))
                  }
                />
                <Label htmlFor="opt-lastFollowUp" className="text-sm">Last Follow-up Date</Label>
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
                <Label htmlFor="opt-timestamp" className="text-sm">Export Timestamp</Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
