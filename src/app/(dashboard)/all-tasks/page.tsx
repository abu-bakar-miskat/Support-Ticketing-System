import { redirect } from "next/navigation";

export default function AllTasksRedirect() {
  redirect("/tasks");
}
