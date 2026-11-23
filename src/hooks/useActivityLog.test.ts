import { describe, expect, it } from "vitest";
import { mergeActivityById, type ActivityLogEntry } from "./useActivityLog";

const activity = (id: string, title: string) => ({ id, title }) as ActivityLogEntry;

describe("mergeActivityById", () => {
  it("keeps one activity when the saved row arrives again from realtime", () => {
    const savedActivity = activity("activity-1", "Showroom visit");
    const nextActivities = mergeActivityById([savedActivity], savedActivity);

    expect(nextActivities).toHaveLength(1);
    expect(nextActivities[0].id).toBe("activity-1");
  });
});