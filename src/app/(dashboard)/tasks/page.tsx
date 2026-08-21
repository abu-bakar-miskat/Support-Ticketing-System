import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { TasksPage } from "@/components/tasks/tasks-page";

export const metadata = { title: "Tasks — Support Ticketing System" };

export default async function TasksRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Scope tabs + New Task paint immediately; table body skeletons until client fetch settles.
  return <TasksPage />;
}
