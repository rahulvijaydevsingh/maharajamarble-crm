import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { KitTouchSequenceBuilder } from "./KitTouchSequenceBuilder";
import {
  KitPreset,
  KitTouchSequenceItem,
  KitCycleBehavior,
  KIT_CYCLE_BEHAVIOR_LABELS,
} from "@/constants/kitConstants";

interface KitPresetEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: KitPreset | null;
  onSave: (data: Partial<KitPreset>) => Promise<void>;
}

const DEFAULT_SEQUENCE: KitTouchSequenceItem[] = [
  { method: 'call', interval_days: 0, assigned_to_type: 'entity_owner' },
  { method: 'whatsapp', interval_days: 3, assigned_to_type: 'entity_owner' },
  { method: 'call', interval_days: 7, assigned_to_type: 'entity_owner' },
];

export function KitPresetEditor({ open, onOpenChange, preset, onSave }: KitPresetEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touchSequence, setTouchSequence] = useState<KitTouchSequenceItem[]>(DEFAULT_SEQUENCE);
  const [cycleBehavior, setCycleBehavior] = useState<KitCycleBehavior>("auto_repeat");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preset) {
      setName(preset.name);
      setDescription(preset.description || "");
      setTouchSequence(preset.touch_sequence || DEFAULT_SEQUENCE);
      setCycleBehavior(preset.default_cycle_behavior);
      setIsActive(preset.is_active);
    } else {
      setName("");
      setDescription("");
      setTouchSequence(DEFAULT_SEQUENCE);
      setCycleBehavior("auto_repeat");
      setIsActive(true);
    }
  }, [preset, open]);

  const handleSave = async () => {
    if (!name.trim()) return;
    if (touchSequence.length === 0) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        touch_sequence: touchSequence,
        default_cycle_behavior: cycleBehavior,
        is_active: isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  const isValid = name.trim() && touchSequence.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{preset ? "Edit Preset" : "Create New Preset"}</DialogTitle>
          <DialogDescription>
            Define a touch sequence that will be used to nurture relationships with leads, customers, and professionals.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Preset Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Weekly Follow-up, New Lead Nurture"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe when to use this preset..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Touch Sequence Builder */}
          <div className="space-y-2">
            <Label>Touch Sequence *</Label>
            <KitTouchSequenceBuilder
              sequence={touchSequence}
              onChange={setTouchSequence}
            />
          </div>

          {/* Cycle Behavior */}
          <div className="space-y-2">
            <Label>Cycle Behavior</Label>
            <Select value={cycleBehavior} onValueChange={(v) => setCycleBehavior(v as KitCycleBehavior)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIT_CYCLE_BEHAVIOR_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {cycleBehavior === 'one_time' && "The sequence runs once and marks the subscription as completed."}
              {cycleBehavior === 'auto_repeat' && "After completing all touches, the sequence automatically starts again."}
              {cycleBehavior === 'user_defined' && "User will be asked whether to repeat or complete after the last touch."}
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive presets won't appear in the selection list
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : preset ? (
              "Update Preset"
            ) : (
              "Create Preset"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
