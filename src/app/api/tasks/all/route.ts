import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getBoardCards, countBoardCards } from "@/lib/board-data";
import { buildTaskListParams } from "@/lib/task-list-query";

export async function GET(request: Request) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const url = new URL(request.url);

  // Pagination
  const page  = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1",  10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)));
  const skip  = (page - 1) * limit;

  const { filterParams, sortKey, isAdmin, isManager, isElevated, deptScope, error: paramError } =
    await buildTaskListParams(url, profile);
  if (paramError) return NextResponse.json({ error: paramError }, { status: 400 });

  const [total, tasks] = await Promise.all([
    countBoardCards(filterParams),
    getBoardCards({
      ...filterParams,
      timeForUserId: profile.id,
      sortKey,
      skip,
      take: limit,
    }),
  ]);

  const isPrivileged = isElevated || !!deptScope;
  const hasMore = skip + tasks.length < total;
  const canExport = isAdmin || isManager;

  return NextResponse.json({ tasks, isPrivileged, canExport, total, page, limit, hasMore });
}
