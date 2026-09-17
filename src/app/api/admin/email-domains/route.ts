import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createManagedDomain } from "@/lib/resend-domains";
import { listProjectManagedDomains } from "@/lib/platform-email-domains";

// Sending domains are account-wide in Resend (one shared API key across all
// tenants), so domain management is a platform / super-admin capability — not a
// per-department setting. Once a domain here is verified, department admins can
// register mailbox addresses on it (checkDomainVerification gate).

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const result = await listProjectManagedDomains();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ domains: result });
}

export async function POST(request: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) {
    return NextResponse.json({ error: "A domain name is required" }, { status: 400 });
  }

  const result = await createManagedDomain(name);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ domain: result }, { status: 201 });
}
