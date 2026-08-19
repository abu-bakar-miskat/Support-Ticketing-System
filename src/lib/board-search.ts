/**
 * Board filter/search resolvers (slice 17, FLT-01/02/03).
 *
 * Sub-status, custom form-field values, and "search across message body /
 * requester email" all require looking at a *related* table (TicketMessage,
 * Intake) rather than a plain column on Ticket, so they can't be expressed as
 * a single `where` clause the way status/priority/labels are. Each resolver
 * here returns the set of ticket ids that match, computed against an optional
 * `candidateTicketIds` allowlist (always the caller's already fully-scoped,
 * already-other-filtered id set) — the result of these resolvers only ever
 * NARROWS that set, never widens it, so callers stay scope-safe (SD-06,
 * FLT-05) by construction regardless of how these queries themselves are
 * scoped.
 */
import { prisma } from "@/lib/db";
import { deriveSubStatus, type SubStatus, type ConversationMessage } from "@/lib/ticket-sub-status";

export type FormFieldFilter = { fieldId: string; value: string };

/** FLT-01: tickets whose derived sub-status is one of `subStatusIn`. */
export async function resolveSubStatusTicketIds(
  subStatusIn: SubStatus[],
  candidateTicketIds?: string[],
): Promise<string[]> {
  if (subStatusIn.length === 0) return candidateTicketIds ?? [];
  if (candidateTicketIds && candidateTicketIds.length === 0) return [];

  const messages = await prisma.ticketMessage.findMany({
    where: candidateTicketIds ? { ticketId: { in: candidateTicketIds } } : {},
    select: { ticketId: true, direction: true, status: true, createdAt: true },
  });

  const byTicket = new Map<string, ConversationMessage[]>();
  for (const m of messages) {
    const list = byTicket.get(m.ticketId) ?? [];
    list.push(m);
    byTicket.set(m.ticketId, list);
  }

  const wanted = new Set(subStatusIn);
  const matched: string[] = [];
  for (const [ticketId, msgs] of byTicket) {
    const sub = deriveSubStatus(msgs);
    if (sub && wanted.has(sub)) matched.push(ticketId);
  }
  return matched;
}

/**
 * FLT-01/02: tickets whose intake `responses` satisfy every given
 * `{fieldId, value}` pair (AND across pairs; case-insensitive value match).
 * Responses are stored as a JSON array of `{fieldId, value}` (dynamic forms,
 * slice 08) — matched in application code rather than a JSON-array Prisma
 * filter, since the array elements carry other keys too (label, type) that
 * would need an exact structural match otherwise.
 */
export async function resolveFormFieldTicketIds(
  filters: FormFieldFilter[],
  candidateTicketIds?: string[],
): Promise<string[]> {
  if (filters.length === 0) return candidateTicketIds ?? [];
  if (candidateTicketIds && candidateTicketIds.length === 0) return [];

  const intakes = await prisma.intake.findMany({
    where: {
      ticketId: candidateTicketIds ? { in: candidateTicketIds } : { not: null },
    },
    select: { ticketId: true, responses: true },
  });

  const matched: string[] = [];
  for (const intake of intakes) {
    if (!intake.ticketId) continue;
    const responses = Array.isArray(intake.responses)
      ? (intake.responses as { fieldId?: unknown; value?: unknown }[])
      : [];
    const ok = filters.every((f) =>
      responses.some(
        (r) =>
          r.fieldId === f.fieldId &&
          String(r.value ?? "").toLowerCase() === f.value.toLowerCase(),
      ),
    );
    if (ok) matched.push(intake.ticketId);
  }
  return matched;
}

/**
 * FLT-03: tickets matching `search` against title, human-id reference
 * (TEAM-123), requester email (Intake.submitterEmail), or message body/
 * sender email (TicketMessage). Union across all four — a hit on any one
 * qualifies the ticket. Restricting to `candidateTicketIds` up front (rather
 * than filtering post-hoc) keeps this efficient on large tenants.
 */
export async function resolveSearchTicketIds(
  search: string,
  candidateTicketIds?: string[],
): Promise<string[]> {
  if (!search.trim()) return candidateTicketIds ?? [];
  if (candidateTicketIds && candidateTicketIds.length === 0) return [];

  const scopeWhere = candidateTicketIds ? { id: { in: candidateTicketIds } } : {};
  const scopeWhereByTicketId = candidateTicketIds ? { ticketId: { in: candidateTicketIds } } : {};
  const humanIdMatch = search.match(/^([A-Za-z]+)-(\d+)$/i);

  const [byTitleOrRef, byIntakeEmail, byMessage] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        ...scopeWhere,
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          ...(humanIdMatch
            ? [
                {
                  subDepartment: { prefix: { equals: humanIdMatch[1], mode: "insensitive" as const } },
                  ticketNumber: parseInt(humanIdMatch[2], 10),
                },
              ]
            : []),
        ],
      },
      select: { id: true },
    }),
    prisma.intake.findMany({
      where: {
        submitterEmail: { contains: search, mode: "insensitive" },
        ticketId: candidateTicketIds ? { in: candidateTicketIds } : { not: null },
      },
      select: { ticketId: true },
    }),
    prisma.ticketMessage.findMany({
      where: {
        ...scopeWhereByTicketId,
        OR: [
          { bodyHtml: { contains: search, mode: "insensitive" } },
          { fromEmail: { contains: search, mode: "insensitive" } },
        ],
      },
      select: { ticketId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const t of byTitleOrRef) ids.add(t.id);
  for (const i of byIntakeEmail) if (i.ticketId) ids.add(i.ticketId);
  for (const m of byMessage) ids.add(m.ticketId);
  return [...ids];
}
