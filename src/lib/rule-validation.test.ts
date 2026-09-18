import { describe, expect, it } from "vitest";
import { isRuleActions, VALID_RULE_PRIORITIES } from "@/lib/rule-validation";
import { TicketPriority } from "@/generated/prisma/enums";

describe("isRuleActions", () => {
  it("accepts set_priority with a TicketPriority enum value", () => {
    for (const priority of VALID_RULE_PRIORITIES) {
      expect(isRuleActions([{ type: "set_priority", params: { priority } }])).toBeNull();
    }
  });

  it("rejects set_priority with missing or free-text priority", () => {
    expect(isRuleActions([{ type: "set_priority", params: {} }])).toMatch(/TicketPriority|priority must be/);
    expect(isRuleActions([{ type: "set_priority" }])).toMatch(/priority must be/);
    expect(isRuleActions([{ type: "set_priority", params: { priority: "asap" } }])).toMatch(
      /priority must be/,
    );
    expect(isRuleActions([{ type: "set_priority", params: { priority: "high" } }])).toMatch(
      /priority must be/,
    );
  });

  it("still allows other actions without priority params", () => {
    expect(isRuleActions([{ type: "set_tag", params: { tag: "vip" } }])).toBeNull();
    expect(isRuleActions([{ type: "assign_agent", params: { agentId: "u1" } }])).toBeNull();
  });

  it("exposes the Prisma TicketPriority enum values", () => {
    expect(VALID_RULE_PRIORITIES).toEqual(Object.values(TicketPriority));
  });
});
