import { categoryForStatus, type StatusCategory } from "@/lib/status-category";
import type { QueryClient } from "@tanstack/react-query";
import type { TicketDetailProps } from "@/lib/api/tickets";
import { ticketKeys } from "@/hooks/queries/keys";
import { formatTicketDue, isBlockedStatus } from "@/lib/format";

function formatDueDisplay(
  dueDateIso: string | null,
  opts: { isStatusComplete?: boolean; status?: string; category?: StatusCategory } = {},
): { dueDate: string | null; dueOverdue: boolean } {
  const { due, dueOverdue } = formatTicketDue(
    dueDateIso ? new Date(dueDateIso) : null,
    new Date(),
    { isStatusComplete: opts.isStatusComplete, isBlocked: isBlockedStatus(opts.status, opts.category) },
  );
  return { dueDate: due, dueOverdue };
}

/** Optimistically sync ticket detail drawer/page when dates change elsewhere. */
export function patchTicketDetailDatesInCache(
  queryClient: QueryClient,
  ticketId: string,
  startDateIso: string | null,
  dueDateIso: string | null,
  opts: { isStatusComplete?: boolean } = {},
) {
  queryClient.setQueryData<TicketDetailProps>(
    ticketKeys.detail(ticketId),
    (old) => {
      if (!old) return old;
      const { dueDate, dueOverdue } = formatDueDisplay(dueDateIso, {
        ...opts,
        status: old.status,
        category: categoryForStatus(old.status, old.subDepartmentStatuses),
      });
      return {
        ...old,
        startDateIso,
        dueDateIso,
        dueDate,
        dueOverdue,
      };
    },
  );
}
