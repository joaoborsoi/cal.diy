export type BookingSummaryFields = {
  title: string;
  date: string;
  time: string;
  timeZone: string;
  location?: string | null;
};

export type BookingSummaryLabels = {
  title: string;
  date: string;
  time: string;
  timeZone: string;
  location: string;
};

/**
 * Builds a plain-text, copy-to-clipboard friendly summary of a booking.
 * Kept pure (no i18n/DOM access) so it can be unit tested easily — callers
 * pass already-translated labels and already-formatted values.
 */
export function buildBookingSummary(fields: BookingSummaryFields, labels: BookingSummaryLabels): string {
  const lines = [
    `${labels.title}: ${fields.title}`,
    `${labels.date}: ${fields.date}`,
    `${labels.time}: ${fields.time}`,
    `${labels.timeZone}: ${fields.timeZone}`,
  ];

  const location = fields.location?.trim();
  if (location) {
    lines.push(`${labels.location}: ${location}`);
  }

  return lines.join("\n");
}
