import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** Store only envelope/threading metadata. The email body belongs to description. */
export function mailboxOriginRouting(raw: unknown) {
  if (!raw || typeof raw !== "object") return {};
  const payload = raw as Record<string, unknown>;
  return Object.fromEntries(
    ["to", "envelopeTo", "mailboxConnectionId", "resendEmailId", "headers"]
      .filter((key) => payload[key] != null)
      .map((key) => [key, payload[key]]),
  ) as Record<string, string | string[] | Record<string, string>>;
}

export function mailboxOriginIdsWhere(ids: string[]): Prisma.ActivityLogWhereInput {
  return {
    action: "TICKET_CREATED",
    AND: [
      { metadata: { path: ["source"], equals: "email" } },
      { OR: ids.map((id) => ({ metadata: { path: ["providerMessageId"], equals: id } })) },
    ],
  };
}

export async function getMailboxOriginMessageId(ticketId: string): Promise<string | null> {
  const origin = await prisma.activityLog.findFirst({
    where: { ticketId, action: "TICKET_CREATED" },
    orderBy: { createdAt: "asc" },
    select: { metadata: true },
  });
  const metadata = origin?.metadata as Record<string, unknown> | null;
  return metadata?.source === "email" && typeof metadata.providerMessageId === "string"
    ? metadata.providerMessageId : null;
}

/** Received-mail panels read the description, never a synthetic conversation row. */
export async function loadMailboxOrigins(scope: { departmentId: string } | { subDepartmentId: string }) {
  const origins = await prisma.activityLog.findMany({
    where: {
      action: "TICKET_CREATED",
      metadata: { path: ["source"], equals: "email" },
      ticket: "departmentId" in scope
        ? { subDepartment: { departmentId: scope.departmentId } }
        : { subDepartmentId: scope.subDepartmentId },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, createdAt: true, metadata: true,
      ticket: { select: {
        id: true, title: true, description: true, ticketNumber: true,
        subDepartmentId: true, subDepartment: { select: { prefix: true } },
      } },
    },
  });
  return origins.flatMap((origin) => {
    const metadata = origin.metadata as Record<string, unknown> | null;
    // Legacy origins still have a conversation row; their existing listing handles them.
    if (typeof metadata?.providerMessageId !== "string" || typeof metadata.fromEmail !== "string") return [];
    return [{
      id: origin.id, ticketId: origin.ticket.id, status: "trusted",
      fromName: typeof metadata.fromName === "string" ? metadata.fromName : metadata.fromEmail,
      fromEmail: metadata.fromEmail, bodyHtml: origin.ticket.description ?? "",
      createdAt: origin.createdAt, acceptedAt: null, acceptedBy: null,
      rawPayload: metadata.rawPayload, ticket: origin.ticket,
    }];
  });
}
