import type { Slots } from "~/schedules/lib/types";

type PickRandomSlotArgs = {
  /** The schedule's slots, keyed by date (YYYY-MM-DD), as already loaded client-side. */
  slots: Slots | undefined;
  /** Times that look available but shouldn't be offered (e.g. failed a quick availability re-check). */
  unavailableTimeSlots?: string[];
  /** When the event has a seats limit, slots at or over capacity are excluded. */
  seatsPerTimeSlot?: number | null;
  /** Injectable for deterministic tests; defaults to Math.random. */
  random?: () => number;
};

export type RandomSlotPick = {
  date: string;
  time: string;
};

/**
 * Picks one random bookable slot out of whatever has already been fetched into
 * `slots`. Returns null when nothing in the pool is currently bookable, so the
 * caller can tell the visitor to browse the calendar instead of fetching more.
 */
export function pickRandomSlot({
  slots,
  unavailableTimeSlots = [],
  seatsPerTimeSlot,
  random = Math.random,
}: PickRandomSlotArgs): RandomSlotPick | null {
  if (!slots) return null;

  const pool: RandomSlotPick[] = [];

  for (const date of Object.keys(slots)) {
    for (const slot of slots[date]) {
      if (slot.away) continue;
      if (unavailableTimeSlots.includes(slot.time)) continue;
      if (seatsPerTimeSlot && slot.attendees && slot.attendees >= seatsPerTimeSlot) continue;
      pool.push({ date, time: slot.time });
    }
  }

  if (pool.length === 0) return null;

  const index = Math.floor(random() * pool.length);
  return pool[index];
}
