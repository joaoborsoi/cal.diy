import type { Slot } from "~/schedules/lib/types";

type PickRandomSlotParams = {
  slots: Slot[];
  unavailableTimeSlots?: string[];
  seatsPerTimeSlot?: number | null;
  /** Slots belonging to this booking can't be picked (e.g. when rescheduling a seated booking). */
  currentBookingUid?: string;
  random?: () => number;
};

/**
 * Returns the slots that the booker could actually click on: not out-of-office,
 * not marked unavailable (e.g. reserved by someone else) and not fully booked.
 */
export const getPickableSlots = ({
  slots,
  unavailableTimeSlots = [],
  seatsPerTimeSlot,
  currentBookingUid,
}: Omit<PickRandomSlotParams, "random">): Slot[] =>
  slots.filter((slot) => {
    if (slot.away) return false;
    if (unavailableTimeSlots.includes(slot.time)) return false;
    if (seatsPerTimeSlot && slot.attendees && slot.attendees >= seatsPerTimeSlot) return false;
    if (currentBookingUid && slot.bookingUid === currentBookingUid) return false;
    return true;
  });

/**
 * Randomly picks one of the pickable slots, or returns null when there is none.
 */
export const pickRandomSlot = ({ random = Math.random, ...params }: PickRandomSlotParams): Slot | null => {
  const pickable = getPickableSlots(params);
  if (pickable.length === 0) return null;
  const index = Math.min(Math.floor(random() * pickable.length), pickable.length - 1);
  return pickable[index];
};
