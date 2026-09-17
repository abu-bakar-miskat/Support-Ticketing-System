import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { approveDomainRequest } from "@/lib/email-domain-requests";

// Approving auto-registers the domain (assigned to the requested scope) and
// returns it so the admin can immediately see the DNS records + Verify.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const { id } = await params;
  const result = await approveDomainRequest(tenantId, id, profile!.id);
  if (result === null) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ domain: result });
}
