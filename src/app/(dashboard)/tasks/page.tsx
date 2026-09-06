import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { TasksPage } from "@/components/tasks/tasks-page";
import { cookies } from "next/headers";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getMyTasksData } from "@/lib/tasks-data";
import { getTaskListData } from "@/lib/task-list-data";
import { buildTaskListParams } from "@/lib/task-list-query";
import { buildTaskListSearchParams } from "@/lib/api/tasks";
import { taskKeys } from "@/hooks/queries/keys";

export const metadata = { title: "Tasks — Support Ticketing System" };

export default async function TasksRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const storedScope = (await cookies()).get("pen_tasks_scope")?.value;
  const elevated = profile.role === "admin" || profile.role === "manager";
  const scope = storedScope === "all" || storedScope === "drafts" || (storedScope === "unassigned" && elevated)
    ? storedScope : "mine";
  const client = new QueryClient();
  if (scope === "mine") {
    await client.prefetchQuery({ queryKey: taskKeys.my(), queryFn: () => getMyTasksData(profile) });
  } else {
    const filters = { limit: 25, sort: "created", unassigned: scope === "unassigned" || undefined, drafts: scope === "drafts" || undefined };
    await client.prefetchInfiniteQuery({
      queryKey: taskKeys.allInfinite(filters),
      initialPageParam: 1,
      queryFn: async () => {
        const query = await buildTaskListParams(new URL(`http://internal/tasks?${buildTaskListSearchParams(filters)}`), profile);
        if (query.error) throw new Error(query.error);
        return getTaskListData(query, profile.id);
      },
    });
  }
  return <HydrationBoundary state={dehydrate(client)}><TasksPage initialScope={scope} /></HydrationBoundary>;
}
