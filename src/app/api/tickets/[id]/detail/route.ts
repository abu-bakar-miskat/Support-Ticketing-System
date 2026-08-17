import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertTicketAccess } from "@/lib/auth";
import {
  getTicketDetailPayload,
  getTicketDetailRecord,
} from "@/lib/ticket-detail-data";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [{ profile, error }, ticket] = await Promise.all([
    requireAuth(),
    getTicketDetailRecord(id),
  ]);
  if (error) return error;

  if (!ticket || ticket.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build the payload concurrently with the access check — the check has its
  // own DB round-trips and would otherwise serialize in front of the payload.
  // The payload is only returned once the check passes.
  const [access, payload] = await Promise.allSettled([
    assertTicketAccess(profile, ticket),
    getTicketDetailPayload(profile, id, ticket),
  ]);

  if (access.status === "rejected") throw access.reason;
  if (access.value) return access.value;
  if (payload.status === "rejected") throw payload.reason;

  return NextResponse.json(payload.value);
}
