import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useKitPresets } from '@/hooks/useKitPresets';
import { useActiveStaff } from '@/hooks/useActiveStaff';
import { buildStaffGroups } from '@/lib/staffSelect';
import { KitTouchSequenceBuilder } from './presets/KitTouchSequenceBuilder';
import type { KitEntityType, KitPreset, KitTouchSequenceItem, KitCycleBehavior } from '@/constants/kitConstants';
import { KIT_TOUCH_METHOD_ICONS, KIT_CYCLE_BEHAVIOR_LABELS } from '@/constants/kitConstants';

interface KitActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: KitEntityType;
  entityId: string;
  entityName: string;
  defaultAssignee: string;
  onActivate: (
    presetId: string | null,
    assignedTo: string,
    maxCycles?: number,
    customSequence?: KitTouchSequenceItem[],
    skipWeekends?: boolean
  ) => Promise<void>;
  isLoading?: boolean;
}

export function KitActivationDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  defaultAssignee,
  onActivate,
  isLoading = false,
}: KitActivationDialogProps) {
  const { presets, loading: presetsLoading } = useKitPresets();
  const { staffMembers } = useActiveStaff();
  const staffGroups = buildStaffGroups(staffMembers);
  
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState<string>(defaultAssignee);
  const [maxCycles, setMaxCycles] = useState<string>('');
  const [skipWeekends, setSkipWeekends] = useState(false);
  
  // Custom sequence state
  const [customSequence, setCustomSequence] = useState<KitTouchSequenceItem[]>([
    { method: 'call', interval_days: 7, assigned_to_type: 'entity_owner' }
  ]);
  
  const selectedPreset = presets.find(p => p.id === selectedPresetId);
  const touchSequence = selectedPreset?.touch_sequence || [];
  
  const handleActivate = async () => {
    if (mode === 'preset' && !selectedPresetId) return;
    if (mode === 'custom' && customSequence.length === 0) return;
    if (!assignedTo) return;
    
    await onActivate(
      mode === 'preset' ? selectedPresetId : null,
      assignedTo,
      maxCycles ? parseInt(maxCycles) : undefined,
      mode === 'custom' ? customSequence : undefined,
      skipWeekends
    );
    onOpenChange(false);
  };
  
  const getTotalDays = (sequence: KitTouchSequenceItem[]) => {
    return sequence.reduce((sum, item) => sum + item.interval_days, 0);
  };

  const canActivate = 
    (mode === 'preset' && selectedPresetId && assignedTo) ||
    (mode === 'custom' && customSequence.length > 0 && assignedTo);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enable Keep in Touch</DialogTitle>
          <DialogDescription>
            Start a touch sequence for {entityName}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'preset' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preset">Use Preset</TabsTrigger>
            <TabsTrigger value="custom">Create Custom</TabsTrigger>
          </TabsList>
          
          <TabsContent value="preset" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="preset">Select Preset</Label>
              {presetsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading presets...
                </div>
              ) : (
                <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a preset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.filter(p => p.is_active).map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            {selectedPreset && (
              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-3">
                  {selectedPreset.description && (
                    <p className="text-sm text-muted-foreground">{selectedPreset.description}</p>
                  )}
                  
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Touch Sequence</Label>
                    <div className="flex flex-wrap gap-2">
                      {touchSequence.map((item, index) => {
                        const Icon = KIT_TOUCH_METHOD_ICONS[item.method];
                        return (
                          <Badge key={index} variant="outline" className="gap-1 py-1">
                            <Icon className="h-3 w-3" />
                            <span className="capitalize">{item.method}</span>
                            <span className="text-muted-foreground">+{item.interval_days}d</span>
                          </Badge>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {touchSequence.length} touches over {getTotalDays(touchSequence)} days
                    </p>
                  </div>
                  
                  <div className="text-xs">
                    <span className="text-muted-foreground">On completion: </span>
                    <span className="font-medium">
                      {KIT_CYCLE_BEHAVIOR_LABELS[selectedPreset.default_cycle_behavior]}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="custom" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Custom Touch Sequence</Label>
              <p className="text-xs text-muted-foreground">
                Create a one-time custom sequence for this {entityType}
              </p>
            </div>
            <KitTouchSequenceBuilder
              sequence={customSequence}
              onChange={setCustomSequence}
            />
            {customSequence.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {customSequence.length} touches over {getTotalDays(customSequence)} days
              </p>
            )}
          </TabsContent>
        </Tabs>
        
        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="assignee">Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Select assignee..." />
              </SelectTrigger>
              <SelectContent>
                {staffGroups.map((group) => (
                  <React.Fragment key={group.label}>
                    {group.members.map((staff) => (
                      <SelectItem key={staff.id} value={staff.email || staff.id}>
                        {staff._display}
                      </SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="maxCycles">
              Max Cycles <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="maxCycles"
              type="number"
              min="1"
              value={maxCycles}
              onChange={(e) => setMaxCycles(e.target.value)}
              placeholder="Leave empty for unlimited"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="skipWeekends">Skip Sundays</Label>
              <p className="text-xs text-muted-foreground">
                Touches on Sunday will move to Monday
              </p>
            </div>
            <Switch
              id="skipWeekends"
              checked={skipWeekends}
              onCheckedChange={setSkipWeekends}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleActivate}
            disabled={!canActivate || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Activating...
              </>
            ) : (
              'Activate Keep in Touch'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
