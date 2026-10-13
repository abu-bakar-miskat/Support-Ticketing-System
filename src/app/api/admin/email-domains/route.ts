import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { listProjectManagedDomains } from "@/lib/platform-email-domains";

// Read-only platform view of the domains used by this project.

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const result = await listProjectManagedDomains();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ domains: result });
}
