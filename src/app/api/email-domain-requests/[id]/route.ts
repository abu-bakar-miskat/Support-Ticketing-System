import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteRejectedDomainRequest } from "@/lib/email-domain-requests";

// Requesters (managers / sub-managers, or admins) clean up their own declined
// requests. Only rejected requests can be deleted (enforced in the lib).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  const role = profile!.role;
  if (!tenantId || (role !== "admin" && role !== "manager" && role !== "sub_manager")) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const { id } = await params;
  const result = await deleteRejectedDomainRequest(tenantId, id);
  if (result === null) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
