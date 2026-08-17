import { describe, it, expect, vi, afterEach } from "vitest";

// customer-conversation is server-only and reads INBOUND_DOMAIN from the env at
// module load, so we (re)import it per-domain after stubbing.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));

async function load(domain: string) {
  vi.resetModules();
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_INBOUND_DOMAIN", domain);
  return import("@/lib/customer-conversation");
}

const DOMAIN = "reply.pengroup.com";

afterEach(() => vi.unstubAllEnvs());

describe("generateReplyToken", () => {
  it("produces a 48-char hex token", async () => {
    const { generateReplyToken } = await load(DOMAIN);
    expect(generateReplyToken()).toMatch(/^[a-f0-9]{48}$/);
  });

  it("produces unique tokens", async () => {
    const { generateReplyToken } = await load(DOMAIN);
    const tokens = new Set(Array.from({ length: 100 }, () => generateReplyToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("buildReplyToAddress / extractReplyToken round-trip", () => {
  it("extracts the token it built", async () => {
    const { generateReplyToken, buildReplyToAddress, extractReplyToken } =
      await load(DOMAIN);
    const token = generateReplyToken();
    const addr = buildReplyToAddress(token);
    expect(addr).toBe(`reply-${token}@${DOMAIN}`);
    expect(extractReplyToken(addr)).toBe(token);
  });

  it("extracts from an angle-bracket display-name form", async () => {
    const { generateReplyToken, buildReplyToAddress, extractReplyToken } =
      await load(DOMAIN);
    const token = generateReplyToken();
    const addr = `"PEN Support" <${buildReplyToAddress(token)}>`;
    expect(extractReplyToken(addr)).toBe(token);
  });

  it("is case-insensitive on the domain", async () => {
    const { generateReplyToken, extractReplyToken } = await load(DOMAIN);
    const token = generateReplyToken();
    expect(extractReplyToken(`reply-${token}@REPLY.PenGroup.com`)).toBe(token);
  });

  it("rejects a different domain", async () => {
    const { generateReplyToken, extractReplyToken } = await load(DOMAIN);
    const token = generateReplyToken();
    expect(extractReplyToken(`reply-${token}@evil.com`)).toBeNull();
  });

  it("rejects an address without the reply- prefix", async () => {
    const { extractReplyToken } = await load(DOMAIN);
    expect(extractReplyToken(`support@${DOMAIN}`)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    const { extractReplyToken } = await load(DOMAIN);
    expect(extractReplyToken(`reply-not-a-real-token@${DOMAIN}`)).toBeNull();
  });

  it("returns null when no inbound domain is configured", async () => {
    const { extractReplyToken } = await load("");
    expect(extractReplyToken("reply-abc@whatever.com")).toBeNull();
  });
});
