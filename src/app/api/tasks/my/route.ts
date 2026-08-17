import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMyTasksData } from "@/lib/tasks-data";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const data = await getMyTasksData(profile);
  return NextResponse.json(data);
}
