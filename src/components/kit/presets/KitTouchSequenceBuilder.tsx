import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, ArrowUp, ArrowDown, ArrowDownIcon } from "lucide-react";
import {
  KitTouchSequenceItem,
  KitTouchMethod,
  KIT_TOUCH_METHOD_ICONS,
  KIT_TOUCH_METHOD_COLORS,
} from "@/constants/kitConstants";
import { cn } from "@/lib/utils";

interface KitTouchSequenceBuilderProps {
  sequence: KitTouchSequenceItem[];
  onChange: (sequence: KitTouchSequenceItem[]) => void;
}

const TOUCH_METHODS: { value: KitTouchMethod; label: string }[] = [
  { value: 'call', label: 'Phone Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'visit', label: 'Site Visit' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
];

const ASSIGNEE_TYPES = [
  { value: 'entity_owner', label: 'Entity Owner' },
  { value: 'specific_user', label: 'Specific User' },
  { value: 'field_staff', label: 'Field Staff' },
];

export function KitTouchSequenceBuilder({ sequence, onChange }: KitTouchSequenceBuilderProps) {
  const addTouch = () => {
    const lastTouch = sequence[sequence.length - 1];
    const newTouch: KitTouchSequenceItem = {
      method: 'call',
      interval_days: lastTouch ? lastTouch.interval_days + 3 : 0,
      assigned_to_type: 'entity_owner',
    };
    onChange([...sequence, newTouch]);
  };

  const removeTouch = (index: number) => {
    const newSequence = sequence.filter((_, i) => i !== index);
    onChange(newSequence);
  };

  const updateTouch = (index: number, updates: Partial<KitTouchSequenceItem>) => {
    const newSequence = sequence.map((touch, i) =>
      i === index ? { ...touch, ...updates } : touch
    );
    onChange(newSequence);
  };

  const moveTouch = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= sequence.length) return;
    const newSequence = [...sequence];
    const [removed] = newSequence.splice(fromIndex, 1);
    newSequence.splice(toIndex, 0, removed);
    onChange(newSequence);
  };

  return (
    <div className="space-y-3">
      {sequence.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-2">No touches in sequence</p>
          <Button variant="outline" size="sm" onClick={addTouch}>
            <Plus className="mr-2 h-4 w-4" />
            Add First Touch
          </Button>
        </div>
      ) : (
        <>
          {sequence.map((touch, index) => {
            const MethodIcon = KIT_TOUCH_METHOD_ICONS[touch.method];
            const methodColor = KIT_TOUCH_METHOD_COLORS[touch.method];

            return (
              <React.Fragment key={index}>
                <Card className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Move Buttons & Index */}
                    <div className="flex flex-col items-center gap-0.5 pt-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0}
                        onClick={() => moveTouch(index, index - 1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <span className="text-xs font-medium text-muted-foreground">
                        #{index + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === sequence.length - 1}
                        onClick={() => moveTouch(index, index + 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Method Icon */}
                    <div className={cn("p-2 rounded-md mt-1", methodColor)}>
                      <MethodIcon className="h-4 w-4" />
                    </div>

                    {/* Touch Configuration */}
                    <div className="flex-1 grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Method</Label>
                        <Select
                          value={touch.method}
                          onValueChange={(v) => updateTouch(index, { method: v as KitTouchMethod })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[300]">
                            {TOUCH_METHODS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">
                          {index === 0 ? "Start Day" : "Days After Previous"}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-8"
                          value={touch.interval_days}
                          onChange={(e) =>
                            updateTouch(index, { interval_days: parseInt(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Assign To</Label>
                        <Select
                          value={touch.assigned_to_type}
                          onValueChange={(v) =>
                            updateTouch(index, {
                              assigned_to_type: v as KitTouchSequenceItem['assigned_to_type'],
                            })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[300]">
                            {ASSIGNEE_TYPES.map((a) => (
                              <SelectItem key={a.value} value={a.value}>
                                {a.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeTouch(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>

                {/* Arrow between touches */}
                {index < sequence.length - 1 && (
                  <div className="flex justify-center">
                    <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </React.Fragment>
            );
          })}

          <Button variant="outline" size="sm" onClick={addTouch} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add Touch
          </Button>
        </>
      )}

      {/* Summary */}
      {sequence.length > 0 && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          {sequence.length} touch{sequence.length !== 1 ? "es" : ""} •{" "}
          {sequence.reduce((sum, t) => sum + t.interval_days, 0)} days total cycle
        </div>
      )}
    </div>
  );
}
