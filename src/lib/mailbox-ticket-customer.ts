import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";

/** Older mailbox tickets can lack their first message. The creation audit is
 * still a durable record of the original sender; never infer it from staff. */
export async function getMailboxTicketCustomer(ticketId: string) {
  const origin = await prisma.activityLog.findFirst({
    where: { ticketId, action: "TICKET_CREATED" },
    orderBy: { createdAt: "asc" },
    select: { metadata: true },
  });
  const parsed = z.object({
    source: z.literal("email"),
    fromEmail: z.email(),
    fromName: z.string().optional(),
  }).safeParse(origin?.metadata);
  if (!parsed.success) return null;
  return {
    fromEmail: parsed.data.fromEmail,
    fromName: parsed.data.fromName || parsed.data.fromEmail,
  };
}
