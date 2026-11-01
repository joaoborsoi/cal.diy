import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import type { Slots } from "@calcom/web/modules/schedules/lib/types";
import { pickRandomSlot } from "../lib/pickRandomSlot";

type Props = {
  slots?: Slots;
  selectedTimeslot: string | null;
  unavailableTimeSlots: string[];
  onSelect: (time: string) => void;
};

export const ChooseForMeButton = ({ slots, selectedTimeslot, unavailableTimeSlots, onSelect }: Props) => {
  const { t } = useLocale();
  const setSelectedDate = useBookerStoreContext((state) => state.setSelectedDate);

  const handleClick = () => {
    const excludeTimes = [...unavailableTimeSlots, ...(selectedTimeslot ? [selectedTimeslot] : [])];
    const picked = pickRandomSlot(slots, { excludeTimes });
    if (!picked) return;
    setSelectedDate({ date: picked.date });
    onSelect(picked.time);
  };

  return (
    <Button type="button" color="secondary" className="w-full justify-center" onClick={handleClick}>
      {t("choose_for_me")}
    </Button>
  );
};
