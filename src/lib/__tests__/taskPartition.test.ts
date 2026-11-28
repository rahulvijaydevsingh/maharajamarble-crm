import { describe, expect, it } from "vitest";
import {
  isActiveBoardTask,
  isLostLeadTask,
  isOrphanLeadTask,
  isRecycleBinTask,
  partitionDesktopTasks,
  type PartitionableTask,
} from "@/lib/taskPartition";

interface TestTask extends PartitionableTask {
  id: string;
  title: string;
  type: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
}
const makeTask = (overrides: Partial<TestTask> = {}): TestTask => ({
  id: "task-default",
  title: "Sample task",
  type: "Follow-up Call",
  status: "Pending",
  lead_id: "lead-123",
  lead: { status: "in-progress" },
  is_deleted: false,
  ...overrides,
});
const expectBucket = (task: TestTask, bucket: "active" | "lost" | "recycle") => {
  expect(isActiveBoardTask(task)).toBe(bucket === "active");
  expect(isLostLeadTask(task)).toBe(bucket === "lost");
  expect(isRecycleBinTask(task)).toBe(bucket === "recycle");
};

describe("Desktop task partitioning", () => {
  it("keeps Narinder's completed Follow-up Call in Active", () => {
    expectBucket(makeTask({
      id: "dfd99849-3992-4609-899b-ee2f02efcf88",
      title: "Follow-up: Narinder singh",
      type: "Follow-up Call",
      status: "Completed",
      lead_id: "50e43bde-9e0a-4520-84b2-a047198b6f38",
      lead: { status: "in-progress" },
      related_entity_type: "professional",
      related_entity_id: "c8ed3218-85f8-449c-8640-aad611da8bd1",
    }), "active");
  });
  it("keeps Narinder's pending Re-visit required professional task in Active", () => {
    expectBucket(makeTask({
      id: "ba8d6164-88bf-4be7-bff8-2a0e722b4686",
      title: "Follow-up: Follow-up: Narinder singh",
      type: "Re-visit required",
      status: "Pending",
      lead_id: null,
      lead: null,
      related_entity_type: "professional",
      related_entity_id: "c8ed3218-85f8-449c-8640-aad611da8bd1",
    }), "active");
  });
  it.each(["Pending", "Completed"])("keeps Customer task (%s) in Active", (status) => {
    expectBucket(makeTask({
      id: `customer-${status}`, status, lead_id: null, lead: null,
      related_entity_type: "customer", related_entity_id: "customer-123",
    }), "active");
  });
  it("keeps a legacy customers-plural task in Active", () => {
    expectBucket(makeTask({
      id: "legacy-customers-task", lead_id: null, lead: null,
      related_entity_type: "customers", related_entity_id: "customer-legacy",
    }), "active");
  });
  it("identifies a true orphan only when lead_id is populated and lead is missing", () => {
    const task = makeTask({ lead_id: "lead-123", lead: null });
    expect(isOrphanLeadTask(task)).toBe(true);
    expectBucket(task, "recycle");
  });
  it("does not classify a null lead_id as orphaned", () => {
    const task = makeTask({ lead_id: null, lead: undefined });
    expect(isOrphanLeadTask(task)).toBe(false);
    expectBucket(task, "active");
  });
  it("puts soft-deleted tasks in Recycle Bin even when lead_id is null", () => {
    expectBucket(makeTask({ lead_id: null, lead: null, is_deleted: true }), "recycle");
  });
  it("puts Cancelled tasks in Recycle Bin with null or resolved lead", () => {
    expectBucket(makeTask({ lead_id: null, lead: null, status: "Cancelled" }), "recycle");
    expectBucket(makeTask({ status: "Cancelled" }), "recycle");
  });
  it("puts tasks with deleted parent leads in Recycle Bin", () => {
    expectBucket(makeTask({ lead: { status: "deleted" } }), "recycle");
  });
  it.each(["lost", "pending_lost"])("keeps %s lead tasks exclusively in Lost Lead Tasks", (status) => {
    expectBucket(makeTask({ lead: { status } }), "lost");
  });
  it("gives Recycle Bin precedence over a lost lead when soft-deleted", () => {
    expectBucket(makeTask({ lead: { status: "lost" }, is_deleted: true }), "recycle");
  });
  it("gives Recycle Bin precedence over a lost lead when Cancelled", () => {
    expectBucket(makeTask({ lead: { status: "pending_lost" }, status: "Cancelled" }), "recycle");
  });
  it("partitions a mixed fixture exhaustively with no duplicate IDs", () => {
    const tasks = [
      makeTask({ id: "narinder-completed", status: "Completed" }),
      makeTask({ id: "narinder-revisit", lead_id: null, lead: null, type: "Re-visit required", related_entity_type: "professional" }),
      makeTask({ id: "customer-pending", lead_id: null, lead: null, related_entity_type: "customer" }),
      makeTask({ id: "customer-completed", lead_id: null, lead: null, related_entity_type: "customer", status: "Completed" }),
      makeTask({ id: "legacy-customers", lead_id: null, lead: null, related_entity_type: "customers" }),
      makeTask({ id: "orphan", lead: null }),
      makeTask({ id: "soft-deleted", lead_id: null, lead: null, is_deleted: true }),
      makeTask({ id: "cancelled-null", lead_id: null, lead: null, status: "Cancelled" }),
      makeTask({ id: "cancelled-linked", status: "Cancelled" }),
      makeTask({ id: "deleted-parent", lead: { status: "deleted" } }),
      makeTask({ id: "lost", lead: { status: "lost" } }),
      makeTask({ id: "pending-lost", lead: { status: "pending_lost" } }),
      makeTask({ id: "lost-deleted", lead: { status: "lost" }, is_deleted: true }),
      makeTask({ id: "pending-lost-cancelled", lead: { status: "pending_lost" }, status: "Cancelled" }),
    ];
    const partition = partitionDesktopTasks(tasks);
    const rows = [...partition.active, ...partition.lostLead, ...partition.recycleBin];
    const ids = rows.map((task) => task.id);
    expect(partition.active.map((task) => task.id)).toEqual([
      "narinder-completed", "narinder-revisit", "customer-pending", "customer-completed", "legacy-customers",
    ]);
    expect(partition.lostLead.map((task) => task.id)).toEqual(["lost", "pending-lost"]);
    expect(partition.recycleBin.map((task) => task.id)).toEqual([
      "orphan", "soft-deleted", "cancelled-null", "cancelled-linked", "deleted-parent", "lost-deleted", "pending-lost-cancelled",
    ]);
    expect(partition.active.length + partition.lostLead.length + partition.recycleBin.length).toBe(tasks.length);
    expect(new Set(ids).size).toBe(tasks.length);
  });
});
