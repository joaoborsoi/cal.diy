import { describe, expect, it } from "vitest";
import type { Slot } from "~/schedules/lib/types";
import { getPickableSlots, pickRandomSlot } from "./pickRandomSlot";

const slot = (time: string, extra: Partial<Slot> = {}): Slot => ({ time, ...extra }) as Slot;

describe("getPickableSlots", () => {
  it("excludes out-of-office, unavailable, full and current-booking slots", () => {
    const slots = [
      slot("2026-10-01T09:00:00.000Z"),
      slot("2026-10-01T10:00:00.000Z", { away: true }),
      slot("2026-10-01T11:00:00.000Z"),
      slot("2026-10-01T12:00:00.000Z", { attendees: 2 }),
      slot("2026-10-01T13:00:00.000Z", { attendees: 1 }),
      slot("2026-10-01T14:00:00.000Z", { bookingUid: "current" }),
    ];

    const result = getPickableSlots({
      slots,
      unavailableTimeSlots: ["2026-10-01T11:00:00.000Z"],
      seatsPerTimeSlot: 2,
      currentBookingUid: "current",
    });

    expect(result.map((s) => s.time)).toEqual(["2026-10-01T09:00:00.000Z", "2026-10-01T13:00:00.000Z"]);
  });

  it("ignores attendee counts when the event is not seated", () => {
    const result = getPickableSlots({ slots: [slot("2026-10-01T09:00:00.000Z", { attendees: 5 })] });
    expect(result).toHaveLength(1);
  });
});

describe("pickRandomSlot", () => {
  const slots = [slot("a"), slot("b"), slot("c")];

  it("returns null when there are no pickable slots", () => {
    expect(pickRandomSlot({ slots: [] })).toBeNull();
    expect(pickRandomSlot({ slots: [slot("a", { away: true })] })).toBeNull();
    expect(pickRandomSlot({ slots, unavailableTimeSlots: ["a", "b", "c"] })).toBeNull();
  });

  it("uses the random source to choose among pickable slots", () => {
    expect(pickRandomSlot({ slots, random: () => 0 })?.time).toBe("a");
    expect(pickRandomSlot({ slots, random: () => 0.5 })?.time).toBe("b");
    expect(pickRandomSlot({ slots, random: () => 0.99 })?.time).toBe("c");
  });

  it("never returns an out-of-range slot even if random returns 1", () => {
    expect(pickRandomSlot({ slots, random: () => 1 })?.time).toBe("c");
  });

  it("only picks from pickable slots", () => {
    expect(pickRandomSlot({ slots, unavailableTimeSlots: ["a"], random: () => 0 })?.time).toBe("b");
  });
});
