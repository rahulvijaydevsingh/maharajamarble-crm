import React, { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Edit,
  Trash2,
  GripVertical,
  Search,
  ClipboardList,
  CheckSquare,
  Users,
  Package,
  Settings,
  ChevronRight,
  Palette,
  Briefcase,
  UserCheck,
  Save,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useControlPanelSettings, SystemOption, OptionModule } from "@/hooks/useControlPanelSettings";

// Color presets
const COLOR_PRESETS = [
  "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", 
  "#EC4899", "#6366F1", "#14B8A6", "#84CC16", "#6B7280"
];

// Module icons map
const MODULE_ICONS: Record<string, React.ReactNode> = {
  leads: <ClipboardList className="h-4 w-4" />,
  tasks: <CheckSquare className="h-4 w-4" />,
  materials: <Package className="h-4 w-4" />,
  users: <Users className="h-4 w-4" />,
  professionals: <Briefcase className="h-4 w-4" />,
  customers: <UserCheck className="h-4 w-4" />,
};

export function ControlPanel() {
  const {
    systemOptions,
    setSystemOptions,
    loading,
    saving,
    hasUnsavedChanges,
    saveSettings,
    loadSettings,
  } = useControlPanelSettings();

  const [searchQuery, setSearchQuery] = useState("");
  const [editingOption, setEditingOption] = useState<SystemOption | null>(null);
  const [editingField, setEditingField] = useState<{ module: string; field: string } | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addingToField, setAddingToField] = useState<{ module: string; field: string; allowColors: boolean } | null>(null);
  const [deleteConfirmOption, setDeleteConfirmOption] = useState<{ option: SystemOption; module: string; field: string } | null>(null);
  
  // New option form state
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [newOptionValue, setNewOptionValue] = useState("");
  const [newOptionColor, setNewOptionColor] = useState("#3B82F6");
  const [newOptionIsDefault, setNewOptionIsDefault] = useState(false);

  // Filter options based on search
  const filteredModules = useMemo(() => {
    if (!searchQuery) return systemOptions;
    
    const query = searchQuery.toLowerCase();
    return systemOptions.map(module => ({
      ...module,
      fields: module.fields.map(field => ({
        ...field,
        options: field.options.filter(opt => 
          opt.label.toLowerCase().includes(query) || 
          opt.value.toLowerCase().includes(query)
        )
      })).filter(field => field.options.length > 0 || field.displayName.toLowerCase().includes(query))
    })).filter(module => module.fields.length > 0 || module.displayName.toLowerCase().includes(query));
  }, [systemOptions, searchQuery]);

  const handleAddOption = () => {
    if (!addingToField || !newOptionLabel.trim()) return;

    const newOption: SystemOption = {
      id: crypto.randomUUID(),
      label: newOptionLabel.trim(),
      value: newOptionValue.trim() || newOptionLabel.trim().toLowerCase().replace(/\s+/g, '_'),
      color: addingToField.allowColors ? newOptionColor : undefined,
      isActive: true,
      isDefault: newOptionIsDefault,
      isSystemReserved: false,
      sortOrder: 999,
    };

    setSystemOptions(systemOptions.map(module => {
      if (module.moduleName !== addingToField.module) return module;
      return {
        ...module,
        fields: module.fields.map(field => {
          if (field.fieldName !== addingToField.field) return field;
          // If setting as default, unset other defaults
          const updatedOptions = newOptionIsDefault 
            ? field.options.map(o => ({ ...o, isDefault: false }))
            : field.options;
          return {
            ...field,
            options: [...updatedOptions, newOption].map((o, i) => ({ ...o, sortOrder: i + 1 })),
          };
        }),
      };
    }));

    resetAddForm();
  };

  const handleUpdateOption = () => {
    if (!editingOption || !editingField) return;

    setSystemOptions(systemOptions.map(module => {
      if (module.moduleName !== editingField.module) return module;
      return {
        ...module,
        fields: module.fields.map(field => {
          if (field.fieldName !== editingField.field) return field;
          return {
            ...field,
            options: field.options.map(opt => {
              if (opt.id !== editingOption.id) {
                // If updating to default, unset other defaults
                if (editingOption.isDefault && opt.isDefault) {
                  return { ...opt, isDefault: false };
                }
                return opt;
              }
              return editingOption;
            }),
          };
        }),
      };
    }));

    setEditingOption(null);
    setEditingField(null);
  };

  const handleDeleteOption = () => {
    if (!deleteConfirmOption) return;

    setSystemOptions(systemOptions.map(module => {
      if (module.moduleName !== deleteConfirmOption.module) return module;
      return {
        ...module,
        fields: module.fields.map(field => {
          if (field.fieldName !== deleteConfirmOption.field) return field;
          return {
            ...field,
            options: field.options.filter(opt => opt.id !== deleteConfirmOption.option.id),
          };
        }),
      };
    }));

    setDeleteConfirmOption(null);
  };

  const handleToggleActive = (moduleId: string, fieldName: string, optionId: string) => {
    setSystemOptions(systemOptions.map(module => {
      if (module.moduleName !== moduleId) return module;
      return {
        ...module,
        fields: module.fields.map(field => {
          if (field.fieldName !== fieldName) return field;
          return {
            ...field,
            options: field.options.map(opt => 
              opt.id === optionId ? { ...opt, isActive: !opt.isActive } : opt
            ),
          };
        }),
      };
    }));
  };

  const resetAddForm = () => {
    setIsAddDialogOpen(false);
    setAddingToField(null);
    setNewOptionLabel("");
    setNewOptionValue("");
    setNewOptionColor("#3B82F6");
    setNewOptionIsDefault(false);
  };

  const openAddDialog = (moduleName: string, fieldName: string, allowColors: boolean) => {
    setAddingToField({ module: moduleName, field: fieldName, allowColors });
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (option: SystemOption, moduleName: string, fieldName: string) => {
    setEditingOption({ ...option });
    setEditingField({ module: moduleName, field: fieldName });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading settings...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Control Panel
            </CardTitle>
            <CardDescription>
              Manage dropdown options and system configurations across all modules
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadSettings}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search options..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {hasUnsavedChanges && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm flex items-center gap-2">
            <span>You have unsaved changes.</span>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {filteredModules.map((module) => (
            <AccordionItem key={module.moduleName} value={module.moduleName}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  {MODULE_ICONS[module.moduleName] || <Settings className="h-4 w-4" />}
                  <span className="font-medium">{module.displayName}</span>
                  <Badge variant="secondary" className="ml-2">
                    {module.fields.reduce((acc, f) => acc + f.options.length, 0)} options
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pl-6">
                  {module.fields.map((field) => (
                    <div key={field.fieldName} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{field.displayName}</span>
                          <Badge variant="outline">{field.options.filter(o => o.isActive).length} active</Badge>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openAddDialog(module.moduleName, field.fieldName, field.allowColors)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Option
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        {field.options.map((option) => (
                          <div 
                            key={option.id} 
                            className={`flex items-center justify-between p-2 rounded border ${
                              option.isActive ? 'bg-background' : 'bg-muted/50 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                              {option.color && (
                                <div 
                                  className="w-4 h-4 rounded-full border"
                                  style={{ backgroundColor: option.color }}
                                />
                              )}
                              <span className={option.isActive ? '' : 'line-through'}>{option.label}</span>
                              {option.isDefault && (
                                <Badge variant="secondary" className="text-xs">Default</Badge>
                              )}
                              {option.isSystemReserved && (
                                <Badge variant="outline" className="text-xs">System</Badge>
                              )}
                              {!option.isActive && (
                                <Badge variant="secondary" className="text-xs">(Inactive)</Badge>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={option.isActive}
                                onCheckedChange={() => handleToggleActive(module.moduleName, field.fieldName, option.id)}
                                disabled={option.isSystemReserved}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(option, module.moduleName, field.fieldName)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                disabled={option.isSystemReserved}
                                onClick={() => setDeleteConfirmOption({ option, module: module.moduleName, field: field.fieldName })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>

      <CardFooter className="border-t pt-4">
        <div className="flex items-center justify-between w-full">
          <p className="text-sm text-muted-foreground">
            {hasUnsavedChanges ? "Don't forget to save your changes!" : "All changes saved."}
          </p>
          <Button 
            onClick={saveSettings} 
            disabled={saving || !hasUnsavedChanges}
            className="min-w-32"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save All Changes
              </>
            )}
          </Button>
        </div>
      </CardFooter>

      {/* Add Option Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => !open && resetAddForm()}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>Add New Option</DialogTitle>
            <DialogDescription>
              Add a new option to the {addingToField?.field} field.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Label *</Label>
              <Input
                id="label"
                value={newOptionLabel}
                onChange={(e) => setNewOptionLabel(e.target.value)}
                placeholder="Display text"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="value">Value (optional)</Label>
              <Input
                id="value"
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                placeholder="Internal value (auto-generated if empty)"
              />
            </div>
            
            {addingToField?.allowColors && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Color
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 ${
                        newOptionColor === color ? 'border-foreground' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewOptionColor(color)}
                    />
                  ))}
                  <Input
                    type="color"
                    value={newOptionColor}
                    onChange={(e) => setNewOptionColor(e.target.value)}
                    className="w-8 h-8 p-0 border-0"
                  />
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <Label htmlFor="isDefault">Set as default</Label>
              <Switch
                id="isDefault"
                checked={newOptionIsDefault}
                onCheckedChange={setNewOptionIsDefault}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={resetAddForm}>Cancel</Button>
            <Button onClick={handleAddOption} disabled={!newOptionLabel.trim()}>Add Option</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Option Dialog */}
      <Dialog open={!!editingOption} onOpenChange={(open) => !open && setEditingOption(null)}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>Edit Option</DialogTitle>
            <DialogDescription>
              Modify the option details.
            </DialogDescription>
          </DialogHeader>
          
          {editingOption && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-label">Label</Label>
                <Input
                  id="edit-label"
                  value={editingOption.label}
                  onChange={(e) => setEditingOption({ ...editingOption, label: e.target.value })}
                />
              </div>
              
              {editingOption.color !== undefined && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Color
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${
                          editingOption.color === color ? 'border-foreground' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditingOption({ ...editingOption, color })}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-isDefault">Set as default</Label>
                <Switch
                  id="edit-isDefault"
                  checked={editingOption.isDefault}
                  onCheckedChange={(checked) => setEditingOption({ ...editingOption, isDefault: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-isActive">Active</Label>
                <Switch
                  id="edit-isActive"
                  checked={editingOption.isActive}
                  onCheckedChange={(checked) => setEditingOption({ ...editingOption, isActive: checked })}
                  disabled={editingOption.isSystemReserved}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOption(null)}>Cancel</Button>
            <Button onClick={handleUpdateOption}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmOption} onOpenChange={() => setDeleteConfirmOption(null)}>
        <AlertDialogContent className="bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Option</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmOption?.option.label}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOption}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
