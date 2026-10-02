import { describe, expect, it } from "vitest";
import {
  formatTimeInTimezone,
  formatTimezoneLabel,
  getTimezoneOffsetLabel,
  getTimezoneOptions,
} from "./timezones";

const SUMMER = new Date("2026-07-01T12:00:00.000Z");

describe("timezone options", () => {
  it("builds human-readable searchable options from valid IANA identifiers", () => {
    const options = getTimezoneOptions(SUMMER);
    const london = options.find((option) => option.value === "Europe/London");

    expect(options[0]?.value).toBe("UTC");
    expect(london).toMatchObject({
      label: "Europe / London",
      description: "GMT+1 · Europe/London",
    });
    expect(london?.keywords).toContain("London");
  });

  it("formats labels, offsets, and local time without changing the stored ID", () => {
    expect(formatTimezoneLabel("America/Argentina/Buenos_Aires")).toBe(
      "America / Argentina / Buenos Aires",
    );
    expect(getTimezoneOffsetLabel("Asia/Dhaka", SUMMER)).toBe("GMT+6");
    expect(formatTimeInTimezone("Asia/Dhaka", SUMMER)).toContain("06:00 pm");
  });

  it("handles a legacy invalid timezone safely", () => {
    expect(getTimezoneOffsetLabel("Not/A_Zone", SUMMER)).toBe("");
    expect(formatTimeInTimezone("Not/A_Zone", SUMMER)).toBe("Unavailable");
  });
});
