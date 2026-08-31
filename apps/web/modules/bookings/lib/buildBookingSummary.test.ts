import { describe, expect, it } from "vitest";

import dayjs from "@calcom/dayjs";

import { buildBookingSummary } from "./buildBookingSummary";

const t = (key: string) =>
  (({ what: "What", when: "When", timezone: "Timezone", where: "Where" }) as Record<string, string>)[key] ??
  key;

// A fixed instant so the assertions don't depend on the machine timezone.
const startTime = dayjs.utc("2025-09-03T14:00:00Z");

const baseArgs = {
  title: "30 Min Meeting",
  startTime,
  durationInMinutes: 30,
  timeZone: "America/New_York",
  is24h: false,
  locale: "en-US",
  location: "https://meet.google.com/abc-defg-hij",
  t,
};

describe("buildBookingSummary", () => {
  it("includes title, date, time range, timezone and location", () => {
    expect(buildBookingSummary(baseArgs)).toBe(
      [
        "What: 30 Min Meeting",
        "When: Wednesday, September 3, 2025, 10:00 AM - 10:30 AM",
        "Timezone: Eastern Daylight Time",
        "Where: https://meet.google.com/abc-defg-hij",
      ].join("\n")
    );
  });

  it("localizes the date/time into the provided timezone", () => {
    const summary = buildBookingSummary({ ...baseArgs, timeZone: "Europe/Lisbon" });

    expect(summary).toContain("When: Wednesday, September 3, 2025, 3:00 PM - 3:30 PM");
    expect(summary).toContain("Timezone: Western European Summer Time");
  });

  it("formats time using a 24-hour clock when is24h is true", () => {
    const summary = buildBookingSummary({ ...baseArgs, is24h: true });

    expect(summary).toContain("When: Wednesday, September 3, 2025, 10:00 - 10:30");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("omits the location line when location is %s", (_label, location) => {
    const summary = buildBookingSummary({ ...baseArgs, location });

    expect(summary).not.toContain("Where:");
    expect(summary.split("\n")).toHaveLength(3);
  });

  it("trims the location value", () => {
    const summary = buildBookingSummary({ ...baseArgs, location: "  Meeting Room B  " });

    expect(summary).toContain("Where: Meeting Room B");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["zero", 0],
    ["negative", -15],
  ])("shows a single start time (no range) when the duration is %s", (_label, durationInMinutes) => {
    const summary = buildBookingSummary({ ...baseArgs, durationInMinutes });

    expect(summary).toContain("When: Wednesday, September 3, 2025, 10:00 AM");
    expect(summary).not.toContain(" - 10:30 AM");
  });

  it("always emits the what/when/timezone lines in order", () => {
    const lines = buildBookingSummary({ ...baseArgs, location: null }).split("\n");

    expect(lines[0].startsWith("What: ")).toBe(true);
    expect(lines[1].startsWith("When: ")).toBe(true);
    expect(lines[2].startsWith("Timezone: ")).toBe(true);
  });
});
