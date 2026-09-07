import { describe, expect, it } from "vitest";

import { isOutsideBusinessHours } from "./isOutsideBusinessHours";

// America/Sao_Paulo is a stable UTC-3 offset (Brazil has no DST).
describe("isOutsideBusinessHours", () => {
  it("returns false for a weekday slot inside 09:00–18:00 (BRT)", () => {
    // Monday 2026-09-07, 10:00 BRT === 13:00 UTC
    expect(isOutsideBusinessHours("2026-09-07T13:00:00.000Z")).toBe(false);
  });

  it("treats 09:00 BRT as inside business hours (start inclusive)", () => {
    // Monday 2026-09-07, 09:00 BRT === 12:00 UTC
    expect(isOutsideBusinessHours("2026-09-07T12:00:00.000Z")).toBe(false);
  });

  it("treats 18:00 BRT as outside business hours (end exclusive)", () => {
    // Monday 2026-09-07, 18:00 BRT === 21:00 UTC
    expect(isOutsideBusinessHours("2026-09-07T21:00:00.000Z")).toBe(true);
  });

  it("returns true before 09:00 BRT on a weekday", () => {
    // Monday 2026-09-07, 08:30 BRT === 11:30 UTC
    expect(isOutsideBusinessHours("2026-09-07T11:30:00.000Z")).toBe(true);
  });

  it("returns true for any Saturday slot", () => {
    // Saturday 2026-09-05, 10:00 BRT === 13:00 UTC
    expect(isOutsideBusinessHours("2026-09-05T13:00:00.000Z")).toBe(true);
  });

  it("returns true for any Sunday slot", () => {
    // Sunday 2026-09-06, 14:00 BRT === 17:00 UTC
    expect(isOutsideBusinessHours("2026-09-06T17:00:00.000Z")).toBe(true);
  });

  it("uses the reference timezone, not UTC (late-evening UTC that is still afternoon in BRT)", () => {
    // Monday 2026-09-07, 22:00 UTC === 19:00 BRT -> outside
    expect(isOutsideBusinessHours("2026-09-07T22:00:00.000Z")).toBe(true);
    // Monday 2026-09-07, 20:00 UTC === 17:00 BRT -> inside
    expect(isOutsideBusinessHours("2026-09-07T20:00:00.000Z")).toBe(false);
  });

  it("ignores holidays (a national holiday on a weekday is still business hours)", () => {
    // 2026-09-07 is Brazil's Independence Day and a Monday; policy ignores holidays.
    expect(isOutsideBusinessHours("2026-09-07T14:00:00.000Z")).toBe(false);
  });

  it("returns false for empty or invalid input", () => {
    expect(isOutsideBusinessHours(null)).toBe(false);
    expect(isOutsideBusinessHours(undefined)).toBe(false);
    expect(isOutsideBusinessHours("")).toBe(false);
    expect(isOutsideBusinessHours("not-a-date")).toBe(false);
  });
});
