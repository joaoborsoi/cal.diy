import { describe, it, expect } from "vitest";

import type { Slots } from "~/schedules/lib/types";

import { pickRandomSlot } from "./pickRandomSlot";

function buildSlots(overrides: Slots): Slots {
  return overrides;
}

describe("pickRandomSlot", () => {
  it("returns null when there are no slots at all", () => {
    expect(pickRandomSlot({ slots: undefined })).toBeNull();
    expect(pickRandomSlot({ slots: buildSlots({}) })).toBeNull();
  });

  it("picks the only bookable slot when the pool has exactly one", () => {
    const slots = buildSlots({
      "2024-01-01": [{ time: "2024-01-01T10:00:00Z" }],
    });

    expect(pickRandomSlot({ slots, random: () => 0 })).toEqual({
      date: "2024-01-01",
      time: "2024-01-01T10:00:00Z",
    });
  });

  it("uses the injected random function to select from the full pool", () => {
    const slots = buildSlots({
      "2024-01-01": [{ time: "2024-01-01T10:00:00Z" }, { time: "2024-01-01T11:00:00Z" }],
      "2024-01-02": [{ time: "2024-01-02T10:00:00Z" }],
    });

    // Pool order follows Object.entries/array order: 10:00, 11:00, then 2024-01-02 10:00.
    expect(pickRandomSlot({ slots, random: () => 0 })).toEqual({
      date: "2024-01-01",
      time: "2024-01-01T10:00:00Z",
    });
    expect(pickRandomSlot({ slots, random: () => 0.99 })).toEqual({
      date: "2024-01-02",
      time: "2024-01-02T10:00:00Z",
    });
  });

  it("excludes slots flagged as away", () => {
    const slots = buildSlots({
      "2024-01-01": [
        { time: "2024-01-01T10:00:00Z", away: true },
        { time: "2024-01-01T11:00:00Z" },
      ],
    });

    expect(pickRandomSlot({ slots, random: () => 0 })).toEqual({
      date: "2024-01-01",
      time: "2024-01-01T11:00:00Z",
    });
  });

  it("excludes times present in unavailableTimeSlots", () => {
    const slots = buildSlots({
      "2024-01-01": [{ time: "2024-01-01T10:00:00Z" }, { time: "2024-01-01T11:00:00Z" }],
    });

    expect(
      pickRandomSlot({
        slots,
        unavailableTimeSlots: ["2024-01-01T10:00:00Z"],
        random: () => 0,
      })
    ).toEqual({ date: "2024-01-01", time: "2024-01-01T11:00:00Z" });
  });

  it("excludes seated slots that are at or over capacity", () => {
    const slots = buildSlots({
      "2024-01-01": [
        { time: "2024-01-01T10:00:00Z", attendees: 2 },
        { time: "2024-01-01T11:00:00Z", attendees: 1 },
      ],
    });

    expect(
      pickRandomSlot({
        slots,
        seatsPerTimeSlot: 2,
        random: () => 0,
      })
    ).toEqual({ date: "2024-01-01", time: "2024-01-01T11:00:00Z" });
  });

  it("returns null when every slot is filtered out", () => {
    const slots = buildSlots({
      "2024-01-01": [{ time: "2024-01-01T10:00:00Z", away: true }],
    });

    expect(pickRandomSlot({ slots, random: () => 0 })).toBeNull();
  });
});
