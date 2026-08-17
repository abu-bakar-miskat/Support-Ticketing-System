import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getTasksMetaData } from "@/lib/tasks-data";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const data = await getTasksMetaData(profile);
  return NextResponse.json(data);
}
