import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: { activityLog: { findMany: vi.fn() } } }));
import { prisma } from "@/lib/db";
import { mailboxOriginRouting, loadMailboxOrigins, isMailboxReceipt } from "./mailbox-ticket-origin";

describe("description-only mailbox origins", () => {
  it("retains routing information without duplicating any body", () => {
    expect(mailboxOriginRouting({
      text: "Help", html: "<p>Help</p>", quotedText: "old reply",
      to: ["support@example.com"], envelopeTo: ["support@example.com"],
      mailboxConnectionId: "mailbox-1", resendEmailId: "provider-1",
      headers: { "message-id": "original@example.com" },
    })).toEqual({
      to: ["support@example.com"], envelopeTo: ["support@example.com"],
      mailboxConnectionId: "mailbox-1", resendEmailId: "provider-1",
      headers: { "message-id": "original@example.com" },
    });
  });

  it("renders received mail from the ticket description while leaving legacy rows to their existing loader", async () => {
    const ticket = { id: "ticket", description: "<p>Help</p>" };
    vi.mocked(prisma.activityLog.findMany).mockResolvedValue([
      { id: "origin", ticket, metadata: { source: "email", fromEmail: "customer@example.com", providerMessageId: "original@example.com" } },
      { id: "legacy", ticket, metadata: { source: "email", fromEmail: "customer@example.com" } },
    ] as never);
    const origins = await loadMailboxOrigins({ departmentId: "department" });
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ id: "origin", bodyHtml: "<p>Help</p>", fromEmail: "customer@example.com" });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ticket: { subDepartment: { departmentId: "department" } } }),
    }));
  });
});

it("hides only internal receipt rows, preserving ordinary system/public messages", () => {
  expect(isMailboxReceipt({ status: "system", rawPayload: { mailboxReceipt: true } })).toBe(true)
  expect(isMailboxReceipt({ status: "trusted", rawPayload: { mailboxReceipt: true } })).toBe(false)
  expect(isMailboxReceipt({ status: "system", rawPayload: null })).toBe(false)
})
