import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getHomeDashboardData } from "@/lib/dashboard-home-data";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const data = await getHomeDashboardData(profile);
  return NextResponse.json(data);
}
