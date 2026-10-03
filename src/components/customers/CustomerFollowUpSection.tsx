import React from "react";
import { MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerTaskScheduleFields } from "./CustomerTaskScheduleFields";

interface CustomerFollowUpSectionProps {
  initialNote: string;
  onInitialNoteChange: (value: string) => void;
  reviewEnabled: boolean;
  reviewDueDate: string;
  reviewDueTime: string;
  reviewReminderEnabled: boolean;
  reviewReminderTime: string;
  onReviewEnabledChange: (enabled: boolean) => void;
  onReviewDueDateChange: (value: string) => void;
  onReviewDueTimeChange: (value: string) => void;
  onReviewReminderEnabledChange: (enabled: boolean) => void;
  onReviewReminderTimeChange: (value: string) => void;
  materialEnabled: boolean;
  materialDueDate: string;
  materialDueTime: string;
  materialReminderEnabled: boolean;
  materialReminderTime: string;
  onMaterialEnabledChange: (enabled: boolean) => void;
  onMaterialDueDateChange: (value: string) => void;
  onMaterialDueTimeChange: (value: string) => void;
  onMaterialReminderEnabledChange: (enabled: boolean) => void;
  onMaterialReminderTimeChange: (value: string) => void;
  showMaterialFollowUp: boolean;
  minDate: string;
  validationErrors?: Record<string, string>;
}

export function CustomerFollowUpSection(props: CustomerFollowUpSectionProps) {
  const {
    initialNote,
    onInitialNoteChange,
    reviewEnabled,
    reviewDueDate,
    reviewDueTime,
    reviewReminderEnabled,
    reviewReminderTime,
    onReviewEnabledChange,
    onReviewDueDateChange,
    onReviewDueTimeChange,
    onReviewReminderEnabledChange,
    onReviewReminderTimeChange,
    materialEnabled,
    materialDueDate,
    materialDueTime,
    materialReminderEnabled,
    materialReminderTime,
    onMaterialEnabledChange,
    onMaterialDueDateChange,
    onMaterialDueTimeChange,
    onMaterialReminderEnabledChange,
    onMaterialReminderTimeChange,
    showMaterialFollowUp,
    minDate,
    validationErrors = {},
  } = props;

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

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="customer-review-followup"
              checked={reviewEnabled}
              onCheckedChange={(checked) =>
                onReviewEnabledChange(checked === true)
              }
              className="mt-1"
            />
            <Label
              htmlFor="customer-review-followup"
              className="cursor-pointer font-medium"
            >
              Schedule a review & feedback follow-up
            </Label>
          </div>

          {reviewEnabled && (
            <CustomerTaskScheduleFields
              fieldPrefix="customer-review"
              dueDate={reviewDueDate}
              dueTime={reviewDueTime}
              reminderEnabled={reviewReminderEnabled}
              reminderTime={reviewReminderTime}
              minDate={minDate}
              validationErrors={{
                dueDate: validationErrors.reviewDueDate || "",
                reminderTime: validationErrors.reviewReminderTime || "",
              }}
              onDueDateChange={onReviewDueDateChange}
              onDueTimeChange={onReviewDueTimeChange}
              onReminderEnabledChange={onReviewReminderEnabledChange}
              onReminderTimeChange={onReviewReminderTimeChange}
            />
          )}
        </div>

        {showMaterialFollowUp && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="customer-material-followup"
                checked={materialEnabled}
                onCheckedChange={(checked) =>
                  onMaterialEnabledChange(checked === true)
                }
                className="mt-1"
              />
              <Label
                htmlFor="customer-material-followup"
                className="cursor-pointer font-medium"
              >
                Schedule a material follow-up
              </Label>
            </div>

            {materialEnabled && (
              <CustomerTaskScheduleFields
                fieldPrefix="customer-material"
                dueDate={materialDueDate}
                dueTime={materialDueTime}
                reminderEnabled={materialReminderEnabled}
                reminderTime={materialReminderTime}
                minDate={minDate}
                validationErrors={{
                  dueDate: validationErrors.materialDueDate || "",
                  reminderTime: validationErrors.materialReminderTime || "",
                }}
                onDueDateChange={onMaterialDueDateChange}
                onDueTimeChange={onMaterialDueTimeChange}
                onReminderEnabledChange={onMaterialReminderEnabledChange}
                onReminderTimeChange={onMaterialReminderTimeChange}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
