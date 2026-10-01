import React from "react";
import { CalendarClock, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CustomerFollowUpSectionProps {
  initialNote: string;
  onInitialNoteChange: (value: string) => void;
  reviewEnabled: boolean;
  reviewDueDate: string;
  onReviewEnabledChange: (enabled: boolean) => void;
  onReviewDueDateChange: (value: string) => void;
  materialEnabled: boolean;
  materialDueDate: string;
  onMaterialEnabledChange: (enabled: boolean) => void;
  onMaterialDueDateChange: (value: string) => void;
  showMaterialFollowUp: boolean;
  minDate: string;
  validationErrors?: Record<string, string>;
}

export function CustomerFollowUpSection({
  initialNote,
  onInitialNoteChange,
  reviewEnabled,
  reviewDueDate,
  onReviewEnabledChange,
  onReviewDueDateChange,
  materialEnabled,
  materialDueDate,
  onMaterialEnabledChange,
  onMaterialDueDateChange,
  showMaterialFollowUp,
  minDate,
  validationErrors = {},
}: CustomerFollowUpSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5 text-primary" />
          Follow-up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customer-initial-note">Initial note</Label>
          <textarea
            id="customer-initial-note"
            value={initialNote}
            onChange={(event) => onInitialNoteChange(event.target.value)}
            placeholder="Add an initial note"
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="customer-review-followup"
            checked={reviewEnabled}
            onCheckedChange={(checked) => onReviewEnabledChange(checked === true)}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <Label
              htmlFor="customer-review-followup"
              className="cursor-pointer font-medium"
            >
              Schedule a review & feedback follow-up
            </Label>
            {reviewEnabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Due date
                </div>
                <Input
                  type="date"
                  value={reviewDueDate}
                  min={minDate}
                  onChange={(event) => onReviewDueDateChange(event.target.value)}
                  className={validationErrors.reviewDueDate ? "border-destructive" : ""}
                />
                {validationErrors.reviewDueDate && (
                  <p className="text-sm text-destructive">
                    {validationErrors.reviewDueDate}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {showMaterialFollowUp && (
          <div className="flex items-start gap-3">
            <Checkbox
              id="customer-material-followup"
              checked={materialEnabled}
              onCheckedChange={(checked) => onMaterialEnabledChange(checked === true)}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <Label
                htmlFor="customer-material-followup"
                className="cursor-pointer font-medium"
              >
                Schedule a material follow-up
              </Label>
              {materialEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Due date
                  </div>
                  <Input
                    type="date"
                    value={materialDueDate}
                    min={minDate}
                    onChange={(event) => onMaterialDueDateChange(event.target.value)}
                    className={validationErrors.materialDueDate ? "border-destructive" : ""}
                  />
                  {validationErrors.materialDueDate && (
                    <p className="text-sm text-destructive">
                      {validationErrors.materialDueDate}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
