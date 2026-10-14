import { describe, expect, it } from "vitest";
import { auditTargetName, presentAuditPayload, type AuditLookups } from "./audit-display";

const lookups: AuditLookups = {
  departments: new Map([["dept-1", "Support"]]),
  templates: new Map([["tpl-1", "Workflows & statuses"]]),
  featureRequests: new Map([["req-1", "template:tpl-1"]]),
};

describe("audit display names", () => {
  it("shows the template and department instead of their ids", () => {
    expect(
      auditTargetName(
        { targetType: "Template", targetId: "tpl-1", before: null, after: null },
        lookups,
      ),
    ).toBe("Workflows & statuses");

    expect(
      presentAuditPayload(
        { departmentId: "dept-1", featureKeys: ["workflows"], templateName: "Workflows & statuses" },
        lookups,
      ),
    ).toEqual({
      departmentId: "Support",
      featureKeys: "Workflows & statuses",
    });
  });

  it("names a feature request from the template it asked for", () => {
    expect(
      auditTargetName(
        {
          targetType: "FeatureRequest",
          targetId: "req-1",
          before: null,
          after: { featureKey: "template:tpl-1" },
        },
        lookups,
      ),
    ).toBe("Workflows & statuses");
  });
});
