import type { Dayjs } from "@calcom/dayjs";
import { formatToLocalizedDate, formatToLocalizedTime, formatToLocalizedTimezone } from "@calcom/lib/dayjs";

type TFunction = (key: string) => string;

export interface BuildBookingSummaryArgs {
  /** Event title as shown in the "What" row of the confirmation screen. */
  title: string;
  /** Booking start time. */
  startTime: Dayjs;
  /** Duration in minutes. When provided (and positive) the summary shows a "start - end" range. */
  durationInMinutes?: number | null;
  /** IANA timezone used to localize the date/time (e.g. "Europe/Lisbon"). */
  timeZone: string;
  /** Whether to format the time using a 24-hour clock. */
  is24h: boolean;
  /** BCP-47 locale used to localize the date/time. Falls back to the runtime locale when omitted. */
  locale?: string;
  /** Location string as shown in the "Where" row. Omitted from the summary when empty. */
  location?: string | null;
  /** Translation function. */
  t: TFunction;
}

/**
 * Builds the plain-text summary copied to the clipboard by the "Copy summary"
 * button on the booking confirmation screen. It always includes the title, date,
 * time and timezone, and appends the location when one is available.
 */
export function buildBookingSummary({
  title,
  startTime,
  durationInMinutes,
  timeZone,
  is24h,
  locale,
  location,
  t,
}: BuildBookingSummaryArgs): string {
  const formattedDate = formatToLocalizedDate(startTime, locale, "full", timeZone);

  const formattedStartTime = formatToLocalizedTime({
    date: startTime,
    locale,
    hour12: !is24h,
    timeZone,
  });

  const endTime =
    typeof durationInMinutes === "number" && durationInMinutes > 0
      ? startTime.add(durationInMinutes, "minute")
      : null;
  const formattedTime = endTime
    ? `${formattedStartTime} - ${formatToLocalizedTime({
        date: endTime,
        locale,
        hour12: !is24h,
        timeZone,
      })}`
    : formattedStartTime;

  let formattedTimeZone = timeZone;
  try {
    formattedTimeZone = formatToLocalizedTimezone(startTime, locale, timeZone) ?? timeZone;
  } catch {
    // Intl throws on unknown timezones - fall back to the raw identifier.
    formattedTimeZone = timeZone;
  }

  const lines = [
    `${t("what")}: ${title}`,
    `${t("when")}: ${formattedDate}, ${formattedTime}`,
    `${t("timezone")}: ${formattedTimeZone}`,
  ];

  const trimmedLocation = location?.trim();
  if (trimmedLocation) {
    lines.push(`${t("where")}: ${trimmedLocation}`);
  }

  return lines.join("\n");
}
