import type { Slots } from "@calcom/web/modules/schedules/lib/types";

type SlotItem = Slots[string][number];

export type PickRandomSlotOptions = {
  maxDays?: number;
  random?: () => number;
  today?: string;
};

export type PickedSlot = { date: string; slot: SlotItem };

const isSelectableSlot = (slot: SlotItem) => !(slot?.away && !slot.toUser && !slot.showNotePublicly);

/**
 * Picks a uniformly random slot among the first `maxDays` days (from today on) that have availability.
 */
export const pickRandomSlot = (
  slots: Slots | undefined,
  { maxDays = 5, random = Math.random, today }: PickRandomSlotOptions = {}
): PickedSlot | null => {
  if (!slots) return null;
  const todayKey = today ?? new Date().toISOString().slice(0, 10);

  const days = Object.keys(slots)
    .filter((date) => date >= todayKey && slots[date].some(isSelectableSlot))
    .sort()
    .slice(0, maxDays);

  const candidates: PickedSlot[] = [];
  for (const date of days) {
    for (const slot of slots[date]) {
      if (isSelectableSlot(slot)) candidates.push({ date, slot });
    }
  }
  if (candidates.length === 0) return null;

  const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
  return candidates[index];
};
