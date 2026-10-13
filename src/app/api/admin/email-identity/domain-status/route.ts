import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager } from "@/lib/auth";
import { checkDomainVerification, findVerifiedManagedDomain } from "@/lib/resend-domains";

export async function GET(request: NextRequest) {
  const { error } = await requireAdminOrManager();
  if (error) return error;

  const domain = request.nextUrl.searchParams.get("domain");
  if (domain !== null) {
    const result = await findVerifiedManagedDomain(domain);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ domain: result.name.toLowerCase(), status: result.status });
  }

  const email = request.nextUrl.searchParams.get("email") ?? "";
  if (!email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const result = await checkDomainVerification(email);
  return NextResponse.json(result);
}
