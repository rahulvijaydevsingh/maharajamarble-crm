
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadFormData } from "@/types/lead";
import { PRIORITY_LEVELS, NEXT_ACTIONS } from "@/constants/leadConstants";

interface StatusPrioritySectionProps {
  formData: LeadFormData;
  validationErrors: { [key: string]: string };
  onSelectChange: (name: string, value: string) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function StatusPrioritySection({
  formData,
  validationErrors,
  onSelectChange,
  onInputChange
}: StatusPrioritySectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Status & Priority</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Lead Status</Label>
            <Input
              id="status"
              value={formData.status}
              readOnly
              className="bg-gray-50"
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority *</Label>
            <Select value={formData.priority.toString()} onValueChange={(value) => onSelectChange("priority", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value.toString()}>
                    <span className={level.color}>{level.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Next Action */}
        <div className="space-y-2">
          <Label htmlFor="nextAction">Next Action *</Label>
          <Select value={formData.nextAction} onValueChange={(value) => onSelectChange("nextAction", value)} required>
            <SelectTrigger className={validationErrors.nextAction ? "border-red-500" : ""}>
              <SelectValue placeholder="Select next action" />
            </SelectTrigger>
            <SelectContent>
              {NEXT_ACTIONS.map((action) => (
                <SelectItem key={action} value={action}>{action}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {validationErrors.nextAction && (
            <p className="text-sm text-red-500">{validationErrors.nextAction}</p>
          )}
        </div>

        {/* Next Action Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nextActionDate">Next Action Date *</Label>
            <Input
              id="nextActionDate"
              name="nextActionDate"
              type="date"
              value={formData.nextActionDate}
              onChange={onInputChange}
              className={validationErrors.nextActionDate ? "border-red-500" : ""}
              min={new Date().toISOString().split('T')[0]}
              required
            />
            {validationErrors.nextActionDate && (
              <p className="text-sm text-red-500">{validationErrors.nextActionDate}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="nextActionTime">Next Action Time *</Label>
            <Input
              id="nextActionTime"
              name="nextActionTime"
              type="time"
              value={formData.nextActionTime}
              onChange={onInputChange}
              className={validationErrors.nextActionTime ? "border-red-500" : ""}
              min="09:00"
              max="19:00"
              required
            />
            {validationErrors.nextActionTime && (
              <p className="text-sm text-red-500">{validationErrors.nextActionTime}</p>
            )}
            <p className="text-xs text-gray-500">Business hours: 9:00 AM - 7:00 PM</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
