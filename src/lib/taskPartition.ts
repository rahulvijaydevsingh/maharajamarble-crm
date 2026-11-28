/**
 * Shared Desktop task-board partitioning rules.
 *
 * Recycle Bin takes precedence over Lost Lead Tasks, which takes precedence
 * over Active Tasks. A missing joined lead is an orphan only when lead_id is
 * non-null, so Customer and Professional tasks remain in Active Tasks.
 */
export interface PartitionableTask {
  id?: string;
  lead_id?: string | null;
  lead?: { status?: string | null } | null;
  is_deleted?: boolean | null;
  status?: string | null;
}

export interface DesktopTaskPartition<T extends PartitionableTask> {
  active: T[];
  lostLead: T[];
  recycleBin: T[];
}

/** True only when an intended lead relationship cannot be resolved. */
export function isOrphanLeadTask(task: PartitionableTask): boolean {
  return task.lead_id != null && task.lead == null;
}

/** Tasks explicitly deleted, orphaned, attached to deleted leads, or cancelled. */
export function isRecycleBinTask(task: PartitionableTask): boolean {
  return Boolean(task.is_deleted) ||
    isOrphanLeadTask(task) ||
    task.lead?.status === "deleted" ||
    task.status === "Cancelled";
}

/** Lost tasks cannot also be in Recycle Bin. */
export function isLostLeadTask(task: PartitionableTask): boolean {
  return !isRecycleBinTask(task) &&
    (task.lead?.status === "lost" || task.lead?.status === "pending_lost");
}

/** Active is the remainder after Recycle Bin and Lost Lead Tasks. */
export function isActiveBoardTask(task: PartitionableTask): boolean {
  return !isRecycleBinTask(task) && !isLostLeadTask(task);
}

/** Partition all rows into exactly one of the three Desktop board buckets. */
export function partitionDesktopTasks<T extends PartitionableTask>(
  tasks: readonly T[],
): DesktopTaskPartition<T> {
  const partition: DesktopTaskPartition<T> = { active: [], lostLead: [], recycleBin: [] };
  for (const task of tasks) {
    if (isRecycleBinTask(task)) partition.recycleBin.push(task);
    else if (isLostLeadTask(task)) partition.lostLead.push(task);
    else partition.active.push(task);
  }
  return partition;
}
