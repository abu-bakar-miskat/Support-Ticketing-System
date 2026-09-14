import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/dashboard-manager-data";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "manager" && profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await getManagerDashboardData(profile);
  return NextResponse.json(data);
}
