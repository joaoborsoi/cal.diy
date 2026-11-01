import { describe, expect, it } from "vitest";
import { pickRandomSlot } from "./pickRandomSlot";

const day = (d: string, hours: string[]) => hours.map((h) => ({ time: `${d}T${h}:00:00Z` }));

const slots = {
  "2024-01-01": day("2024-01-01", ["09", "10"]),
  "2024-01-02": [],
  "2024-01-03": day("2024-01-03", ["09"]),
  "2024-01-04": day("2024-01-04", ["09"]),
  "2024-01-05": day("2024-01-05", ["09"]),
  "2024-01-06": day("2024-01-06", ["09"]),
  "2024-01-07": day("2024-01-07", ["09"]),
  "2024-01-08": day("2024-01-08", ["09"]),
};

describe("pickRandomSlot", () => {
  it("returns null for undefined or empty slots", () => {
    expect(pickRandomSlot(undefined)).toBeNull();
    expect(pickRandomSlot({})).toBeNull();
  });

  it("only considers the first 5 days with slots, skipping empty days", () => {
    const last = pickRandomSlot(slots, { random: () => 0.999 });
    expect(last).toEqual({ date: "2024-01-06", time: "2024-01-06T09:00:00Z" });
    const first = pickRandomSlot(slots, { random: () => 0 });
    expect(first).toEqual({ date: "2024-01-01", time: "2024-01-01T09:00:00Z" });
  });

  it("ignores away slots without toUser", () => {
    const s = {
      "2024-01-01": [{ time: "2024-01-01T09:00:00Z", away: true }],
      "2024-01-02": day("2024-01-02", ["09"]),
    } as never;
    expect(pickRandomSlot(s, { random: () => 0 })?.date).toBe("2024-01-02");
  });

  it("excludes times when an alternative exists", () => {
    const s = { "2024-01-01": day("2024-01-01", ["09", "10"]) };
    const res = pickRandomSlot(s, { excludeTimes: ["2024-01-01T09:00:00Z"], random: () => 0 });
    expect(res?.time).toBe("2024-01-01T10:00:00Z");
  });

  it("returns the only slot even if excluded", () => {
    const s = { "2024-01-01": day("2024-01-01", ["09"]) };
    const res = pickRandomSlot(s, { excludeTimes: ["2024-01-01T09:00:00Z"] });
    expect(res?.time).toBe("2024-01-01T09:00:00Z");
  });
});
