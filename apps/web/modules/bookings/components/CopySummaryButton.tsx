import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";

export interface CopySummaryButtonProps {
  /** Pre-built plain-text summary (title, date, time, timezone and location). */
  summary: string;
  className?: string;
}

/**
 * "Copy summary" button rendered on the booking confirmation screen. Copies the
 * booking summary to the clipboard and surfaces a toast for both success and failure.
 */
export function CopySummaryButton({ summary, className }: CopySummaryButtonProps) {
  const { t } = useLocale();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      showToast(t("summary_copied"), "success");
    } catch {
      showToast(t("something_went_wrong"), "error");
    }
  };

  return (
    <Button
      type="button"
      color="minimal"
      StartIcon="copy"
      className={className}
      data-testid="copy-summary-button"
      onClick={handleCopy}>
      {t("copy_summary")}
    </Button>
  );
}
