import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { MessageSquare } from "lucide-react";

interface SendMessageActionConfigProps {
  config: Record<string, any>;
  onConfigChange: (updates: Record<string, any>) => void;
}

const MESSAGE_RECIPIENT_OPTIONS = [
  { value: "trigger.assigned_to", label: "Assigned User (from trigger record)" },
  { value: "trigger.created_by", label: "Created By (from trigger record)" },
  { value: "specific_user", label: "Specific User" },
  { value: "specific_users_multi", label: "Multiple Specific Users" },
  { value: "all_managers", label: "All Managers" },
  { value: "all_admins", label: "All Admins" },
];

export const SendMessageActionConfig = ({ config, onConfigChange }: SendMessageActionConfigProps) => {
  const { staffMembers, loading } = useActiveStaff();

  const handleChange = (field: string, value: any) => {
    onConfigChange({ ...config, [field]: value });
  };

  const toggleUser = (userId: string) => {
    const currentUsers = config.selected_user_ids || [];
    if (currentUsers.includes(userId)) {
      handleChange("selected_user_ids", currentUsers.filter((id: string) => id !== userId));
    } else {
      handleChange("selected_user_ids", [...currentUsers, userId]);
    }
  };

  const selectedUserIds = config.selected_user_ids || [];

  return (
    <div className="space-y-4">
      {/* Message Type Info */}
      <Card className="p-3 bg-muted/50">
        <div className="flex items-start gap-2">
          <MessageSquare className="h-4 w-4 mt-0.5 text-primary" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Internal Chat Message</p>
            <p>This action sends a direct message via the internal chat system. Recipients will see it in their Messages inbox and notification bell.</p>
          </div>
        </div>
      </Card>

      {/* Recipient Type */}
      <div className="space-y-2">
        <Label>Send Message To *</Label>
        <Select
          value={config.recipient_type || "trigger.assigned_to"}
          onValueChange={(v) => handleChange("recipient_type", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESSAGE_RECIPIENT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Single Specific User Selection */}
      {config.recipient_type === "specific_user" && (
        <div className="space-y-2">
          <Label>Select User *</Label>
          <Select
            value={config.specific_user_id || ""}
            onValueChange={(v) => handleChange("specific_user_id", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a user..." />
            </SelectTrigger>
            <SelectContent>
              {loading ? (
                <SelectItem value="loading" disabled>Loading...</SelectItem>
              ) : (
                staffMembers.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name} {staff.role && <span className="text-muted-foreground">({staff.role})</span>}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Multiple Users Selection */}
      {config.recipient_type === "specific_users_multi" && (
        <Card className="p-4 space-y-3">
          <Label className="font-medium">Select Users *</Label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading staff members...</p>
            ) : (
              staffMembers.map((staff) => (
                <div key={staff.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={staff.id}
                    checked={selectedUserIds.includes(staff.id)}
                    onCheckedChange={() => toggleUser(staff.id)}
                  />
                  <label
                    htmlFor={staff.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {staff.name}
                    {staff.role && <span className="text-muted-foreground ml-1">({staff.role})</span>}
                  </label>
                </div>
              ))
            )}
          </div>
          {selectedUserIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground mr-1">Selected:</span>
              {selectedUserIds.map((id: string) => {
                const user = staffMembers.find(s => s.id === id);
                return (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {user?.name || id}
                  </Badge>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Message Subject/Title (optional) */}
      <div className="space-y-2">
        <Label>Message Subject (Optional)</Label>
        <Input
          value={config.subject || ""}
          onChange={(e) => handleChange("subject", e.target.value)}
          placeholder='e.g., "Urgent: Action Required for Lead"'
          maxLength={100}
        />
        <p className="text-xs text-muted-foreground">
          Appears as a header in the chat message
        </p>
      </div>

      {/* Message Body */}
      <div className="space-y-2">
        <Label>Message Body *</Label>
        <Textarea
          value={config.message || ""}
          onChange={(e) => handleChange("message", e.target.value)}
          placeholder={`e.g., "Lead {{trigger.name}} needs immediate attention.\n\nStatus: {{trigger.status}}\nAssigned To: {{trigger.assigned_to}}\n\nPlease follow up as soon as possible."`}
          rows={5}
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Max 2000 characters. Supports variables like {"{{trigger.name}}"}, {"{{trigger.status}}"}, {"{{trigger.assigned_to}}"}
        </p>
      </div>

      {/* Available Variables Helper */}
      <Card className="p-3 bg-muted/30">
        <Label className="text-xs font-medium mb-2 block">Available Variables:</Label>
        <div className="flex flex-wrap gap-1">
          {["{{trigger.name}}", "{{trigger.status}}", "{{trigger.assigned_to}}", "{{trigger.phone}}", "{{trigger.email}}", "{{trigger.created_at}}"].map((variable) => (
            <Badge key={variable} variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => {
              const currentMsg = config.message || "";
              handleChange("message", currentMsg + " " + variable);
            }}>
              {variable}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Click to add to message</p>
      </Card>

      {/* Include Record Link */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-medium">Include Link to Record</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Adds a clickable link to view the trigger record (Lead/Customer/Task) directly in the message
            </p>
          </div>
          <Switch
            checked={config.include_record_link !== false}
            onCheckedChange={(checked) => handleChange("include_record_link", checked)}
          />
        </div>
      </Card>

      {/* Priority */}
      <div className="space-y-2">
        <Label>Message Priority</Label>
        <Select
          value={config.priority || "normal"}
          onValueChange={(v) => handleChange("priority", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="important">Important - Highlighted in chat</SelectItem>
            <SelectItem value="urgent">Urgent - Sends push notification</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
