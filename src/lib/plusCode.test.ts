import { describe, expect, it } from "vitest";
import {
  decodePlusCodeCenter,
  getGoogleMapsUrlFromPlusCode,
  isValidPlusCodeFormat,
} from "./plusCode";

describe("Plus Code utilities (Slice 1B)", () => {
  it("formats canonical Google Maps search URLs", () => {
    expect(getGoogleMapsUrlFromPlusCode("8J2QWV24+2W")).toBe(
      "https://www.google.com/maps/search/?api=1&query=8J2QWV24%2B2W",
    );
    expect(getGoogleMapsUrlFromPlusCode("VRF8+5Q Ludhiana, Punjab")).toBe(
      "https://www.google.com/maps/search/?api=1&query=VRF8%2B5Q%20Ludhiana%2C%20Punjab",
    );
    expect(getGoogleMapsUrlFromPlusCode("   ")).toBeNull();
    expect(getGoogleMapsUrlFromPlusCode(null)).toBeNull();
  });

  it("validates short/local and full Plus Code formats", () => {
    expect(isValidPlusCodeFormat("8J2QWV24+2W")).toBe(true);
    expect(isValidPlusCodeFormat("VRF8+5Q Ludhiana")).toBe(true);
    expect(isValidPlusCodeFormat("invalid-code")).toBe(false);
    expect(isValidPlusCodeFormat("8J2QWV24+")).toBe(false);
    expect(isValidPlusCodeFormat("")).toBe(false);
  });

  it("decodes a full Plus Code in Ludhiana to the correct coordinate area", () => {
    const decoded = decodePlusCodeCenter("8J2QWV24+2W");
    expect(decoded).not.toBeNull();
    expect(decoded!.lat).toBeGreaterThan(30.89);
    expect(decoded!.lat).toBeLessThan(30.91);
    expect(decoded!.lng).toBeGreaterThan(75.84);
    expect(decoded!.lng).toBeLessThan(75.87);
  });

  it("does not decode a short local Plus Code without a reference area", () => {
    expect(decodePlusCodeCenter("VRF8+5Q")).toBeNull();
    expect(decodePlusCodeCenter("")).toBeNull();
  });

  it("decodes the previously supplied full token according to its actual OLC coordinates", () => {
    const decoded = decodePlusCodeCenter("8J2VVRF8+5Q");
    expect(decoded).not.toBeNull();
    expect(decoded!.lat).toBeGreaterThan(30.8);
    expect(decoded!.lat).toBeLessThan(31.0);
    expect(decoded!.lng).toBeGreaterThan(77.7);
    expect(decoded!.lng).toBeLessThan(77.9);
  });
});
