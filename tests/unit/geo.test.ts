import { describe, it, expect } from "vitest";
import { haversineM, isValidLat, isValidLng } from "@/lib/geo";

describe("haversineM", () => {
  it("returns 0 for identical points", () => {
    const p = { lat: 43.6791, lng: -70.4444 };
    expect(haversineM(p, p)).toBe(0);
  });

  it("matches a known city-scale fixture (Gorham, ME → Portland, ME)", () => {
    // Gorham (43.6791, -70.4444) → Portland (43.6591, -70.2568)
    // Reference distance ~15.4km. Allow 1% tolerance for sphere approx.
    const d = haversineM(
      { lat: 43.6791, lng: -70.4444 },
      { lat: 43.6591, lng: -70.2568 },
    );
    expect(d).toBeGreaterThan(14_000);
    expect(d).toBeLessThan(17_000);
  });

  it("matches a known cross-country fixture (NYC → LA)", () => {
    // NYC (40.7128, -74.0060) → LA (34.0522, -118.2437)
    // Reference great-circle ~3,944km. Allow 1% tolerance.
    const d = haversineM(
      { lat: 40.7128, lng: -74.006 },
      { lat: 34.0522, lng: -118.2437 },
    );
    expect(d).toBeGreaterThan(3_900_000);
    expect(d).toBeLessThan(3_990_000);
  });

  it("antipodal points are roughly half the Earth's circumference", () => {
    // Earth's circumference ~40,075km, so antipodal great-circle ~20,037km.
    const d = haversineM({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(d).toBeGreaterThan(20_000_000);
    expect(d).toBeLessThan(20_100_000);
  });

  it("commutative — order of args doesn't change the result", () => {
    const a = { lat: 43.6791, lng: -70.4444 };
    const b = { lat: 40.7128, lng: -74.006 };
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 6);
  });
});

describe("isValidLat / isValidLng", () => {
  it("accepts valid in-range numbers", () => {
    expect(isValidLat(0)).toBe(true);
    expect(isValidLat(43.6791)).toBe(true);
    expect(isValidLat(-90)).toBe(true);
    expect(isValidLat(90)).toBe(true);
    expect(isValidLng(0)).toBe(true);
    expect(isValidLng(-70.4444)).toBe(true);
    expect(isValidLng(-180)).toBe(true);
    expect(isValidLng(180)).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(isValidLat(91)).toBe(false);
    expect(isValidLat(-91)).toBe(false);
    expect(isValidLng(181)).toBe(false);
    expect(isValidLng(-181)).toBe(false);
  });

  it("rejects NaN, Infinity, and non-number types", () => {
    expect(isValidLat(NaN)).toBe(false);
    expect(isValidLat(Infinity)).toBe(false);
    expect(isValidLat(-Infinity)).toBe(false);
    expect(isValidLat("43" as unknown)).toBe(false);
    expect(isValidLat(null)).toBe(false);
    expect(isValidLat(undefined)).toBe(false);
    expect(isValidLng(NaN)).toBe(false);
    expect(isValidLng("not a number" as unknown)).toBe(false);
  });
});
