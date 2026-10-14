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

  it("ignores quarantined inbound when deriving the waiting state", () => {
    expect(deriveSubStatus([msg({ direction: "inbound", status: "quarantined" })])).toBe(
      null,
    );
  });

  it("labels a mailbox ticket only after its conversation starts", () => {
    const origin = msg({ id: "origin", direction: "inbound" });
    const receipt = msg({ direction: "inbound", status: "system" });
    const quarantined = msg({ direction: "inbound", status: "quarantined", createdAt: "2026-01-01T13:00:00Z" });
    const agentReply = msg({ direction: "outbound", createdAt: "2026-01-01T10:00:00Z" });
    const customerReply = msg({ direction: "inbound", createdAt: "2026-01-01T11:00:00Z" });
    expect(deriveSubStatus([origin, receipt, quarantined], "origin")).toBeNull();
    expect(subStatusLabel(deriveSubStatus([origin, agentReply, receipt, quarantined], "origin"))).toBe("Waiting for customer");
    expect(subStatusLabel(deriveSubStatus([origin, agentReply, customerReply, quarantined], "origin"))).toBe("Waiting for assignee");
  });
});

describe("subStatusLabel", () => {
  it("maps sub-statuses to UI labels", () => {
    expect(subStatusLabel("WAITING_FOR_SUPPORT")).toBe("Waiting for assignee");
    expect(subStatusLabel("WAITING_FOR_CUSTOMER")).toBe("Waiting for customer");
    expect(subStatusLabel(null)).toBeNull();
  });
});
