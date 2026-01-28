
import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { 
  Clock, 
  CalendarIcon, 
  Zap, 
  Info,
  Mic,
  MicOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addHours, addDays, setHours, setMinutes } from "date-fns";
import { FollowUpPriority, LeadSource, ConstructionStage } from "@/types/lead";
import { FOLLOW_UP_PRIORITIES, LEAD_SOURCES, CONSTRUCTION_STAGES } from "@/constants/leadConstants";

interface ActionTriggerSectionProps {
  followUpPriority: FollowUpPriority;
  nextActionDate: Date;
  nextActionTime: string;
  initialNote: string;
  leadSource: LeadSource;
  constructionStage: ConstructionStage;
  onFollowUpPriorityChange: (priority: FollowUpPriority) => void;
  onNextActionDateChange: (date: Date) => void;
  onNextActionTimeChange: (time: string) => void;
  onInitialNoteChange: (note: string) => void;
  validationErrors?: { [key: string]: string };
}

export function ActionTriggerSection({
  followUpPriority,
  nextActionDate,
  nextActionTime,
  initialNote,
  leadSource,
  constructionStage,
  onFollowUpPriorityChange,
  onNextActionDateChange,
  onNextActionTimeChange,
  onInitialNoteChange,
  validationErrors = {},
}: ActionTriggerSectionProps) {
  const [isAutoFilled, setIsAutoFilled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  // Calculate smart default date/time based on source and construction stage
  const calculateSmartFollowUp = () => {
    const now = new Date();
    let suggestedDate = now;
    let suggestedTime = "10:00";

    // First, check lead source for immediate timing
    const sourceConfig = LEAD_SOURCES.find(s => s.value === leadSource);
    if (sourceConfig) {
      suggestedDate = addHours(now, sourceConfig.autoFollowUpHours);
    }

    // Then, check construction stage for urgency override
    const stageConfig = CONSTRUCTION_STAGES.find(s => s.value === constructionStage);
    if (stageConfig) {
      const stageDate = addDays(now, stageConfig.followUpDays);
      
      // Use the earlier of the two dates for high urgency stages
      if (stageConfig.urgency === "high" && stageDate < suggestedDate) {
        suggestedDate = stageDate;
      }
      
      // Auto-set priority based on construction stage
      if (stageConfig.urgency === "high") {
        onFollowUpPriorityChange("urgent");
      } else if (stageConfig.urgency === "medium") {
        onFollowUpPriorityChange("normal");
      } else {
        onFollowUpPriorityChange("low");
      }
    }

    // Set appropriate time within business hours (9 AM - 7 PM)
    const suggestedHour = suggestedDate.getHours();
    if (suggestedHour < 9) {
      suggestedDate = setHours(setMinutes(suggestedDate, 0), 9);
      suggestedTime = "09:00";
    } else if (suggestedHour >= 19) {
      suggestedDate = addDays(setHours(setMinutes(suggestedDate, 0), 9), 1);
      suggestedTime = "09:00";
    } else {
      suggestedTime = format(suggestedDate, "HH:mm");
    }

    return { date: suggestedDate, time: suggestedTime };
  };

  // Auto-fill on source or stage change
  useEffect(() => {
    if (isAutoFilled) {
      const { date, time } = calculateSmartFollowUp();
      onNextActionDateChange(date);
      onNextActionTimeChange(time);
    }
  }, [leadSource, constructionStage]);

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setIsAutoFilled(false);
      onNextActionDateChange(date);
    }
  };

  const handleTimeChange = (time: string) => {
    setIsAutoFilled(false);
    onNextActionTimeChange(time);
  };

  const handleResetToAuto = () => {
    setIsAutoFilled(true);
    const { date, time } = calculateSmartFollowUp();
    onNextActionDateChange(date);
    onNextActionTimeChange(time);
  };

  const getAutoFillReason = () => {
    const sourceConfig = LEAD_SOURCES.find(s => s.value === leadSource);
    const stageConfig = CONSTRUCTION_STAGES.find(s => s.value === constructionStage);

    const reasons = [];
    
    if (sourceConfig) {
      if (leadSource === "field_visit") {
        reasons.push("Field Visit → Follow up within 4 hours");
      } else if (leadSource === "walk_in") {
        reasons.push("Walk-in → Follow up within 2 days");
      }
    }

    if (stageConfig?.urgency === "high") {
      reasons.push(`${stageConfig.label} → High priority, follow up tomorrow`);
    }

    return reasons.length > 0 ? reasons.join(" • ") : "Standard follow-up timing";
  };

  // Voice-to-text simulation (in real app, use Web Speech API)
  const toggleVoiceRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      // In real implementation, stop recording and append transcription
    } else {
      setIsRecording(true);
      // In real implementation, start recording
      // For demo, we'll just simulate after 2 seconds
      setTimeout(() => {
        setIsRecording(false);
        onInitialNoteChange(initialNote + (initialNote ? " " : "") + "[Voice note would be transcribed here]");
      }, 2000);
    }
  };

  return (
    <Card className="border-2 border-accent/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Group 4: Action Trigger
          <Badge variant="outline" className="ml-auto text-xs">
            Auto-generates task
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Follow-up Priority */}
        <div className="space-y-2">
          <Label>Follow-Up Priority *</Label>
          <Select
            value={followUpPriority}
            onValueChange={(value) => onFollowUpPriorityChange(value as FollowUpPriority)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              {FOLLOW_UP_PRIORITIES.map((priority) => (
                <SelectItem key={priority.value} value={priority.value}>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full", priority.color)} />
                    {priority.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Smart Date/Time Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Next Action Date & Time *
            </Label>
            {!isAutoFilled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetToAuto}
                className="text-xs h-6"
              >
                Reset to Auto
              </Button>
            )}
          </div>

          {/* Auto-fill Info */}
          {isAutoFilled && (
            <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-md text-xs">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{getAutoFillReason()}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Date Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !nextActionDate && "text-muted-foreground",
                    validationErrors.nextActionDate && "border-destructive"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {nextActionDate ? format(nextActionDate, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={nextActionDate}
                  onSelect={handleDateChange}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            {/* Time Picker */}
            <div className="relative">
              <Input
                type="time"
                value={nextActionTime}
                onChange={(e) => handleTimeChange(e.target.value)}
                min="09:00"
                max="19:00"
                className={validationErrors.nextActionTime ? 'border-destructive' : ''}
              />
            </div>
          </div>

          {validationErrors.nextActionDate && (
            <p className="text-sm text-destructive">{validationErrors.nextActionDate}</p>
          )}
          {validationErrors.nextActionTime && (
            <p className="text-sm text-destructive">{validationErrors.nextActionTime}</p>
          )}

          <p className="text-xs text-muted-foreground">
            Business hours: 9:00 AM - 7:00 PM
          </p>
        </div>

        {/* Initial Note with Voice-to-Text */}
        <div className="space-y-2">
          <Label htmlFor="initialNote" className="flex items-center justify-between">
            <span>Initial Note</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleVoiceRecording}
              className={cn(
                "h-7 gap-1 text-xs",
                isRecording && "text-red-500"
              )}
            >
              {isRecording ? (
                <>
                  <MicOff className="h-3 w-3" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="h-3 w-3" />
                  Voice Note
                </>
              )}
            </Button>
          </Label>
          <Textarea
            id="initialNote"
            value={initialNote}
            onChange={(e) => onInitialNoteChange(e.target.value)}
            placeholder="Add notes about the lead, conversation details, or requirements..."
            rows={3}
            className={isRecording ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""}
          />
          {isRecording && (
            <p className="text-xs text-red-500 animate-pulse">Recording... Speak now</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
