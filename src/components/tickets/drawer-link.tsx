"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDrawerStore } from "@/store";
import { ticketKeys } from "@/hooks/queries/keys";
import type { TicketShellSource } from "@/lib/ticket-detail-placeholder";

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
 *
 * Next.js Link prefetch is disabled: hovering a card otherwise SSR-prefetches
 * `/tickets/[id]`, which runs the same heavy ticket query as the drawer API and
 * starves `/api/tickets/:id/detail` on the shared DB pool.
 */
export function DrawerLink({ ticketId, href, className, children, card }: Props) {
  const open = useDrawerStore((s) => s.open);
  const queryClient = useQueryClient();

  const seedShell = useCallback(() => {
    if (!card) return;
    queryClient.setQueryData(ticketKeys.shell(ticketId), card);
  }, [card, queryClient, ticketId]);

  function handleClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    seedShell();
    open(ticketId);
  }

  return (
    <Link
      href={href}
      prefetch={false}
      data-sts-drawer-link
      onClick={handleClick}
      className={className}
    >
      {children}
    </Link>
  );
}
