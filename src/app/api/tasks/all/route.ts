import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getTaskListData } from "@/lib/task-list-data";
import { buildTaskListParams } from "@/lib/task-list-query";

export async function GET(request: Request) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const url = new URL(request.url);

  // Pagination
  const page  = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1",  10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)));
  const query = await buildTaskListParams(url, profile);
  if (query.error) return NextResponse.json({ error: query.error }, { status: 400 });
  return NextResponse.json(await getTaskListData(query, profile.id, page, limit));
}
