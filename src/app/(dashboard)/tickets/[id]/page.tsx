import { redirect } from "next/navigation";

export default async function TicketRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/tasks/${id}`);
}
