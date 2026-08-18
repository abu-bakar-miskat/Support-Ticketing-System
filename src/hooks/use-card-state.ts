"use client";

import { useEffect, useState } from "react";
import type { SubCardData } from "@/components/board/board-types";
import { uiPriorityFromDb } from "@/components/board/board-types";

type CreatedTicket = {
  id: string;
  title: string;
  status: string;
  priority: string;
  subDepartmentPrefix: string;
  ticketNumber: number;
  assigneeId: string | null;
  assigneeName: string | null;
};

export function useCardState(initialSubTicketCards: SubCardData[]) {
  const [subTicketCards, setSubTicketCards] = useState<SubCardData[]>(initialSubTicketCards);
  const [expanded, setExpanded] = useState(false);
  const [creatingSubTicket, setCreatingSubTicket] = useState(false);

  // Sync when server pushes fresh data via router.refresh() (realtime ticket changes)
  useEffect(() => {
    setSubTicketCards(initialSubTicketCards);
  }, [initialSubTicketCards]);

  const subTotal = subTicketCards.length;
  const subDone = subTicketCards.filter((s) => s.done).length;
  const subtasksDone = subTotal > 0 && subDone === subTotal;

  function openSubTicketModal() {
    setCreatingSubTicket(true);
  }

  function closeSubTicketModal() {
    setCreatingSubTicket(false);
  }

  function toggleExpanded() {
    setExpanded((v) => !v);
  }

  function onSubTicketCreated(ticket: CreatedTicket) {
    setSubTicketCards((prev) => [
      ...prev,
      {
        dbId: ticket.id,
        humanId: `${ticket.subDepartmentPrefix}-${ticket.ticketNumber}`,
        title: ticket.title,
        status: ticket.status,
        done: false,
        priority: uiPriorityFromDb(ticket.priority),
        assigneeId: ticket.assigneeId,
        assigneeName: ticket.assigneeName,
        avatarColor: null,
        startDateIso: null,
        dueDateIso: null,
      },
    ]);
    setExpanded(true);
    setCreatingSubTicket(false);
  }

  return {
    subTicketCards,
    expanded,
    creatingSubTicket,
    subTotal,
    subDone,
    subtasksDone,
    openSubTicketModal,
    closeSubTicketModal,
    toggleExpanded,
    onSubTicketCreated,
  };
}
