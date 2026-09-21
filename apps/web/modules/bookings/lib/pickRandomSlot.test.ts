import { describe, expect, it, vi } from "vitest";

import { pickRandomSlotFromPool } from "./pickRandomSlot";

describe("pickRandomSlotFromPool", () => {
  it("returns null for an empty pool", () => {
    expect(pickRandomSlotFromPool([])).toBeNull();
  });

  it("returns the only slot for a single-item pool", () => {
    expect(pickRandomSlotFromPool(["2026-01-01T10:00:00.000Z"])).toBe("2026-01-01T10:00:00.000Z");
  });

  it("returns the only slot even when it matches exclude, since there's nothing else to pick", () => {
    expect(pickRandomSlotFromPool(["2026-01-01T10:00:00.000Z"], "2026-01-01T10:00:00.000Z")).toBe(
      "2026-01-01T10:00:00.000Z"
    );
  });

  it("never returns the excluded slot when the pool has other options", () => {
    const pool = ["a", "b"];
    for (let i = 0; i < 20; i++) {
      expect(pickRandomSlotFromPool(pool, "a")).toBe("b");
    }
  });

  it("picks a value from the pool based on Math.random", () => {
    const pool = ["a", "b", "c"];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(pickRandomSlotFromPool(pool)).toBe("b");
    randomSpy.mockRestore();
  });
});
