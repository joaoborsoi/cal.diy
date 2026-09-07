import dayjs from "@calcom/dayjs";

/**
 * Commercial (business) hours policy.
 *
 * Source of truth: repo root CLAUDE.md → "Horário comercial e fusos horários".
 * - Reference timezone: America/Sao_Paulo (BRT). Brazil no longer observes DST,
 *   so this is a stable UTC-3 offset. Any instant is converted into this timezone
 *   before being compared against the window.
 * - Window: 09:00–18:00 (start inclusive, end exclusive).
 * - Business days: Monday–Friday.
 * - Holidays are intentionally ignored — only weekends count as non-working days.
 */
export const BUSINESS_HOURS_TIMEZONE = "America/Sao_Paulo";
export const BUSINESS_HOURS_START_HOUR = 9;
export const BUSINESS_HOURS_END_HOUR = 18;

/**
 * Returns true when a booking that starts at `time` falls outside the commercial
 * window once converted to the reference timezone (weekend, before 09:00, or at
 * / after 18:00). Returns false for empty or unparseable input so callers can
 * treat "unknown" as "no warning".
 */
export function isOutsideBusinessHours(time: string | number | Date | null | undefined): boolean {
  if (!time) return false;

  const parsed = dayjs(time);
  if (!parsed.isValid()) return false;

  const local = parsed.tz(BUSINESS_HOURS_TIMEZONE);

  const weekday = local.day(); // 0 = Sunday … 6 = Saturday
  if (weekday === 0 || weekday === 6) return true;

  const minutesIntoDay = local.hour() * 60 + local.minute();
  return (
    minutesIntoDay < BUSINESS_HOURS_START_HOUR * 60 || minutesIntoDay >= BUSINESS_HOURS_END_HOUR * 60
  );
}
