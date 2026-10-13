import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({ profile: { id: "admin" }, error: null }),
  assertDepartmentAdmin: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/email-config", () => ({ saveDepartmentEmailSenders: vi.fn() }));
vi.mock("@/lib/resend-domains", () => ({ findVerifiedManagedDomain: vi.fn() }));
import { findVerifiedManagedDomain } from "@/lib/resend-domains";
import { saveDepartmentEmailSenders } from "@/lib/email-config";
import { PUT } from "./route";

const request = () => new NextRequest("http://localhost/api/admin/email-identity/senders", {
  method: "PUT", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ departmentId: "dept", senders: [{ name: "Support", email: "support@mail.example.com" }] }),
});
beforeEach(() => vi.clearAllMocks());
describe("sender verification gate", () => {
  it("rejects unverified domains without saving sender addresses", async () => {
    vi.mocked(findVerifiedManagedDomain).mockResolvedValue({ error: "Verify the domain in Resend first" });
    const response = await PUT(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Verify the domain in Resend first" });
    expect(saveDepartmentEmailSenders).not.toHaveBeenCalled();
  });
  it("allows sender addresses on existing verified domains", async () => {
    vi.mocked(findVerifiedManagedDomain).mockResolvedValue({ status: "verified" } as never);
    vi.mocked(saveDepartmentEmailSenders).mockResolvedValue([]);
    expect((await PUT(request())).status).toBe(200);
    expect(findVerifiedManagedDomain).toHaveBeenCalledWith("mail.example.com");
    expect(saveDepartmentEmailSenders).toHaveBeenCalledOnce();
  });
});
