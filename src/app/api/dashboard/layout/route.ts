import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDashboardLayoutData } from "@/lib/dashboard-layout-data";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  // Badges already stream in via DeferredBadges in the dashboard shell. Ticket
  // counts / recents are what pinned this endpoint at 20s and starved every
  // other page of pooler slots.
  const data = await getDashboardLayoutData(profile, true);
  return NextResponse.json(data);
}
