import type { Slots } from "@calcom/web/modules/schedules/lib/types";

type PickOptions = {
  maxDays?: number;
  excludeTimes?: string[];
  random?: () => number;
};

export type PickedSlot = { date: string; time: string };

export const pickRandomSlot = (
  slots: Slots | undefined,
  { maxDays = 5, excludeTimes = [], random = Math.random }: PickOptions = {}
): PickedSlot | null => {
  if (!slots) return null;

  const candidates: PickedSlot[] = [];
  const days = Object.keys(slots).sort();
  let daysUsed = 0;

  for (const date of days) {
    if (daysUsed >= maxDays) break;
    const valid = (slots[date] ?? []).filter(
      (slot) => !(slot?.away && !slot.toUser && !slot.showNotePublicly)
    );
    if (valid.length === 0) continue;
    daysUsed++;
    for (const slot of valid) candidates.push({ date, time: slot.time });
  }

  if (candidates.length === 0) return null;

  const alternatives = candidates.filter((c) => !excludeTimes.includes(c.time));
  const pool = alternatives.length > 0 ? alternatives : candidates;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
};
