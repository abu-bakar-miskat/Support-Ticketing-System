import { describe, expect, it } from "vitest";
import { shouldForceLogoutFromStatus, mailboxArrivalFromRecent } from "./notifications-realtime";

describe("shouldForceLogoutFromStatus", () => {
  it.each([401, 403])("logs out for an explicit auth rejection (%i)", (status) => {
    expect(shouldForceLogoutFromStatus(status)).toBe(true);
  });

  it.each([200, 429, 500, 502, 503, 504])(
    "keeps the session for a non-auth response (%i)",
    (status) => {
      expect(shouldForceLogoutFromStatus(status)).toBe(false);
    },
  );
});

describe("mailboxArrivalFromRecent", () => {
  const since = Date.parse("2026-10-12T08:00:00Z");
  const item = { id: "mailbox-arrival:ticket:manager", type: "intake_manager_alert", unread: true, createdAt: "2026-10-12T08:01:00Z", ticket: { dbId: "ticket", humanId: "WEB-32", title: "Customer request" } };
  it("creates a linked toast for a new persisted mailbox arrival", () => {
    expect(mailboxArrivalFromRecent(item, since)).toEqual({ id: item.id, type: item.type, title: "New shared mailbox ticket WEB-32", body: "Customer request", ticketDbId: "ticket" });
  });
  it.each([
    { createdAt: "2026-10-12T07:59:00Z" }, { unread: false }, { id: "ordinary" }, { ticket: null }, { createdAt: "invalid" },
  ])("does not replay historical/read/unrelated alerts: %j", (override) => {
    expect(mailboxArrivalFromRecent({ ...item, ...override }, since)).toBeNull();
  });
});
