import { describe, it, expect } from "vitest";
import { deriveSubStatus, subStatusLabel, type ConversationMessage } from "./ticket-sub-status";

const msg = (over: Partial<ConversationMessage> & { direction: "inbound" | "outbound" }): ConversationMessage => ({
  status: "trusted",
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("deriveSubStatus — BD-07", () => {
  it("returns null when there are no messages", () => {
    expect(deriveSubStatus([])).toBeNull();
  });

  it("last public message from the customer (inbound) → WAITING_FOR_SUPPORT", () => {
    expect(
      deriveSubStatus([
        msg({ direction: "outbound", createdAt: "2026-01-01T10:00:00Z" }),
        msg({ direction: "inbound", createdAt: "2026-01-01T11:00:00Z" }),
      ]),
    ).toBe("WAITING_FOR_SUPPORT");
  });

  it("last public message from an agent (outbound) → WAITING_FOR_CUSTOMER", () => {
    expect(
      deriveSubStatus([
        msg({ direction: "inbound", createdAt: "2026-01-01T10:00:00Z" }),
        msg({ direction: "outbound", createdAt: "2026-01-01T11:00:00Z" }),
      ]),
    ).toBe("WAITING_FOR_CUSTOMER");
  });

  it("is order-independent (uses latest createdAt, not array order)", () => {
    expect(
      deriveSubStatus([
        msg({ direction: "inbound", createdAt: "2026-01-01T11:00:00Z" }),
        msg({ direction: "outbound", createdAt: "2026-01-01T09:00:00Z" }),
      ]),
    ).toBe("WAITING_FOR_SUPPORT");
  });

  it("ignores system messages when deriving", () => {
    // Latest message is a system message; the real last public one is the agent reply.
    expect(
      deriveSubStatus([
        msg({ direction: "outbound", createdAt: "2026-01-01T11:00:00Z" }),
        msg({ direction: "inbound", status: "system", createdAt: "2026-01-01T12:00:00Z" }),
      ]),
    ).toBe("WAITING_FOR_CUSTOMER");
  });

  it("returns null when the only messages are system messages", () => {
    expect(deriveSubStatus([msg({ direction: "inbound", status: "system" })])).toBeNull();
  });

  it("treats quarantined inbound as a customer message", () => {
    expect(deriveSubStatus([msg({ direction: "inbound", status: "quarantined" })])).toBe(
      "WAITING_FOR_SUPPORT",
    );
  });
});

describe("subStatusLabel", () => {
  it("maps sub-statuses to UI labels", () => {
    expect(subStatusLabel("WAITING_FOR_SUPPORT")).toBe("Waiting for support");
    expect(subStatusLabel("WAITING_FOR_CUSTOMER")).toBe("Waiting for customer");
    expect(subStatusLabel(null)).toBeNull();
  });
});
