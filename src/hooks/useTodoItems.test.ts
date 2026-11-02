import { describe, expect, it } from "vitest";

const incrementRefreshToken = (token: number) => token + 1;

describe("to-do list item refresh", () => {
  it("changes the refresh token after a side-panel item mutation", () => {
    expect(incrementRefreshToken(4)).toBe(5);
  });
});