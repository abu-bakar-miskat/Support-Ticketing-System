import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { setManagedDomainReceiving } from "@/lib/resend-domains";

// Toggles inbound delivery for a managed domain. With no body (or { enabled:
// true }) it turns receiving on — Resend only returns the MX (Receiving) record
// once receiving is enabled, so enabling is what makes that record appear for
// the owner to publish. Pass { enabled: false } to turn receiving off; the
// domain keeps sending but stops receiving replies at the provider. Returns the
// re-fetched domain so the client updates in place without a second round trip.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const enabled = body?.enabled !== false; // default on for callers that send no body
  const domain = await setManagedDomainReceiving(id, enabled);
  if ("error" in domain) return NextResponse.json({ error: domain.error }, { status: 400 });
  return NextResponse.json({ domain });
}
