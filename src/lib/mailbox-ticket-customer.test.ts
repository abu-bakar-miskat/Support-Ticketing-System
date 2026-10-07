import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { activityLog: { findFirst: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { getMailboxTicketCustomer } from "./mailbox-ticket-customer";

const findOrigin = vi.mocked(prisma.activityLog.findFirst);
beforeEach(() => vi.clearAllMocks());

describe("getMailboxTicketCustomer", () => {
  it("recovers the sender of a legacy mailbox ticket without messages", async () => {
    findOrigin.mockResolvedValue({ metadata: {
      source: "email", fromEmail: "customer@example.com", fromName: "Customer",
    } } as never);
    expect(await getMailboxTicketCustomer("legacy-ticket")).toEqual({
      fromEmail: "customer@example.com", fromName: "Customer",
    });
    expect(findOrigin).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketId: "legacy-ticket", action: "TICKET_CREATED" },
    }));
  });

  it.each([
    null,
    { source: "manual", fromEmail: "staff@example.com" },
    { source: "email", fromEmail: "invalid" },
    { source: "email" },
  ])("does not invent a customer from invalid or non-email origins: %j", async (metadata) => {
    findOrigin.mockResolvedValue({ metadata } as never);
    expect(await getMailboxTicketCustomer("ticket")).toBeNull();
  });
});
