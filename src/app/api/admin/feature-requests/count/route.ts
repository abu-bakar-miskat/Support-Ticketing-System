import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { countPendingFeatureRequests } from "@/lib/feature-marketplace";

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;
  const count = await countPendingFeatureRequests();
  return NextResponse.json({ count });
}
