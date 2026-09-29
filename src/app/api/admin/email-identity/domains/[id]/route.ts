import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getTenantDomain, removeTenantDomain } from "@/lib/email-domains";

// `id` is the Resend domain id; every handler authorises it against the tenant's
// ownership before touching Resend (a domain the tenant doesn't own → 404).

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  const { id } = await params;
  const result = await getTenantDomain(tenantId, id);
  if (result === null) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ domain: result });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  const { id } = await params;
  // Default to also deregistering from Resend; the client opts out with ?resend=false.
  const deleteFromResend = req.nextUrl.searchParams.get("resend") !== "false";
  const result = await removeTenantDomain(tenantId, id, { deleteFromResend });
  if (result === null) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
