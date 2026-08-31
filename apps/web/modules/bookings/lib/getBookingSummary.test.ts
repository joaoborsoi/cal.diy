import { describe, expect, it } from "vitest";
import { buildBookingSummary } from "./getBookingSummary";

const labels = {
  title: "What",
  date: "When",
  time: "Time",
  timeZone: "Timezone",
  location: "Where",
};

describe("buildBookingSummary", () => {
  it("includes title, date, time, timezone and location as labeled lines", () => {
    const summary = buildBookingSummary(
      {
        title: "30 Min Meeting between Alice and Bob",
        date: "Monday, September 1, 2026",
        time: "10:00 AM",
        timeZone: "Central European Summer Time",
        location: "Zoom",
      },
      labels
    );

    expect(summary).toBe(
      [
        "What: 30 Min Meeting between Alice and Bob",
        "When: Monday, September 1, 2026",
        "Time: 10:00 AM",
        "Timezone: Central European Summer Time",
        "Where: Zoom",
      ].join("\n")
    );
  });

  it("omits the location line when location is missing", () => {
    const summary = buildBookingSummary(
      {
        title: "Sync",
        date: "Monday, September 1, 2026",
        time: "10:00 AM",
        timeZone: "UTC",
        location: null,
      },
      labels
    );

    expect(summary).toBe(
      ["What: Sync", "When: Monday, September 1, 2026", "Time: 10:00 AM", "Timezone: UTC"].join("\n")
    );
    expect(summary).not.toContain("Where");
  });

  it("omits the location line when location is blank/whitespace", () => {
    const summary = buildBookingSummary(
      { title: "Sync", date: "d", time: "t", timeZone: "UTC", location: "   " },
      labels
    );

    expect(summary.split("\n")).toHaveLength(4);
  });

  it("trims surrounding whitespace from the location value", () => {
    const summary = buildBookingSummary(
      { title: "Sync", date: "d", time: "t", timeZone: "UTC", location: "  Office  " },
      labels
    );

    expect(summary).toContain("Where: Office");
  });

  it("preserves field order regardless of input order", () => {
    const summary = buildBookingSummary(
      { location: "Zoom", timeZone: "UTC", time: "t", date: "d", title: "Sync" },
      labels
    );

    expect(summary.split("\n").map((line) => line.split(":")[0])).toEqual([
      "What",
      "When",
      "Time",
      "Timezone",
      "Where",
    ]);
  });
});
