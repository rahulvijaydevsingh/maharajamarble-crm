import React from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Clock,
  Edit, 
  Trash2,
  ExternalLink,
  CheckSquare,
  Bell
} from "lucide-react";
import { format } from "date-fns";
import { 
  getActivityIcon, 
  getActivityColors,
  ACTIVITY_TYPE_LABELS
} from "@/constants/activityLogConstants";
import { ActivityLogEntry } from "@/hooks/useActivityLog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

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
  onViewReminder
}: ActivityLogItemProps) {
  const navigate = useNavigate();
  const Icon = getActivityIcon(activity.activity_type);
  const colors = getActivityColors(activity.activity_type);
  const typeLabel = ACTIVITY_TYPE_LABELS[activity.activity_type] || activity.title;

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const isSystemActivity = activity.user_name === 'System' || !activity.user_id;

  const ts = new Date(activity.activity_timestamp);
  const formattedDate = format(ts, "dd MMM yyyy");
  const formattedTime = format(ts, "hh:mm a");

  const cardTone = (() => {
    // Tone by category, using semantic tokens only
    switch (activity.activity_category) {
      case 'status_change':
        return 'border-primary/20 bg-primary/5';
      case 'task':
        return 'border-secondary/40 bg-secondary/20';
      case 'quotation':
        return 'border-accent/40 bg-accent/20';
      case 'communication':
        return 'border-accent/40 bg-accent/20';
      case 'attachment':
        return 'border-border bg-muted/20';
      case 'note':
        return 'border-border bg-muted/20';
      case 'reminder':
        return 'border-border bg-muted/20';
      case 'automation':
        return 'border-accent/40 bg-accent/20';
      case 'field_update':
        return 'border-primary/20 bg-primary/5';
      default:
        return 'border-border bg-background';
    }
  })();

  // Handle view related entity click
  const handleViewRelatedEntity = () => {
    if (!activity.related_entity_type || !activity.related_entity_id) return;

    if (activity.related_entity_type === 'task' && onViewTask) {
      onViewTask(activity.related_entity_id);
    } else if (activity.related_entity_type === 'reminder' && onViewReminder) {
      onViewReminder(activity.related_entity_id);
    } else if (activity.related_entity_type === 'lead') {
      navigate(`/leads?view=${activity.related_entity_id}`);
    } else if (activity.related_entity_type === 'customer') {
      navigate(`/customers?view=${activity.related_entity_id}`);
    } else if (activity.related_entity_type === 'professional') {
      navigate(`/professionals?view=${activity.related_entity_id}`);
    } else if (activity.related_entity_type === 'quotation') {
      navigate(`/quotations?view=${activity.related_entity_id}`);
    }
  };

  // Get task/reminder info from metadata
  const taskId = activity.metadata?.task_id;
  const reminderId = activity.metadata?.reminder_id;

  return (
    <div className="relative group">
      <div className={"relative flex gap-4"}>
        {/* Icon */}
        <div
          className={
            `relative z-10 flex h-10 w-10 items-center justify-center rounded-full ${colors.bg} ${colors.text} shrink-0 ring-1 ring-border`
          }
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* Card */}
        <div className={`flex-1 min-w-0 rounded-lg border p-4 ${cardTone}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* Date/time */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{formattedDate}</span>
                <span className="text-muted-foreground/60">•</span>
                <Clock className="h-3.5 w-3.5" />
                <span>{formattedTime}</span>
              </div>

              {/* Title */}
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-sm truncate">{typeLabel}</h4>
                {activity.is_manual && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    Manual
                  </Badge>
                )}
              </div>

              {/* User row */}
              <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
                {!isSystemActivity ? (
                  <>
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px]">
                        {getUserInitials(activity.user_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground">{activity.user_name}</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">System</span>
                )}
              </div>

              {/* Description */}
              {activity.description && (
                <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                  {activity.description}
                </p>
              )}

              {/* Status/field change chips */}
              {activity.metadata?.old_value !== undefined && activity.metadata?.new_value !== undefined && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="max-w-[12rem] truncate">
                    {String(activity.metadata.old_value)}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="secondary" className="max-w-[12rem] truncate">
                    {String(activity.metadata.new_value)}
                  </Badge>
                </div>
              )}

              {/* Attachments */}
              {activity.attachments && activity.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activity.attachments.map((attachment: any, index: number) => (
                    <Badge key={index} variant="secondary" className="text-xs gap-1">
                      📎 {attachment.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Quick Action Links */}
              <div className="mt-3 flex flex-wrap gap-3">
                {taskId && onViewTask && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-primary"
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
                    className="h-auto p-0 text-xs text-primary"
                    onClick={() => onViewReminder(reminderId)}
                  >
                    <Bell className="h-3 w-3 mr-1" />
                    View Reminder
                  </Button>
                )}

                {activity.related_entity_type &&
                  activity.related_entity_id &&
                  activity.related_entity_type !== 'task' &&
                  activity.related_entity_type !== 'reminder' && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary"
                      onClick={handleViewRelatedEntity}
                    >
                      View {activity.related_entity_type}
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  )}
              </div>
            </div>

            {/* Admin actions */}
            {isAdmin && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEdit?.(activity)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit Activity</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDelete?.(activity)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete Activity</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
