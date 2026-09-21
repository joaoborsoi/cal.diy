import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";

type PickForMeButtonProps = {
  onClick: () => void;
  isLoading: boolean;
  hasNoSlots: boolean;
};

/**
 * "Pick for me" -- lets a booker with no time preference randomly select an
 * available slot instead of scanning the calendar. Disabled once a search has
 * come back with no availability at all, so it doesn't sit there spinning forever.
 */
export function PickForMeButton({ onClick, isLoading, hasNoSlots }: PickForMeButtonProps) {
  const { t } = useLocale();

  return (
    <Button
      color="secondary"
      size="sm"
      StartIcon="shuffle"
      loading={isLoading}
      disabled={hasNoSlots}
      tooltip={hasNoSlots ? t("pick_for_me_no_slots") : undefined}
      onClick={onClick}
      data-testid="pick-for-me-button">
      {t("pick_for_me")}
    </Button>
  );
}
