import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MANUAL_ACTIVITY_TYPES } from "@/constants/activityLogConstants";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Input } from "@/components/ui/input";

interface AddManualActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  customerId?: string;
}

export function AddManualActivityDialog({ open, onOpenChange, leadId, customerId }: AddManualActivityDialogProps) {
  const entityId = leadId || customerId || '';
  const [activityType, setActivityType] = useState<string>('');
  const [activityDate, setActivityDate] = useState<Date>(new Date());
  const [activityTime, setActivityTime] = useState<string>(
    format(new Date(), 'HH:mm')
  );
  const [description, setDescription] = useState<string>('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { toast } = useToast();
  const { createActivity } = useActivityLog(leadId, customerId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 5MB limit.`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });
    
    if (attachments.length + validFiles.length > 10) {
      toast({
        title: "Too many files",
        description: "Maximum 10 files allowed.",
        variant: "destructive",
      });
      return;
    }
    
    setAttachments(prev => [...prev, ...validFiles]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Validation
    if (!activityType) {
      toast({
        title: "Error",
        description: "Please select an activity type.",
        variant: "destructive",
      });
      return;
    }

    if (!description || description.trim().length < 10) {
      toast({
        title: "Error",
        description: "Description must be at least 10 characters.",
        variant: "destructive",
      });
      return;
    }

    // Check if date is not in the future
    const selectedDateTime = new Date(activityDate);
    const [hours, minutes] = activityTime.split(':');
    selectedDateTime.setHours(parseInt(hours), parseInt(minutes));
    
    if (selectedDateTime > new Date()) {
      toast({
        title: "Error",
        description: "Activity date/time cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const activityLabel = MANUAL_ACTIVITY_TYPES.find(t => t.value === activityType)?.label || activityType;
      
      // For now, store attachment names (file upload would need storage bucket setup)
      const attachmentData = attachments.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }));

      await createActivity({
        lead_id: leadId || null,
        customer_id: customerId || null,
        activity_type: activityType as any,
        activity_category: 'manual',
        title: activityLabel,
        description: description.trim(),
        metadata: {
          manual_entry: true,
        },
        attachments: attachmentData,
        is_manual: true,
        activity_timestamp: selectedDateTime.toISOString(),
      });

      toast({
        title: "Activity Added",
        description: "Manual activity entry has been recorded.",
      });

      // Reset form
      setActivityType('');
      setActivityDate(new Date());
      setActivityTime(format(new Date(), 'HH:mm'));
      setDescription('');
      setAttachments([]);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add activity entry.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Activity Entry</DialogTitle>
          <DialogDescription>
            Record a manual activity for this lead.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Activity Type */}
          <div className="space-y-2">
            <Label>Activity Type *</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger>
                <SelectValue placeholder="Select activity type..." />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_ACTIVITY_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !activityDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {activityDate ? format(activityDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={activityDate}
                    onSelect={(date) => date && setActivityDate(date)}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Time *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={activityTime}
                  onChange={(e) => setActivityTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description/Notes *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter activity details (minimum 10 characters)..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              {description.length} / 10 minimum characters
            </p>
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label>Related Documents/Attachments</Label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center">
              <input
                type="file"
                id="file-upload"
                multiple
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Paperclip className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Drag & drop files or click to browse
                </span>
                <span className="text-xs text-muted-foreground">
                  Max 10 files, 5MB each
                </span>
              </label>
            </div>
            
            {attachments.length > 0 && (
              <div className="space-y-2 mt-2">
                <Label className="text-sm">Uploaded Files:</Label>
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-muted/50 rounded px-3 py-2"
                  >
                    <span className="text-sm truncate flex-1">
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeAttachment(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
