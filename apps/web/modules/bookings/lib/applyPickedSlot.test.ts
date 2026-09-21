import { describe, expect, it, vi } from "vitest";

import { applyPickedSlot } from "./applyPickedSlot";

describe("applyPickedSlot", () => {
  it("selects the slot directly when it falls in the currently displayed month", () => {
    const calls: string[] = [];
    const setMonth = vi.fn(() => calls.push("setMonth"));
    const onAvailableTimeSlotSelect = vi.fn(() => calls.push("select"));

    applyPickedSlot({
      pickedSlot: "2026-02-05T10:00:00.000Z",
      currentMonth: "2026-02",
      setMonth,
      onAvailableTimeSlotSelect,
    });

    expect(setMonth).not.toHaveBeenCalled();
    expect(onAvailableTimeSlotSelect).toHaveBeenCalledWith("2026-02-05T10:00:00.000Z");
    expect(calls).toEqual(["select"]);
  });

  it("switches the month before selecting the slot when the pick falls in a different month", () => {
    // Regression guard: store.ts's setMonth resets selectedTimeslot as a side effect,
    // so setMonth must run *before* onAvailableTimeSlotSelect -- otherwise the month
    // change would silently clear the slot we just picked.
    const calls: string[] = [];
    const setMonth = vi.fn(() => calls.push("setMonth"));
    const onAvailableTimeSlotSelect = vi.fn(() => calls.push("select"));

    applyPickedSlot({
      pickedSlot: "2026-04-10T14:00:00.000Z",
      currentMonth: "2026-02",
      setMonth,
      onAvailableTimeSlotSelect,
    });

    expect(setMonth).toHaveBeenCalledWith("2026-04");
    expect(onAvailableTimeSlotSelect).toHaveBeenCalledWith("2026-04-10T14:00:00.000Z");
    expect(calls).toEqual(["setMonth", "select"]);
  });

  it("switches the month when there is no month currently displayed", () => {
    const setMonth = vi.fn();
    const onAvailableTimeSlotSelect = vi.fn();

    applyPickedSlot({
      pickedSlot: "2026-04-10T14:00:00.000Z",
      currentMonth: null,
      setMonth,
      onAvailableTimeSlotSelect,
    });

    expect(setMonth).toHaveBeenCalledWith("2026-04");
  });
});
