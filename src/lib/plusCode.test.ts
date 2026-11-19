import { describe, expect, it } from "vitest";
import { coordinatesToPlusCode, decodePlusCode, decodePlusCodeCenter, getGoogleMapsUrlFromPlusCode, isValidPlusCodeFormat } from "./plusCode";

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


describe("Plus Code utilities (Slice 1B)", () => {
  it("formats full and short Plus Code search URLs with optional locality text", () => {
    expect(getGoogleMapsUrlFromPlusCode("8J2QWV24+2W")).toBe(
      "https://www.google.com/maps/search/?api=1&query=8J2QWV24%2B2W",
    );
    expect(getGoogleMapsUrlFromPlusCode("VRF8+5Q Ludhiana, Punjab")).toBe(
      "https://www.google.com/maps/search/?api=1&query=VRF8%2B5Q%20Ludhiana%2C%20Punjab",
    );
    expect(getGoogleMapsUrlFromPlusCode("  ")).toBeNull();
    expect(getGoogleMapsUrlFromPlusCode(null)).toBeNull();
  });

  it("validates full and short Plus Code token formats", () => {
    expect(isValidPlusCodeFormat("8J2QWV24+2W")).toBe(true);
    expect(isValidPlusCodeFormat("VRF8+5Q Ludhiana")).toBe(true);
    expect(isValidPlusCodeFormat("invalid-code")).toBe(false);
    expect(isValidPlusCodeFormat("8J2QWV24+")).toBe(false);
    expect(isValidPlusCodeFormat("")).toBe(false);
  });

  it("decodes a full Plus Code for the Ludhiana coordinate area", () => {
    const decoded = decodePlusCodeCenter("8J2QWV24+2W");
    expect(decoded).not.toBeNull();
    expect(decoded!.lat).toBeGreaterThan(30.89);
    expect(decoded!.lat).toBeLessThan(30.91);
    expect(decoded!.lng).toBeGreaterThan(75.84);
    expect(decoded!.lng).toBeLessThan(75.87);
  });

  it("does not decode a short/local Plus Code without a reference area", () => {
    expect(decodePlusCodeCenter("VRF8+5Q")).toBeNull();
    expect(decodePlusCodeCenter("")).toBeNull();
  });

  it("decodes the earlier full token to its actual OLC coordinate range", () => {
    const decoded = decodePlusCodeCenter("8J2VVRF8+5Q");
    expect(decoded).not.toBeNull();
    expect(decoded!.lat).toBeGreaterThan(30.8);
    expect(decoded!.lat).toBeLessThan(31.0);
    expect(decoded!.lng).toBeGreaterThan(77.7);
    expect(decoded!.lng).toBeLessThan(77.9);
  });
});
