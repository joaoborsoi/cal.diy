import { describe, expect, it } from "vitest";

import type { Slots } from "@calcom/web/modules/schedules/lib/types";

import { pickRandomSlot } from "./pickRandomSlot";

const today = "2030-01-01";
const day = (n: number) => `2030-01-${String(n).padStart(2, "0")}`;
const slot = (time: string) => ({ time }) as Slots[string][number];

const buildSlots = (days: number[], perDay = 2): Slots =>
  Object.fromEntries(
    days.map((d) => [day(d), Array.from({ length: perDay }, (_, i) => slot(`${day(d)}T1${i}:00:00Z`))])
  );

describe("pickRandomSlot", () => {
  it("returns null for undefined, empty or only-away slots", () => {
    expect(pickRandomSlot(undefined, { today })).toBeNull();
    expect(pickRandomSlot({}, { today })).toBeNull();
    expect(pickRandomSlot({ [day(2)]: [] }, { today })).toBeNull();
    const away = { time: "x", away: true } as Slots[string][number];
    expect(pickRandomSlot({ [day(2)]: [away] }, { today })).toBeNull();
  });

  it("only considers the first 5 days with slots", () => {
    const slots = buildSlots([1, 2, 3, 4, 5, 6, 7]);
    const picked = pickRandomSlot(slots, { today, random: () => 0.999 });
    expect(picked?.date).toBe(day(5));
    expect(picked?.slot.time).toBe(`${day(5)}T11:00:00Z`);
  });

  it("skips empty days and past days", () => {
    const slots: Slots = { "2029-12-30": [slot("past")], [day(2)]: [], ...buildSlots([3]) };
    const picked = pickRandomSlot(slots, { today, random: () => 0 });
    expect(picked?.date).toBe(day(3));
  });

  it("picks uniformly over slots, not days", () => {
    const slots = buildSlots([1, 2, 3, 4, 5]);
    expect(pickRandomSlot(slots, { today, random: () => 0 })?.slot.time).toBe(`${day(1)}T10:00:00Z`);
    expect(pickRandomSlot(slots, { today, random: () => 0.45 })?.slot.time).toBe(`${day(3)}T10:00:00Z`);
  });

  it("returns a date consistent with the slot", () => {
    const slots = buildSlots([1, 2, 3]);
    const picked = pickRandomSlot(slots, { today, random: () => 0.4 });
    expect(picked?.slot.time.startsWith(picked?.date as string)).toBe(true);
  });
});
