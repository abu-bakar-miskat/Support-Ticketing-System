"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Tag, SquareArrowOutUpRight, Link2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ticketKeys } from "@/hooks/queries/keys";
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches";
import { useDrawerStore } from "@/store";
import { deleteTicket, updateTicket } from "@/lib/api/tickets";
import { canEditTicket, canDeleteTicket } from "@/lib/ticket-date-permissions";
import type { BoardCardData } from "@/components/board/board-types";

export function BoardCardContextMenu({
  card,
  children,
}: {
  card: BoardCardData;
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const openDrawer = useDrawerStore((s) => s.open);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ticketLike = {
    assigneeId: card.assigneeId,
    creatorId: card.creatorId,
    coAssigneeIds: card.coAssignees.map((c) => c.id),
    subDepartmentId: card.subDepartmentId,
  };
  const canEdit = user ? canEditTicket(user, ticketLike) : false;
  const canDelete = user ? canDeleteTicket(user, { creatorId: card.creatorId }) : false;

  const { data: labelData } = useQuery<{ labels: { id: string; name: string; color: string }[] }>({
    queryKey: ["labels"],
    queryFn: () => fetch("/api/labels").then((r) => r.json()),
    enabled: canEdit,
    staleTime: 5 * 60 * 1000,
  });
  const labels = labelData?.labels ?? [];

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ticketKeys.detail(card.dbId) });
    invalidateTaskCaches(queryClient);
    router.refresh();
  }

  async function run(action: Promise<unknown>, errorMsg: string) {
    try {
      await action;
      refresh();
    } catch {
      toast.error(errorMsg);
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => openDrawer(card.dbId)}>
            <SquareArrowOutUpRight />
            Open ticket
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const url = `${window.location.origin}/tickets/${card.dbId}`;
              navigator.clipboard
                ?.writeText(url)
                .then(() => toast.success("Link copied"))
                .catch(() => toast.error("Failed to copy link"));
            }}
          >
            <Link2 />
            Copy link
          </ContextMenuItem>

          {canEdit && (
            <>
              <ContextMenuSeparator />

              {/* Labels */}
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Tag />
                  Labels
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {labels.length === 0 ? (
                    <ContextMenuItem disabled>No labels</ContextMenuItem>
                  ) : (
                    labels.map((l) => {
                      const active = card.labels.includes(l.name);
                      return (
                        <ContextMenuCheckboxItem
                          key={l.id}
                          checked={active}
                          closeOnClick={false}
                          onClick={() =>
                            run(
                              updateTicket(card.dbId, {
                                labels: active
                                  ? card.labels.filter((n) => n !== l.name)
                                  : [...card.labels, l.name],
                              }),
                              "Failed to update labels",
                            )
                          }
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: l.color }}
                          />
                          <span className="truncate">{l.name}</span>
                        </ContextMenuCheckboxItem>
                      );
                    })
                  )}
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}

          {canDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                Delete ticket
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete ticket"
        description={`${card.humanId} will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        successMessage={`${card.humanId} deleted`}
        onConfirm={async () => {
          await deleteTicket(card.dbId);
          refresh();
        }}
      />
    </>
  );
}
