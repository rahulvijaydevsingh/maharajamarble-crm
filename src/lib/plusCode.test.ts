import { describe, expect, it } from "vitest";
import { coordinatesToPlusCode, decodePlusCode, getGoogleMapsUrlFromPlusCode } from "./plusCode";

describe("decodePlusCode and Google Maps links", () => {
  it("round trips coordinates within grid precision", () => {
    const code = coordinatesToPlusCode(30.7046, 76.7179);
    const decoded = decodePlusCode(code);
    expect(decoded).not.toBeNull();
    expect(Math.abs((decoded?.lat ?? 0) - 30.7046)).toBeLessThan(0.001);
    expect(Math.abs((decoded?.lng ?? 0) - 76.7179)).toBeLessThan(0.001);
  });
  it("rejects short or malformed codes", () => {
    expect(decodePlusCode("PRP9+2V")).toBeNull();
    expect(decodePlusCode("invalid")).toBeNull();
    expect(decodePlusCode(null)).toBeNull();
  });
  it("formats Google Maps URL", () => {
    expect(getGoogleMapsUrlFromPlusCode("7JWRPRP9+2V")).toBe(
      "https://www.google.com/maps/search/?api=1&query=7JWRPRP9%2B2V",
    );
    expect(getGoogleMapsUrlFromPlusCode("short+2v")).toBeNull();
  });
});
