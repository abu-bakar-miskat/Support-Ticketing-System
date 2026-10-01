import { describe, expect, it } from "vitest";
import {
  ALWAYS_ON_FEATURE_KEYS,
  featureTemplateCardText,
  featureTemplateNarrative,
  grantedMarketplaceFeatures,
  isStaleBuiltinFeatureDescription,
} from "./template-features";

describe("grantedMarketplaceFeatures", () => {
  it("treats a missing allowlist as every marketplace feature already on", () => {
    expect(grantedMarketplaceFeatures(null)).toBe("ALL");
    expect(grantedMarketplaceFeatures(undefined)).toBe("ALL");
  });

  it("treats an empty list as no marketplace features", () => {
    expect(grantedMarketplaceFeatures([])).toEqual([]);
  });

  it("keeps only marketplace keys from a stored list", () => {
    expect(grantedMarketplaceFeatures(["reports", "tasks", "timeline", "reports"])).toEqual([
      "reports",
      "timeline",
    ]);
  });
});

describe("featureTemplateNarrative", () => {
  it("gives a built-in template a use case and a feature explanation", () => {
    const narrative = featureTemplateNarrative({
      description: "API keys for this department.",
      features: [{ key: "apiKeys", label: "API keys" }],
    });
    expect(narrative.customDescription).toBeNull();
    expect(narrative.useCases).toEqual([
      expect.objectContaining({ key: "apiKeys", text: expect.stringMatching(/Claude/) }),
    ]);
    expect(narrative.included[0]?.explanation).toEqual(expect.stringMatching(/Read-only/));
    expect(featureTemplateCardText(narrative)).toBe(narrative.useCases[0]?.text);
  });

  it("keeps an author-written description", () => {
    const narrative = featureTemplateNarrative({
      description: "Keys for the billing integration only.",
      features: [{ key: "apiKeys", label: "API keys" }],
    });
    expect(narrative.customDescription).toBe("Keys for the billing integration only.");
    expect(featureTemplateCardText(narrative)).toBe("Keys for the billing integration only.");
  });

  it("refreshes only the old one-line seed", () => {
    expect(isStaleBuiltinFeatureDescription("apiKeys", "API keys for this department.", "Read-only keys.")).toBe(true);
    expect(isStaleBuiltinFeatureDescription("apiKeys", "Keys for the billing integration only.", "Read-only keys.")).toBe(false);
    expect(isStaleBuiltinFeatureDescription("support", "API keys for this department.", "Read-only keys.")).toBe(false);
  });
});

describe("always-on features", () => {
  it("does not include the optional marketplace features", () => {
    expect(ALWAYS_ON_FEATURE_KEYS).not.toContain("reports");
    expect(ALWAYS_ON_FEATURE_KEYS).not.toContain("timeline");
    expect(ALWAYS_ON_FEATURE_KEYS).toContain("tasks");
    expect(ALWAYS_ON_FEATURE_KEYS).not.toContain("board");
    expect(ALWAYS_ON_FEATURE_KEYS).not.toContain("activity");
    expect(ALWAYS_ON_FEATURE_KEYS).not.toContain("slaPolicies");
    expect(ALWAYS_ON_FEATURE_KEYS).not.toContain("supportForm");
  });
});
