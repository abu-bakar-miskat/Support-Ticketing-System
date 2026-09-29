import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { TasksPage } from "@/components/tasks/tasks-page";
import { cookies } from "next/headers";

export const metadata = { title: "Tasks — Global Support Portal" };

export default async function TasksRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const storedScope = (await cookies()).get("pen_tasks_scope")?.value;
  const elevated = profile.role === "admin" || profile.role === "manager";
  const scope =
    storedScope === "all" ||
    storedScope === "drafts" ||
    (storedScope === "unassigned" && elevated)
      ? storedScope
      : "mine";

  return <TasksPage initialScope={scope} />;
}
