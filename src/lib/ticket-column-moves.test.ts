import { describe, it, expect } from "vitest";
import {
  REOPENED_LABEL,
  shouldReopenOnCustomerReply,
  reopenTargetColumn,
  escalateTargetColumn,
  applyReopenedLabel,
  clearReopenedLabelOnReply,
} from "./ticket-column-moves";
import type { StatusType } from "./board-columns";

const cols = [
  { id: "todo", statusType: "OPEN" as StatusType, order: 0 },
  { id: "doing", statusType: "OPEN" as StatusType, order: 1 },
  { id: "hold", statusType: "PAUSED" as StatusType, order: 2 },
  { id: "esc", statusType: "ESCALATED" as StatusType, order: 3 },
  { id: "done", statusType: "RESOLVED" as StatusType, order: 4 },
];

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

describe("reopenTargetColumn / escalateTargetColumn", () => {
  it("reopen targets the first OPEN column by order", () => {
    expect(reopenTargetColumn(cols)?.id).toBe("todo");
  });
  it("escalate targets the first ESCALATED column", () => {
    expect(escalateTargetColumn(cols)?.id).toBe("esc");
  });
  it("returns null when the board lacks the target type", () => {
    const noEsc = cols.filter((c) => c.statusType !== "ESCALATED");
    expect(escalateTargetColumn(noEsc)).toBeNull();
    const noOpen = cols.filter((c) => c.statusType !== "OPEN");
    expect(reopenTargetColumn(noOpen)).toBeNull();
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
