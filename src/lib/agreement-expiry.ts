/**
 * Shared, pure helpers for surfacing tenant-agreement renewal/expiry status
 * (BRD SA-06). Used both by the Super-Admin UI (to flag agreements approaching
 * their end date) and by the reminder sweep's notification copy, so the two
 * stay consistent.
 */

export type RenewalStatus =
  | "ACTIVE"
  | "PENDING_RENEWAL"
  | "RENEWED"
  | "EXPIRED"
  | "CANCELLED";

export const RENEWAL_STATUS_LABEL: Record<RenewalStatus, string> = {
  ACTIVE: "Active",
  PENDING_RENEWAL: "Pending renewal",
  RENEWED: "Renewed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export function renewalStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return RENEWAL_STATUS_LABEL[status as RenewalStatus] ?? status;
}

/** How many days ahead of the end date an agreement starts being flagged as
 *  "approaching" in the UI. Independent of the per-agreement reminder schedule
 *  (which can be finer-grained); this is the visual heads-up window. */
export const AGREEMENT_EXPIRY_FLAG_DAYS = 30;

export type AgreementExpiryState = "expired" | "expiring_soon" | "ok";

export type AgreementExpiryFlag = {
  /** Whole days until the end date; negative once the end date has passed. */
  daysUntil: number;
  state: AgreementExpiryState;
  /** Short human label, e.g. "Expires in 12 days" / "Expires today" /
   *  "Expired 3 days ago". Empty string when there's nothing to flag. */
  label: string;
};

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

/**
 * Classify an agreement's proximity to expiry.
 *
 *  - RENEWED / CANCELLED are settled — never flagged.
 *  - EXPIRED, or any agreement whose end date is in the past, is flagged expired.
 *  - Otherwise, within `thresholdDays` of the end date → expiring_soon.
 *  - Else → ok (no flag).
 */
export function getAgreementExpiry(
  endDate: Date | string,
  renewalStatus: string | null | undefined,
  now: Date = new Date(),
  thresholdDays: number = AGREEMENT_EXPIRY_FLAG_DAYS,
): AgreementExpiryFlag {
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  const daysUntil = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  // Settled agreements carry no upcoming-expiry flag (SA-06 acceptance:
  // renewed/expired agreements must not surface as "upcoming").
  if (renewalStatus === "RENEWED" || renewalStatus === "CANCELLED") {
    return { daysUntil, state: "ok", label: "" };
  }

  if (renewalStatus === "EXPIRED" || daysUntil < 0) {
    return {
      daysUntil,
      state: "expired",
      label: daysUntil < 0 ? `Expired ${pluralDays(Math.abs(daysUntil))} ago` : "Expired",
    };
  }

  if (daysUntil <= thresholdDays) {
    return {
      daysUntil,
      state: "expiring_soon",
      label: daysUntil === 0 ? "Expires today" : `Expires in ${pluralDays(daysUntil)}`,
    };
  }

  return { daysUntil, state: "ok", label: "" };
}
