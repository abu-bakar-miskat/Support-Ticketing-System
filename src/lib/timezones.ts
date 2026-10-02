import type { SearchableSelectOption } from "@/components/ui/searchable-select";

/** Small SSR-safe fallback; browsers replace this with their full IANA list. */
export const TIMEZONES: SearchableSelectOption[] = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "Europe / London (GMT / BST)" },
  { value: "Europe/Paris", label: "Europe / Paris" },
  { value: "America/New_York", label: "America / New York" },
  { value: "America/Chicago", label: "America / Chicago" },
  { value: "Asia/Singapore", label: "Asia / Singapore" },
  { value: "Asia/Dhaka", label: "Asia / Dhaka" },
];

function displayPart(value: string): string {
  return value.replaceAll("_", " ");
}

export function formatTimezoneLabel(timezone: string): string {
  if (timezone === "UTC") return "UTC";
  return timezone.split("/").map(displayPart).join(" / ");
}

export function getTimezoneOffsetLabel(timezone: string, at = new Date()): string {
  try {
    const offset = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value;
    return offset === "GMT" ? "GMT+0" : (offset ?? "");
  } catch {
    return "";
  }
}

/**
 * Build options from the runtime's IANA catalogue. This stays dependency-free
 * and automatically follows timezone-database updates shipped by the browser.
 */
export function getTimezoneOptions(at = new Date()): SearchableSelectOption[] {
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
  ).supportedValuesOf;
  const supported = supportedValuesOf?.("timeZone") ?? TIMEZONES.map((zone) => zone.value);
  const values = ["UTC", ...supported.filter((timezone) => timezone !== "UTC")];

  return values.map((timezone) => {
    const offset = getTimezoneOffsetLabel(timezone, at);
    const city = displayPart(timezone.split("/").at(-1) ?? timezone);
    return {
      value: timezone,
      label: formatTimezoneLabel(timezone),
      description: [offset, timezone].filter(Boolean).join(" · "),
      keywords: [city, timezone.replaceAll("_", " "), offset],
    };
  });
}

export function formatTimeInTimezone(timezone: string, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(at);
  } catch {
    return "Unavailable";
  }
}
