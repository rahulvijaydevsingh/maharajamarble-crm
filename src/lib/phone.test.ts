import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone10, toPhoneE164 } from "./phone";

describe("normalizePhone10 (Appendix B vectors)", () => {
  const vectors: Array<[string | null | undefined, string | null]> = [
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["0091-9876543210", "9876543210"],
    ["98765-43210", "9876543210"],
    ["(+91) 98765 43210", "9876543210"],
    ["ph: 9876543210", "9876543210"],
    ["1234567890", null],
    ["987654321", null],
    ["91987654321", null],
    ["+1 415 555 2671", null],
    ["01722345678", null],
    ["", null],
    [null, null],
    [undefined, null],
  ];

  it.each(vectors)("normalizes %j -> %j", (input, expected) => {
    expect(normalizePhone10(input)).toBe(expected);
  });

  it("formats valid numbers as digits-only E.164 (91 + phone10)", () => {
    expect(toPhoneE164("+91 98765-43210")).toBe("919876543210");
    expect(toPhoneE164("01722345678")).toBeNull();
  });

  it("masks phone numbers to the last 4 digits", () => {
    expect(maskPhone("9876543210")).toBe("+91 ******3210");
    expect(maskPhone("invalid")).toBe("******");
  });
});
