import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ requireAdminOrManager: vi.fn() }));
vi.mock("@/lib/resend-domains", () => ({
  findVerifiedManagedDomain: vi.fn(), checkDomainVerification: vi.fn(),
}));
import { requireAdminOrManager } from "@/lib/auth";
import { findVerifiedManagedDomain, checkDomainVerification } from "@/lib/resend-domains";
import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdminOrManager).mockResolvedValue({ error: null } as never);
});

describe("domain check before choosing a team", () => {
  it("returns verification for an existing verified domain", async () => {
    vi.mocked(findVerifiedManagedDomain).mockResolvedValue({ name: "mail.example.com", status: "verified" } as never);
    const response = await GET(new NextRequest("http://localhost/api/admin/email-identity/domain-status?domain=mail.example.com"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ domain: "mail.example.com", status: "verified" });
    expect(findVerifiedManagedDomain).toHaveBeenCalledWith("mail.example.com");
  });
  it("rejects unverified domains and lookup failures", async () => {
    vi.mocked(findVerifiedManagedDomain).mockResolvedValue({ error: "Domain not verified" });
    const response = await GET(new NextRequest("http://localhost/api/admin/email-identity/domain-status?domain=mail.example.com"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Domain not verified" });
  });
  it("preserves mailbox email checks including receiving readiness", async () => {
    vi.mocked(checkDomainVerification).mockResolvedValue({ domain: "mail.example.com", status: "verified", receivingEnabled: true });
    const response = await GET(new NextRequest("http://localhost/api/admin/email-identity/domain-status?email=support%40mail.example.com"));
    expect(await response.json()).toMatchObject({ receivingEnabled: true, status: "verified" });
    expect(findVerifiedManagedDomain).not.toHaveBeenCalled();
  });
  it("requires authorization before contacting Resend", async () => {
    vi.mocked(requireAdminOrManager).mockResolvedValue({ error: new Response(null, { status: 403 }) } as never);
    expect((await GET(new NextRequest("http://localhost/api/admin/email-identity/domain-status?domain=mail.example.com"))).status).toBe(403);
    expect(findVerifiedManagedDomain).not.toHaveBeenCalled();
  });
});
