import React from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Edit, 
  Trash2,
  ExternalLink,
  CheckSquare,
  Bell
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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
    <div className="relative flex gap-4 group">
      {/* Icon */}
      <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full ${colors.bg} ${colors.text} shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 pt-0.5 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isSystemActivity ? (
            <>
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">
                  {getUserInitials(activity.user_name)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">{activity.user_name}</span>
            </>
          ) : (
            <span className="font-medium text-sm text-muted-foreground">System</span>
          )}
          <span className="text-muted-foreground text-sm">|</span>
          <span className="text-sm font-medium">{typeLabel}</span>
          {activity.is_manual && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
              Manual Entry
            </Badge>
          )}
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>
            {format(new Date(activity.activity_timestamp), 'dd MMM yyyy, HH:mm')}
          </span>
          <span className="ml-1">
            ({formatDistanceToNow(new Date(activity.activity_timestamp), { addSuffix: true })})
          </span>
        </div>

        {/* Description */}
        {activity.description && (
          <p className="text-sm mt-2 text-foreground whitespace-pre-wrap">
            {activity.description}
          </p>
        )}

        {/* Metadata Display */}
        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
          <div className="mt-2 space-y-1">
            {activity.metadata.old_value !== undefined && activity.metadata.new_value !== undefined && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">{activity.metadata.field_name || 'Value'}</span> changed from{' '}
                <span className="line-through text-red-500">{activity.metadata.old_value}</span>{' '}
                → <span className="text-green-600">{activity.metadata.new_value}</span>
              </p>
            )}
            {activity.metadata.task_title && (
              <p className="text-sm text-muted-foreground">
                Task: "{activity.metadata.task_title}"
              </p>
            )}
            {activity.metadata.quotation_number && (
              <p className="text-sm text-muted-foreground">
                Quotation: {activity.metadata.quotation_number}
                {activity.metadata.amount && ` - ₹${activity.metadata.amount.toLocaleString()}`}
              </p>
            )}
            {activity.metadata.automation_name && (
              <div className="text-sm text-muted-foreground">
                <p>Rule: "{activity.metadata.automation_name}"</p>
                {activity.metadata.actions_executed && (
                  <p className="text-xs mt-1">
                    Actions: {activity.metadata.actions_executed.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Attachments */}
        {activity.attachments && activity.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {activity.attachments.map((attachment: any, index: number) => (
              <Badge key={index} variant="secondary" className="text-xs gap-1">
                📎 {attachment.name} ({(attachment.size / 1024).toFixed(1)} KB)
              </Badge>
            ))}
          </div>
        )}

        {/* Quick Action Links */}
        <div className="mt-2 flex flex-wrap gap-2">
          {/* Task Link */}
          {taskId && onViewTask && (
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-xs text-blue-600 hover:text-blue-700"
              onClick={() => onViewTask(taskId)}
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              View Task →
            </Button>
          )}

          {/* Reminder Link */}
          {reminderId && onViewReminder && (
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-xs text-blue-600 hover:text-blue-700"
              onClick={() => onViewReminder(reminderId)}
            >
              <Bell className="h-3 w-3 mr-1" />
              View Reminder →
            </Button>
          )}

          {/* Related Entity Link (for other entities) */}
          {activity.related_entity_type && activity.related_entity_id && 
           activity.related_entity_type !== 'task' && activity.related_entity_type !== 'reminder' && (
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-xs text-blue-600 hover:text-blue-700"
              onClick={handleViewRelatedEntity}
            >
              View {activity.related_entity_type} →
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>

        {/* Admin Actions */}
        {isAdmin && (
          <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
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
  );
}
