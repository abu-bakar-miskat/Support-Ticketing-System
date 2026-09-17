import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { verifyTenantDomain } from "@/lib/email-domains";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  const { id } = await params;
  const result = await verifyTenantDomain(tenantId, id);
  if (result === null) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ domain: result });
}
