import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager } from "@/lib/auth";
import { checkDomainVerification } from "@/lib/resend-domains";

export async function GET(request: NextRequest) {
  const { error } = await requireAdminOrManager();
  if (error) return error;

  const email = request.nextUrl.searchParams.get("email") ?? "";
  if (!email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const result = await checkDomainVerification(email);
  return NextResponse.json(result);
}
