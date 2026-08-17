"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDrawerStore } from "@/store";
import { TicketDetailPage } from "@/components/tickets/ticket-detail-page";
import { TicketDetailSkeleton } from "@/components/skeletons/page-skeletons";
import { useTicketDetail } from "@/hooks/queries/use-ticket-detail";

// ── Ticket data fetcher panel ─────────────────────────────────────────────────

function TicketPanel({
  ticketId,
  onClose,
  className,
}: {
  ticketId: string;
  onClose: () => void;
  className?: string;
}) {
  const { data, isPending, isError, refetch, isFetching, isPlaceholderData } =
    useTicketDetail(ticketId);
  const showSkeleton = !data && (isPending || isFetching);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden bg-pen-bg",
        className,
      )}
    >
      {showSkeleton ? (
        <TicketDetailSkeleton showDrawerChrome />
      ) : isError && !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-sans text-[14px] font-semibold text-pen-foreground">
            Failed to load ticket
          </p>
          <p className="font-sans text-[13px] text-pen-subtle">
            This may be a network issue. Check your connection and try again.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-lg bg-pen-blue px-4 py-2 font-sans text-[13px] font-medium text-white transition-colors hover:bg-pen-blue/90 disabled:opacity-60"
            >
              <RefreshCw
                className={cn("size-3.5", isFetching && "animate-spin")}
              />
              {isFetching ? "Retrying…" : "Retry"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-pen-card-border px-4 py-2 font-sans text-[13px] text-pen-muted transition-colors hover:bg-pen-surface"
            >
              <X className="size-3.5" />
              Close
            </button>
          </div>
        </div>
      ) : data ? (
        <TicketDetailPage
          {...data}
          isDrawer
          onClose={onClose}
          isHydrating={isFetching && isPlaceholderData}
        />
      ) : null}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

const SINGLE_WIDTH = "min(880px, 92vw)";

export function TicketDrawerRoot() {
  const stack = useDrawerStore((s) => s.stack);
  const close = useDrawerStore((s) => s.close);

  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prevLen = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (stack.length > 0 && prevLen.current === 0) {
      requestAnimationFrame(() => setVisible(true));
    }
    if (stack.length === 0) setVisible(false);
    prevLen.current = stack.length;
  }, [stack.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(close, 210);
  }

  if (!mounted || stack.length === 0) return null;

  const parentId = stack[0];

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 pen-overlay-backdrop transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={handleClose}
      />

      {/* Parent ticket drawer — right-anchored */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 bg-pen-bg shadow-[-8px_0_40px_rgba(0,0,0,0.15)] transition-transform duration-200 ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        )}
        style={{ width: SINGLE_WIDTH }}
      >
        <TicketPanel key={parentId} ticketId={parentId} onClose={handleClose} />
      </div>
    </>,
    document.body,
  );
}
