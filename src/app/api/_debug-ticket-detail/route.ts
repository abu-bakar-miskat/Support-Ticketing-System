// TEMPORARY debug route — added by Claude to diagnose ticket-detail failures.
// Delete after use.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withSystemScope } from "@/lib/request-scope";
import {
  getTicketDetailRecord,
  getTicketDetailPayload,
  getCachedTeamStatuses,
  getCachedMentionableUsers,
  getAssignableUsersForTicketDepartment,
} from "@/lib/ticket-detail-data";

// TEMPORARY debug route (see header) — wrap in system scope so its anonymous
// ticket reads don't fail closed. Delete this route once diagnosis is done.
export const GET = withSystemScope(handleGet)

async function handleGet() {
  const steps: Record<string, string> = {};
  const time = async (label: string, fn: () => Promise<unknown>) => {
    const s = Date.now();
    try {
      await fn();
      steps[label] = `ok ${Date.now() - s}ms`;
    } catch (err) {
      steps[label] = `ERROR ${Date.now() - s}ms: ${err instanceof Error ? `${err.message}\n${err.stack}` : String(err)}`;
    }
  };

  const t = await prisma.ticket.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!t) return NextResponse.json({ error: "no tickets" });

  const ticket = await getTicketDetailRecord(t.id);
  if (!ticket) return NextResponse.json({ error: "record fetch failed" });
  steps["getTicketDetailRecord"] = "ok";

  await time("getCachedTeamStatuses", () => getCachedTeamStatuses(ticket.teamId));
  await time("getCachedMentionableUsers", () =>
    getCachedMentionableUsers(ticket.team.departmentId, ticket.teamId),
  );
  await time("getAssignableUsers", () =>
    getAssignableUsersForTicketDepartment(ticket.team.departmentId),
  );

  const profileRow = await prisma.profile.findFirst({
    where: { role: "admin", deletedAt: null },
  });
  await time("getTicketDetailPayload(full)", () =>
    getTicketDetailPayload(profileRow as never, t.id, ticket),
  );

  return NextResponse.json({ ticketId: t.id, steps });
}
