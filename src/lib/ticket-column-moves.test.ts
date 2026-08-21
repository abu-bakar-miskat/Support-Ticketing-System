import { describe, it, expect } from "vitest";
import {
  REOPENED_LABEL,
  shouldReopenOnCustomerReply,
  applyReopenedLabel,
  clearReopenedLabelOnReply,
} from "./ticket-column-moves";

describe("shouldReopenOnCustomerReply — BD-09", () => {
  it("reopens on a customer (inbound) reply to a RESOLVED ticket", () => {
    expect(shouldReopenOnCustomerReply("RESOLVED", "inbound")).toBe(true);
  });
  it("does not reopen on an agent (outbound) reply", () => {
    expect(shouldReopenOnCustomerReply("RESOLVED", "outbound")).toBe(false);
  });
  it("does not reopen a non-resolved ticket", () => {
    expect(shouldReopenOnCustomerReply("OPEN", "inbound")).toBe(false);
    expect(shouldReopenOnCustomerReply("PAUSED", "inbound")).toBe(false);
    expect(shouldReopenOnCustomerReply(null, "inbound")).toBe(false);
  });
});

describe("Reopened label — OQ-05", () => {
  it("applies the label idempotently", () => {
    expect(applyReopenedLabel(["Bug"])).toEqual(["Bug", REOPENED_LABEL]);
    expect(applyReopenedLabel(["Bug", REOPENED_LABEL])).toEqual(["Bug", REOPENED_LABEL]);
  });
  it("auto-clears on an agent (outbound) reply", () => {
    expect(clearReopenedLabelOnReply(["Bug", REOPENED_LABEL], "outbound")).toEqual(["Bug"]);
  });
  it("leaves the label in place on a customer (inbound) reply", () => {
    expect(clearReopenedLabelOnReply(["Bug", REOPENED_LABEL], "inbound")).toEqual([
      "Bug",
      REOPENED_LABEL,
    ]);
  });
  it("is a no-op when the label isn't present", () => {
    expect(clearReopenedLabelOnReply(["Bug"], "outbound")).toEqual(["Bug"]);
  });
});
