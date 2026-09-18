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
  });

  it("requires assign_agent to pick a concrete agentId", () => {
    expect(isRuleActions([{ type: "assign_agent", params: { agentId: "u1" } }])).toBeNull();
    expect(isRuleActions([{ type: "assign_agent", params: {} }])).toMatch(/agentId is required/);
    expect(isRuleActions([{ type: "assign_agent", params: { agentId: "  " } }])).toMatch(
      /agentId is required/,
    );
  });

  it("requires assign_group to pick a concrete sub-department", () => {
    expect(
      isRuleActions([{ type: "assign_group", params: { subDepartmentId: "sd1" } }]),
    ).toBeNull();
    expect(isRuleActions([{ type: "assign_group", params: {} }])).toMatch(
      /subDepartmentId is required/,
    );
  });

  it("exposes the Prisma TicketPriority enum values", () => {
    expect(VALID_RULE_PRIORITIES).toEqual(Object.values(TicketPriority));
  });
});
