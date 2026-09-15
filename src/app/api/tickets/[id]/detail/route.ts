import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertTicketAccess } from "@/lib/auth";
import {
  getTicketDetailPayload,
  getTicketDetailRecord,
} from "@/lib/ticket-detail-data";
import { runWithScope, uniqueTicketReadScope } from "@/lib/request-scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { profile, error } = await requireAuth();
  if (error) return error;

  return runWithScope(uniqueTicketReadScope(profile, id), async () => {
    const ticket = await getTicketDetailRecord(id);
    if (!ticket || ticket.deletedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await assertTicketAccess(profile, ticket);
    if (access) return access;

    const payload = await getTicketDetailPayload(profile, id, ticket);
    return NextResponse.json(payload);
  });
}
