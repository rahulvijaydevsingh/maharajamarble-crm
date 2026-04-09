import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Edit, 
  Trash2,
  ExternalLink,
  CheckSquare,
  Bell,
} from "lucide-react";
import { format } from "date-fns";
import { 
  getActivityColors,
  ACTIVITY_TYPE_LABELS,
} from "@/constants/activityLogConstants";
import { ActivityLogEntry } from "@/hooks/useActivityLog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { getStaffDisplayName } from "@/lib/kitHelpers";

interface ActivityLogItemProps {
  activity: ActivityLogEntry;
  isAdmin: boolean;
  onEdit?: (activity: ActivityLogEntry) => void;
  onDelete?: (activity: ActivityLogEntry) => void;
  onViewTask?: (taskId: string) => void;
  onViewReminder?: (reminderId: string) => void;
}

export function ActivityLogItem({ 
  activity, 
  isAdmin, 
  onEdit, 
  onDelete,
  onViewTask,
  onViewReminder,
}: ActivityLogItemProps) {
  const navigate = useNavigate();
  const { staffMembers } = useActiveStaff();
  const typeLabel =
    ACTIVITY_TYPE_LABELS[activity.activity_type] || activity.title;

  const isSystemActivity =
    activity.user_name === "System" || !activity.user_id;

  const ts = new Date(activity.activity_timestamp);
  const formattedDateTime = format(ts, "dd MMM yyyy · hh:mm a");

  const displayName = isSystemActivity
    ? "System"
    : getStaffDisplayName(activity.user_name, staffMembers);

  const taskId = activity.metadata?.task_id;
  const reminderId = activity.metadata?.reminder_id;

  const handleViewRelatedEntity = () => {
    if (!activity.related_entity_type || !activity.related_entity_id) return;
    if (activity.related_entity_type === "task" && onViewTask) {
      onViewTask(activity.related_entity_id);
    } else if (
      activity.related_entity_type === "reminder" &&
      onViewReminder
    ) {
      onViewReminder(activity.related_entity_id);
    } else if (activity.related_entity_type === "lead") {
      navigate(`/leads?view=${activity.related_entity_id}`);
    } else if (activity.related_entity_type === "customer") {
      navigate(`/customers?view=${activity.related_entity_id}`);
    } else if (activity.related_entity_type === "professional") {
      navigate(`/professionals?view=${activity.related_entity_id}`);
    } else if (activity.related_entity_type === "quotation") {
      navigate(`/quotations?view=${activity.related_entity_id}`);
    }
  };

  /* ── dot colour driven by category ── */
  const dotColor = (() => {
    switch (activity.activity_category) {
      case "status_change":  return "bg-primary";
      case "task":           return "bg-violet-500";
      case "quotation":      return "bg-accent";
      case "communication":  return "bg-blue-500";
      case "attachment":     return "bg-muted-foreground";
      case "note":           return "bg-amber-500";
      case "reminder":       return "bg-muted-foreground";
      case "automation":     return "bg-orange-500";
      case "field_update":   return "bg-primary";
      default:               return "bg-border";
    }
  })();

  /* ── badge colour by category ── */
  const badgeClass = (() => {
    switch (activity.activity_category) {
      case "status_change":  return "bg-primary/10 text-primary border-primary/20";
      case "task":           return "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800";
      case "quotation":      return "bg-accent/20 text-accent-foreground border-accent/30";
      case "communication":  return "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800";
      case "note":           return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
      case "automation":     return "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800";
      default:               return "bg-muted text-muted-foreground border-border";
    }
  })();

  /* quick-action links that appear below the main row when present */
  const hasQuickLinks =
    (taskId && onViewTask) ||
    (reminderId && onViewReminder) ||
    (activity.related_entity_type &&
      activity.related_entity_id &&
      activity.related_entity_type !== "task" &&
      activity.related_entity_type !== "reminder") ||
    (activity.attachments && activity.attachments.length > 0);

  return (
    /* outer wrapper — the dot sits here, the card is to the right */
    <div className="relative flex items-start gap-3 group">

      {/* Timeline dot — pulled left to sit exactly on the container's left border line */}
      <div
        className={`mt-[14px] h-[9px] w-[9px] rounded-full shrink-0 ring-2 ring-background -ml-[20.5px] relative z-10 ${dotColor}`}
      />

      {/* Card */}
      <div
        className={`
          flex-1 min-w-0 rounded-lg border bg-card
          transition-colors duration-150
          hover:border-border/80
        `}
      >
        {/* ── Main horizontal row ── */}
        <div className="flex items-center gap-0 px-3 py-2.5 min-w-0">

          {/* Badge */}
          <span
            className={`
              inline-flex items-center text-[11px] font-medium
              px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0
              ${badgeClass}
            `}
          >
            {typeLabel}
            {activity.is_manual && (
              <span className="ml-1 opacity-60">(manual)</span>
            )}
          </span>

          {/* Vertical divider */}
          <div className="mx-3 h-5 w-px bg-border shrink-0" />

          {/* Title + description — takes all available space */}
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-medium text-foreground">
              {activity.title}
            </span>
            {activity.description && (
              <span className="text-[12px] text-muted-foreground ml-2 truncate">
                {activity.description}
              </span>
            )}
            {/* status change chips inline */}
            {activity.metadata?.old_value !== undefined &&
              activity.metadata?.new_value !== undefined && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px]">
                  <span className="border border-border rounded px-1.5 py-0.5 max-w-[8rem] truncate">
                    {String(activity.metadata.old_value)}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="bg-muted rounded px-1.5 py-0.5 max-w-[8rem] truncate">
                    {String(activity.metadata.new_value)}
                  </span>
                </span>
              )}
          </div>

            {/* Right side: fixed-width column, no layout shift */}
            <div className="ml-3 shrink-0 w-[200px] flex flex-col items-end gap-1">
              {/* Name + datetime — always visible, never hidden */}
              <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                {displayName}
              </span>
              <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
                {formattedDateTime}
              </span>

              {/* Edit + Delete — sit BELOW name/datetime,
                  invisible by default, fade in on hover.
                  opacity-0 keeps them in flow so no height shift. */}
              {isAdmin && (
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px] gap-1"
                        onClick={() => onEdit?.(activity)}
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit activity</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => onDelete?.(activity)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete activity</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
        </div>

        {/* ── Quick-link row (only renders when links exist) ── */}
        {hasQuickLinks && (
          <div className="flex flex-wrap gap-3 px-3 pb-2 -mt-0.5">
            {taskId && onViewTask && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-[11px] text-primary"
                onClick={() => onViewTask(taskId)}
              >
                <CheckSquare className="h-3 w-3 mr-1" />
                View Task
              </Button>
            )}
            {reminderId && onViewReminder && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-[11px] text-primary"
                onClick={() => onViewReminder(reminderId)}
              >
                <Bell className="h-3 w-3 mr-1" />
                View Reminder
              </Button>
            )}
            {activity.related_entity_type &&
              activity.related_entity_id &&
              activity.related_entity_type !== "task" &&
              activity.related_entity_type !== "reminder" && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-[11px] text-primary"
                  onClick={handleViewRelatedEntity}
                >
                  View {activity.related_entity_type}
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              )}
            {/* attachments */}
            {activity.attachments && activity.attachments.length > 0 &&
              activity.attachments.map((attachment: any, index: number) => (
                <Badge key={index} variant="secondary" className="text-[11px] gap-1">
                  📎 {attachment.name}
                </Badge>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
