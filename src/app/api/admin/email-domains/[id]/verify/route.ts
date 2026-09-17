import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyManagedDomain, getManagedDomain } from "@/lib/resend-domains";

// Triggers a fresh DNS re-scan in Resend, then returns the re-fetched domain so
// the client immediately reflects the new status without a second round trip.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const verified = await verifyManagedDomain(id);
  if ("error" in verified) return NextResponse.json({ error: verified.error }, { status: 400 });

  const domain = await getManagedDomain(id);
  if ("error" in domain) return NextResponse.json({ error: domain.error }, { status: 404 });
  return NextResponse.json({ domain });
}
