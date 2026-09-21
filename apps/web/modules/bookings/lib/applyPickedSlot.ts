import dayjs from "@calcom/dayjs";

type ApplyPickedSlotArgs = {
  pickedSlot: string;
  currentMonth: string | null;
  setMonth: (month: string | null) => void;
  onAvailableTimeSlotSelect: (time: string) => void;
};

/**
 * Applies a randomly-picked slot to the booker store the same way a manual click
 * would. This exists because changing the displayed month resets `selectedTimeslot`
 * in the booker store (see store.ts's setMonth) -- so when the random pick lands in
 * a month other than the one currently shown, the month must be switched *before*
 * the slot is selected, or the month change silently clobbers the pick.
 */
export function applyPickedSlot({
  pickedSlot,
  currentMonth,
  setMonth,
  onAvailableTimeSlotSelect,
}: ApplyPickedSlotArgs): void {
  const pickedMonth = dayjs(pickedSlot).format("YYYY-MM");
  if (pickedMonth !== currentMonth) {
    setMonth(pickedMonth);
  }
  onAvailableTimeSlotSelect(pickedSlot);
}
