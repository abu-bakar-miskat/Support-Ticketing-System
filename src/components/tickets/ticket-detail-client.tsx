"use client";

import { RefreshCw } from "lucide-react";
import { TicketDetailPage } from "@/components/tickets/ticket-detail-page";
import { TicketDetailSkeleton } from "@/components/skeletons/page-skeletons";
import { useTicketDetail } from "@/hooks/queries/use-ticket-detail";
import { BreadcrumbRegistrar } from "@/components/dashboard/breadcrumb-registrar";

/**
 * Same pattern as TasksPage: the server only checks auth, then this client
 * hook fetches `/api/tickets/:id/detail`. Blocking SSR of the ticket (and
 * `tasks/loading.tsx` covering this route) is what made non-super-admin
 * opens sit on a skeleton for minutes.
 */
export function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const { data, isPending, isError, refetch, isFetching, isPlaceholderData } =
    useTicketDetail(ticketId);

  if (!data && (isPending || isFetching)) {
    return <TicketDetailSkeleton />;
  }

  if (isError && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <p className="font-sans text-[14px] font-semibold text-sts-foreground">
          Failed to load ticket
        </p>
        <p className="font-sans text-[13px] text-sts-subtle">
          You may not have access, or the request timed out. Try again.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-full bg-sts-blue px-4 py-2 font-sans text-[13px] font-medium text-white transition-colors hover:bg-sts-blue/90 disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <BreadcrumbRegistrar
        crumbs={[
          { label: "My Tasks", href: "/tasks" },
          { label: data.ticketId, href: `/tasks/${data.dbId}` },
        ]}
      />
      <TicketDetailPage {...data} isHydrating={isFetching && isPlaceholderData} />
    </>
  );
}
