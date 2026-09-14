import { useState } from "react";

import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import type { BookerEvent } from "@calcom/features/bookings/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";

import type { useScheduleForEventReturnType } from "~/schedules/hooks/useEvent";

import { pickRandomSlot } from "../lib/pickRandomSlot";

type ChooseForMeButtonProps = {
  schedule?: useScheduleForEventReturnType;
  event: {
    data?: Pick<BookerEvent, "seatsPerTimeSlot" | "schedulingType"> | null;
  };
  unavailableTimeSlots: string[];
  selectedTimeslot: string | null;
  onAvailableTimeSlotSelect: (time: string) => void;
};

/**
 * Lets the visitor skip browsing the calendar: picks a random bookable slot
 * from what's already loaded and feeds it through the same selection path a
 * manual slot click uses, so confirm-step/skip-confirm-step/seats behavior
 * stays consistent. Relabels to "pick another" once a timeslot is selected,
 * so the same button also serves as the reroll action.
 *
 * Only renders for single-host event types — round-robin/collective/managed
 * event types tie slot availability to host assignment, which this feature
 * doesn't account for yet.
 */
export const ChooseForMeButton = ({
  schedule,
  event,
  unavailableTimeSlots,
  selectedTimeslot,
  onAvailableTimeSlotSelect,
}: ChooseForMeButtonProps) => {
  const { t } = useLocale();
  const setSelectedDate = useBookerStoreContext((state) => state.setSelectedDate);
  const [showEmptyPoolHint, setShowEmptyPoolHint] = useState(false);

  if (event.data?.schedulingType) {
    return null;
  }

  const handleClick = () => {
    const picked = pickRandomSlot({
      slots: schedule?.data?.slots,
      unavailableTimeSlots,
      seatsPerTimeSlot: event.data?.seatsPerTimeSlot,
    });

    if (!picked) {
      setShowEmptyPoolHint(true);
      return;
    }

    setShowEmptyPoolHint(false);
    setSelectedDate({ date: picked.date });
    onAvailableTimeSlotSelect(picked.time);
  };

  return (
    <div className="px-5 py-3">
      <Button
        color="secondary"
        StartIcon="shuffle"
        size="sm"
        onClick={handleClick}
        className="w-full justify-center">
        {selectedTimeslot ? t("choose_for_me_pick_another") : t("choose_for_me")}
      </Button>
      {showEmptyPoolHint && (
        <p className="mt-2 text-sm text-subtle">{t("choose_for_me_no_slots_loaded")}</p>
      )}
    </div>
  );
};
