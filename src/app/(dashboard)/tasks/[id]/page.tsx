import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { TicketDetailClient } from "@/components/tickets/ticket-detail-client";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return <TicketDetailClient ticketId={id} />;
}
