import { describe, it, expect } from "vitest";
import { bucketContributions, dayKey } from "./contribution-buckets";

describe("dayKey", () => {
  it("returns the UTC calendar day when no timezone is given", () => {
    expect(dayKey(new Date("2026-07-24T23:30:00Z"))).toBe("2026-07-24");
  });

  it("buckets into the local day for a timezone", () => {
    // 23:30 UTC is already the next calendar day in Dhaka (+06:00).
    expect(dayKey(new Date("2026-07-24T23:30:00Z"), "Asia/Dhaka")).toBe("2026-07-25");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(dayKey(new Date("2026-07-24T10:00:00Z"), "Not/AZone")).toBe("2026-07-24");
  });
});

describe("bucketContributions", () => {
  it("counts commits, PRs opened and PRs merged on their days", () => {
    const result = bucketContributions({
      commits: [
        { sha: "a", at: new Date("2026-07-20T09:00:00Z") },
        { sha: "b", at: new Date("2026-07-20T15:00:00Z") },
      ],
      prsOpened: [new Date("2026-07-20T12:00:00Z")],
      prsMerged: [new Date("2026-07-21T08:00:00Z")],
    });
    expect(result).toEqual({ "2026-07-20": 3, "2026-07-21": 1 });
  });

  it("de-duplicates commits sharing a SHA (one per referenced ticket)", () => {
    const result = bucketContributions({
      commits: [
        { sha: "dup", at: new Date("2026-07-20T09:00:00Z") },
        { sha: "dup", at: new Date("2026-07-20T09:00:05Z") },
        { sha: "dup", at: new Date("2026-07-20T09:00:10Z") },
      ],
      prsOpened: [],
      prsMerged: [],
    });
    expect(result).toEqual({ "2026-07-20": 1 });
  });

  it("attributes a de-duplicated commit to its earliest recorded day", () => {
    const result = bucketContributions({
      commits: [
        { sha: "x", at: new Date("2026-07-21T02:00:00Z") },
        { sha: "x", at: new Date("2026-07-20T22:00:00Z") },
      ],
      prsOpened: [],
      prsMerged: [],
    });
    expect(result).toEqual({ "2026-07-20": 1 });
  });

  it("returns an empty map when there is no activity", () => {
    expect(bucketContributions({ commits: [], prsOpened: [], prsMerged: [] })).toEqual({});
  });
});
