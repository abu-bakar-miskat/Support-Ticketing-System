/**
 * Invite lifetime rules, shared by every invite-creation path (department and
 * tenant invites) and the reminder sweep so the numbers never drift apart.
 */

/** An invite token is valid for exactly 24 hours (1 day) from generation. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Once an unaccepted invite reaches this age, the reminder sweep sends a single
 * reminder email (guarded by `reminderSentAt`). 12h < 24h leaves ~12h of
 * runway between the reminder and expiry.
 */
export const INVITE_REMINDER_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * Human-readable absolute expiry, e.g. "Thu, 17 Sep 2026, 14:30 UTC". Rendered
 * in invite + reminder emails so the recipient always sees the exact deadline
 * (acceptance criterion: the reminder must clearly state the expiration time).
 * UTC keeps it unambiguous across recipient time zones.
 */
export function formatInviteExpiry(expiresAt: Date): string {
  return expiresAt.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}
