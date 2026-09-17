import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rejectDomainRequest } from "@/lib/email-domain-requests";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const { id } = await params;
  const result = await rejectDomainRequest(tenantId, id, profile!.id);
  if (result === null) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
