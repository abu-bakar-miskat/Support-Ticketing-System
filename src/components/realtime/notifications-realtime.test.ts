import { describe, expect, it } from "vitest";
import { shouldForceLogoutFromStatus } from "./notifications-realtime";

describe("shouldForceLogoutFromStatus", () => {
  it.each([401, 403])("logs out for an explicit auth rejection (%i)", (status) => {
    expect(shouldForceLogoutFromStatus(status)).toBe(true);
  });

  it.each([200, 429, 500, 502, 503, 504])(
    "keeps the session for a non-auth response (%i)",
    (status) => {
      expect(shouldForceLogoutFromStatus(status)).toBe(false);
    },
  );
});
