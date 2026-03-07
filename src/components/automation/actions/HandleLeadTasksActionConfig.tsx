import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { buildStaffGroups } from "@/lib/staffSelect";

interface HandleLeadTasksActionConfigProps {
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

export const HandleLeadTasksActionConfig = ({ config, onConfigChange }: HandleLeadTasksActionConfigProps) => {
  const { data: staffList = [] } = useActiveStaff();
  const { allStaffFlat } = buildStaffGroups(staffList);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Operation *</Label>
        <Select
          value={config.operation || ""}
          onValueChange={(v) => onConfigChange({ ...config, operation: v })}
        >
          <SelectTrigger><SelectValue placeholder="Select operation" /></SelectTrigger>
          <SelectContent className="z-[220]">
            <SelectItem value="cancel_all">Cancel all open tasks on this lead</SelectItem>
            <SelectItem value="reassign_all">Reassign all open tasks to...</SelectItem>
            <SelectItem value="add_note_all">Add note to all open tasks</SelectItem>
            <SelectItem value="complete_all">Complete all open tasks on this lead</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.operation === "reassign_all" && (
        <div className="space-y-2">
          <Label>Reassign To</Label>
          <Select
            value={config.reassign_to_user || ""}
            onValueChange={(v) => onConfigChange({ ...config, reassign_to_type: "specific_user", reassign_to_user: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
            <SelectContent className="z-[220]">
              {allStaffFlat.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(config.operation === "reassign_all" || config.operation === "add_note_all" || config.operation === "cancel_all") && (
        <div className="space-y-2">
          <Label>Task Note {config.operation === "add_note_all" ? "*" : "(optional)"}</Label>
          <Textarea
            value={config.task_note || ""}
            onChange={(e) => onConfigChange({ ...config, task_note: e.target.value })}
            placeholder="e.g., Reassigned: {lead_name} pending Lost approval"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Variables: {"{lead_name}"}, {"{trigger_reason}"}, {"{original_assignee}"}, {"{new_status}"}
          </p>
        </div>
      )}
    </div>
  );
};
