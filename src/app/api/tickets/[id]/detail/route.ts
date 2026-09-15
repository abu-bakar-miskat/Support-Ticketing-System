import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertTicketAccess } from "@/lib/auth";
import {
  getTicketDetailPayload,
  getTicketDetailRecord,
} from "@/lib/ticket-detail-data";
import { runWithScope } from "@/lib/request-scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { profile, error } = await requireAuth();
  if (error) return error;

  // Super-admins skip tenant scoping entirely. For everyone else, do NOT call
  // resolveProfileTicketScope() here — that scans every assigned ticket
  // (getExceptionTicketIds) before the detail query even starts, which is why
  // this route was fast for super-admins and 40s–minutes for other roles.
  // This unique read only needs: the caller's tenants + an exception for *this* id.
  const requestScope = profile.isSuperAdmin
    ? { isPlatformAdmin: true as const, tenantIds: [] as string[] }
    : {
        tenantIds: profile.tenantIds,
        grantedTicketIds: [id],
      };

  return runWithScope(requestScope, async () => {
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
