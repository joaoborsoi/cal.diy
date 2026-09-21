import { useCallback, useRef, useState } from "react";

import dayjs from "@calcom/dayjs";
import { useBookerTime } from "@calcom/features/bookings/Booker/hooks/useBookerTime";
import { getUsernameList } from "@calcom/features/eventtypes/lib/defaultEvents";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";

import { pickRandomSlotFromPool } from "../lib/pickRandomSlot";

/**
 * How many months forward to search for an available slot before giving up.
 * `getSchedule` already clamps availability to the event type's own booking-window
 * configuration server-side (periodType/periodDays/range -- see slots/util.ts), so
 * this cap doesn't need to know that configuration itself: it's only a safety bound
 * against walking indefinitely for an event with sparse or no availability at all.
 */
const MAX_MONTHS_TO_SEARCH = 12;

type UsePickRandomSlotArgs = {
  username?: string | null;
  eventSlug?: string | null;
  eventId?: number | null;
  duration?: number | null;
  isTeamEvent?: boolean;
  orgSlug?: string | null;
  teamMemberEmail?: string | null;
};

export type UsePickRandomSlotReturnType = ReturnType<typeof usePickRandomSlot>;

/**
 * Searches forward, month by month, for the first month with available slots for
 * the given event, then returns one slot from it at random. Re-calling `pickRandomSlot`
 * (re-roll) excludes the previously picked slot when the known pool has other options,
 * so a re-roll visibly changes something.
 */
export const usePickRandomSlot = ({
  username,
  eventSlug,
  eventId,
  duration,
  isTeamEvent,
  orgSlug,
  teamMemberEmail,
}: UsePickRandomSlotArgs) => {
  const { t } = useLocale();
  const { timezone } = useBookerTime();
  const utils = trpc.useUtils();
  const [isLoading, setIsLoading] = useState(false);
  const [hasNoSlots, setHasNoSlots] = useState(false);
  const previousPickRef = useRef<string | null>(null);

  const pickRandomSlot = useCallback(async (): Promise<string | null> => {
    if (!username || (!eventSlug && eventId == null) || !timezone) {
      return null;
    }

    setIsLoading(true);
    setHasNoSlots(false);

    try {
      for (let monthOffset = 0; monthOffset <= MAX_MONTHS_TO_SEARCH; monthOffset++) {
        const monthDayjs = dayjs().add(monthOffset, "month");
        const result = await utils.viewer.slots.getSchedule.fetch({
          isTeamEvent,
          usernameList: getUsernameList(username),
          ...(eventSlug ? { eventTypeSlug: eventSlug } : { eventTypeId: eventId ?? 0 }),
          startTime: monthDayjs.startOf("month").toISOString(),
          endTime: monthDayjs.endOf("month").toISOString(),
          timeZone: timezone,
          duration: duration ? `${duration}` : undefined,
          orgSlug: orgSlug ?? undefined,
          teamMemberEmail,
        });

        const pool = Object.values(result.slots).flatMap((daySlots) => daySlots.map((slot) => slot.time));
        if (pool.length > 0) {
          const picked = pickRandomSlotFromPool(pool, previousPickRef.current);
          previousPickRef.current = picked;
          return picked;
        }
      }

      setHasNoSlots(true);
      return null;
    } catch {
      showToast(t("unexpected_error_try_again"), "error");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [username, eventSlug, eventId, duration, isTeamEvent, orgSlug, teamMemberEmail, timezone, utils, t]);

  return { pickRandomSlot, isLoading, hasNoSlots };
};
