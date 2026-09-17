import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getManagedDomain, removeManagedDomain } from "@/lib/resend-domains";

// GET returns one domain with its DNS records + current per-record status —
// the client polls this after the owner adds records at their DNS provider.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const result = await getManagedDomain(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ domain: result });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const result = await removeManagedDomain(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
