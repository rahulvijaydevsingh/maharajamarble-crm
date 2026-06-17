import { parseISO, isPast, isToday, differenceInHours } from "date-fns";

export type TaskStatus = "Pending" | "In Progress" | "Overdue" | "Completed";

export interface TaskStatusConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}

export const TASK_STATUS_CONFIG: Record<TaskStatus, TaskStatusConfig> = {
  Pending: {
    label: "Pending",
    color: "#3B82F6",
    bgColor: "bg-blue-50 text-blue-600",
    icon: "⏳",
  },
  "In Progress": {
    label: "In Progress",
    color: "#F59E0B",
    bgColor: "bg-orange-50 text-orange-600",
    icon: "🔄",
  },
  Overdue: {
    label: "Overdue",
    color: "#EF4444",
    bgColor: "bg-red-50 text-red-600",
    icon: "⚠️",
  },
  Completed: {
    label: "Completed",
    color: "#10B981",
    bgColor: "bg-green-50 text-green-600",
    icon: "✅",
  },
};

interface TaskForStatusCalculation {
  due_date: string;
  due_time?: string | null;
  completed_at?: string | null;
  status?: string;
}

/**
 * Calculates the task status based on due date and completion status.
 * This is the SINGLE SOURCE OF TRUTH for task status calculation.
 * 
 * Rules:
 * 1. If completed_at is set → Completed
 * 2. If due_date has passed → Overdue
 * 3. If due_date is within 24 hours → In Progress
 * 4. Otherwise → Pending
 */
export function calculateTaskStatus(task: TaskForStatusCalculation): TaskStatus {
  // If task is explicitly completed
  if (task.completed_at) {
    return "Completed";
  }

  // If stored status is Completed, return it
  if (task.status === "Completed") {
    return "Completed";
  }

  // Parse due date
  if (!task.due_date) {
    return "Pending"; // No due date means pending
  }

  let dueDateTime: Date;
  
  try {
    const dueDate = parseISO(task.due_date);
    
    if (task.due_time) {
      const [hours, minutes] = task.due_time.split(":").map(Number);
      dueDateTime = new Date(dueDate);
      dueDateTime.setHours(hours, minutes, 0, 0);
    } else {
      // If no time specified, use end of day
      dueDateTime = new Date(dueDate);
      dueDateTime.setHours(23, 59, 59, 999);
    }
  } catch {
    return "Pending";
  }

  const now = new Date();

  // If past due
  if (isPast(dueDateTime) && !isToday(dueDateTime)) {
    return "Overdue";
  }

  // If due today or past the specific time today
  if (isToday(dueDateTime)) {
    if (now > dueDateTime) {
      return "Overdue";
    }
    // Due today but not yet - In Progress
    return "In Progress";
  }

  // If due within 24 hours
  const hoursUntilDue = differenceInHours(dueDateTime, now);
  if (hoursUntilDue <= 24 && hoursUntilDue > 0) {
    return "In Progress";
  }

  // Everything else is Pending
  return "Pending";
}

/**
 * Get the status configuration for a given status
 */
export function getTaskStatusConfig(status: TaskStatus): TaskStatusConfig {
  return TASK_STATUS_CONFIG[status] || TASK_STATUS_CONFIG.Pending;
}

/**
 * Check if task was completed late (after due date)
 */
export function wasCompletedLate(task: TaskForStatusCalculation): boolean {
  if (!task.completed_at || !task.due_date) {
    return false;
  }

  const completedAt = new Date(task.completed_at);
  let dueDateTime: Date;

  try {
    const dueDate = parseISO(task.due_date);
    if (task.due_time) {
      const [hours, minutes] = task.due_time.split(":").map(Number);
      dueDateTime = new Date(dueDate);
      dueDateTime.setHours(hours, minutes, 0, 0);
    } else {
      dueDateTime = new Date(dueDate);
      dueDateTime.setHours(23, 59, 59, 999);
    }
  } catch {
    return false;
  }

  return completedAt > dueDateTime;
}
