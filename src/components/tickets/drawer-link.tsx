"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDrawerStore } from "@/store";
import { ticketKeys } from "@/hooks/queries/keys";
import { getTicketDetail } from "@/lib/api/tickets";
import type { TicketShellSource } from "@/lib/ticket-detail-placeholder";

const DETAIL_STALE_MS = 5 * 60 * 1000;
const PREFETCH_DELAY_MS = 180;

type Props = {
  ticketId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
  /** Card snapshot for instant drawer shell while full detail loads. */
  card?: TicketShellSource;
};

/**
 * Wraps a ticket link so normal clicks open the drawer,
 * while Cmd/Ctrl/middle-click still open the full page.
 */
export function DrawerLink({ ticketId, href, className, children, card }: Props) {
  const open = useDrawerStore((s) => s.open);
  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seedShell = useCallback(() => {
    if (!card) return;
    queryClient.setQueryData(ticketKeys.shell(ticketId), card);
  }, [card, queryClient, ticketId]);

  const prefetchDetail = useCallback(
    (immediate = false) => {
      if (prefetchTimer.current) {
        clearTimeout(prefetchTimer.current);
        prefetchTimer.current = null;
      }

      const run = () => {
        seedShell();

        const key = ticketKeys.detail(ticketId);
        const state = queryClient.getQueryState(key);
        if (
          state?.status === "success" &&
          state.dataUpdatedAt > Date.now() - DETAIL_STALE_MS
        ) {
          return;
        }
        if (state?.fetchStatus === "fetching") return;

        void queryClient.prefetchQuery({
          queryKey: key,
          queryFn: ({ signal }) => getTicketDetail(ticketId, signal),
          staleTime: DETAIL_STALE_MS,
        });
      };

      if (immediate) {
        run();
        return;
      }

      prefetchTimer.current = setTimeout(run, PREFETCH_DELAY_MS);
    },
    [queryClient, seedShell, ticketId],
  );

  function handleClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    prefetchDetail(true);
    open(ticketId);
  }

  return (
    <Link
      href={href}
      data-pen-drawer-link
      onClick={handleClick}
      onMouseEnter={() => prefetchDetail()}
      onFocus={() => prefetchDetail()}
      onMouseLeave={() => {
        if (prefetchTimer.current) {
          clearTimeout(prefetchTimer.current);
          prefetchTimer.current = null;
        }
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
