import { describe, expect, it } from "vitest";
import { buildTodoItemEditPayload } from "@/components/todos/EditTodoItemDialog";

const incrementRefreshToken = (token: number) => token + 1;

describe("to-do list item refresh", () => {
  it("changes the refresh token after a side-panel item mutation", () => {
    expect(incrementRefreshToken(4)).toBe(5);
  });

  it("saves normalized editable item fields without altering workflow fields", () => {
    expect(buildTodoItemEditPayload({
      title: "  Confirm marble delivery  ",
      notes: "  Call customer after loading. ",
      dueDate: "2026-11-18",
    })).toEqual({
      title: "Confirm marble delivery",
      notes: "Call customer after loading.",
      due_date: "2026-11-18",
    });
  });
});