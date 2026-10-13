import { beforeEach, describe, expect, it, vi } from "vitest";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { domains = { list }; } }));
vi.stubEnv("RESEND_API_KEY", "test-key");
const { findVerifiedManagedDomain, checkDomainVerification } = await import("./resend-domains");

const domain = (status: string, id = "existing") => ({ id, name: "mail.example.com", status,
  capabilities: { sending: "enabled", receiving: "enabled" } });

beforeEach(() => vi.resetAllMocks());

describe("read-only Resend verification", () => {
  it.each(["pending", "not_started", "failed", "partially_verified", "partially_failed"])("rejects %s", async (status) => {
    list.mockResolvedValue({ data: { data: [domain(status)], has_more: false } });
    expect(await findVerifiedManagedDomain("mail.example.com")).toHaveProperty("error");
  });
  it("rejects missing domains", async () => {
    list.mockResolvedValue({ data: { data: [], has_more: false } });
    expect(await findVerifiedManagedDomain("mail.example.com")).toHaveProperty("error");
  });
  it("accepts only an exact verified domain, including across pages", async () => {
    list.mockResolvedValueOnce({ data: { data: [domain("pending", "cursor")], has_more: true } })
      .mockResolvedValueOnce({ data: { data: [domain("verified")], has_more: false } });
    expect(await findVerifiedManagedDomain(" MAIL.EXAMPLE.COM ")).toMatchObject({ id: "existing", status: "verified" });
    expect(list).toHaveBeenLastCalledWith({ limit: 100, after: "cursor" });
  });
  it("rejects a parent domain when only a subdomain is verified", async () => {
    list.mockResolvedValue({ data: { data: [domain("verified")], has_more: false } });
    expect(await findVerifiedManagedDomain("example.com")).toHaveProperty("error");
  });
  it("fails closed when Resend returns an API error", async () => {
    list.mockResolvedValue({ error: { message: "Unavailable" } });
    expect(await findVerifiedManagedDomain("mail.example.com")).toEqual({ error: "Unavailable" });
    expect(await checkDomainVerification("support@mail.example.com")).toMatchObject({ status: "unknown", receivingEnabled: false });
  });
  it("fails closed on network failure", async () => {
    list.mockRejectedValue(new Error("Network unavailable"));
    expect(await findVerifiedManagedDomain("mail.example.com")).toHaveProperty("error");
  });
  it("rejects malformed domains before contacting Resend", async () => {
    expect(await findVerifiedManagedDomain("-invalid.example.com")).toHaveProperty("error");
    expect(list).not.toHaveBeenCalled();
  });
});
