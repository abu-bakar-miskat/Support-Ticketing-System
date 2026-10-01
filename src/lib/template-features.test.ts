import { describe, expect, it } from "vitest";
import { ALWAYS_ON_FEATURE_KEYS, grantedMarketplaceFeatures } from "./template-features";

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
