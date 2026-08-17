import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDashboardLayoutData } from "@/lib/dashboard-layout-data";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const data = await getDashboardLayoutData(profile);
  return NextResponse.json(data);
}
