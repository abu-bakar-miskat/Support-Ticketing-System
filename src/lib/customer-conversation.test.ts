import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateReplyToken } from "@/lib/customer-conversation";

describe("generateReplyToken", () => {
  it("produces a 48-char hex token", () => {
    expect(generateReplyToken()).toMatch(/^[a-f0-9]{48}$/);
  });

  it("produces unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateReplyToken()));
    expect(tokens.size).toBe(100);
  });
});
