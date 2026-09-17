import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPendingDomainRequests } from "@/lib/email-domain-requests";

export async function GET() {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) return NextResponse.json({ requests: [] });

  const requests = await listPendingDomainRequests(tenantId);
  return NextResponse.json({ requests });
}
