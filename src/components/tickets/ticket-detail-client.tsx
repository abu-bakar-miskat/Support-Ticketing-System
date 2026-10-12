"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Lock, FileX } from "lucide-react";
import { TicketDetailPage } from "@/components/tickets/ticket-detail-page";
import { TicketDetailSkeleton } from "@/components/skeletons/page-skeletons";
import { useTicketDetail } from "@/hooks/queries/use-ticket-detail";
import { BreadcrumbRegistrar } from "@/components/dashboard/breadcrumb-registrar";
import { TicketDetailError } from "@/lib/api/tickets";

/**
 * Same pattern as TasksPage: the server only checks auth, then this client
 * hook fetches `/api/tickets/:id/detail`. Blocking SSR of the ticket (and
 * `tasks/loading.tsx` covering this route) is what made non-super-admin
 * opens sit on a skeleton for minutes.
 */
export function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } =
    useTicketDetail(ticketId);

  // The ticket loads client-side, so the server can only title the tab "Ticket" —
  // swap in the real ticket once it arrives (same pattern as ProjectProfilePage).
  const displayId = data?.ticketId;
  const title = data?.title;
  useEffect(() => {
    if (!displayId) return;
    document.title = `${displayId}${title ? ` · ${title}` : ""} — Global Support Portal`;
    return () => {
      document.title = "Global Support Portal";
    };
  }, [displayId, title]);

  if (!data && (isPending || isFetching)) {
    return <TicketDetailSkeleton />;
  }

  if (isError && !data) {
    // A friendly breadcrumb so the raw ticket id never shows up as the page title.
    const crumb = (
      <BreadcrumbRegistrar
        crumbs={[
          { label: "My Tasks", href: "/tasks" },
          { label: "Ticket", href: `/tasks/${ticketId}` },
        ]}
      />
    );
    const status = error instanceof TicketDetailError ? error.status : 0;

    // 403 = the ticket exists but the agent isn't allowed to see it — show a
    // clear access message, never "Ticket not found" and never a raw status code.
    if (status === 403) {
      return (
        <>
          {crumb}
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-sts-surface">
              <Lock className="size-6 text-sts-muted" />
            </span>
            <div className="flex flex-col gap-1.5 max-w-[440px]">
              <p className="sts-text-page-title">You don&apos;t have access to this ticket</p>
              <p className="font-sans text-[13px] leading-relaxed text-sts-muted">
                This ticket belongs to a department or sub-department you&apos;re not part of.
                Ask a department manager to add you or assign it to you.
              </p>
            </div>
            <Link
              href="/board"
              className="mt-2 inline-flex h-9 items-center gap-2 rounded-full bg-sts-blue px-5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:text-gray-900"
            >
              Go to board
            </Link>
          </div>
        </>
      );
    }

    if (status === 404) {
      return (
        <>
          {crumb}
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-sts-surface">
              <FileX className="size-6 text-sts-muted" />
            </span>
            <div className="flex flex-col gap-1.5 max-w-[440px]">
              <p className="sts-text-page-title">Ticket not found</p>
              <p className="font-sans text-[13px] leading-relaxed text-sts-muted">
                This ticket no longer exists. It may have been deleted.
              </p>
            </div>
            <Link
              href="/board"
              className="mt-2 inline-flex h-9 items-center gap-2 rounded-full bg-sts-blue px-5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:text-gray-900"
            >
              Go to board
            </Link>
          </div>
        </>
      );
    }

    // Network/timeout — retryable, still no raw codes.
    return (
      <>
        {crumb}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <p className="font-sans text-[14px] font-semibold text-sts-foreground">
            Couldn&apos;t load this ticket
          </p>
          <p className="font-sans text-[13px] text-sts-subtle">
            The request timed out. Please try again.
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
      </>
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
