/**
 * Values must be valid IANA timezone IDs — they feed Intl.DateTimeFormat in
 * ROTA availability checks, where an invalid ID throws and breaks intake.
 */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: "Europe/London", label: "Europe / London" },
  { value: "Europe/Paris", label: "Europe / Paris" },
  { value: "America/New_York", label: "America / New York" },
  { value: "America/Chicago", label: "America / Chicago" },
  { value: "Asia/Singapore", label: "Asia / Singapore" },
  { value: "Asia/Dhaka", label: "Asia / Dhaka" },
];
