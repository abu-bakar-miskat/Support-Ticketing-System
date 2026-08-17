"use client";

import { Zap } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { RailCard } from "./rail-card";

export type ActivityItem = {
  id: string; action: string; createdAt: string; statusTo: string | null;
  actor: { name: string; avatarUrl: string | null };
  ticket: { id: string; humanId: string; title: string };
};

const ACTION_PHRASE: Record<string, string> = {
  STATUS_CHANGED: "moved", ASSIGNED: "assigned", COMMENT_ADDED: "commented on",
  ATTACHMENT_ADDED: "attached a file to", TICKET_CREATED: "created",
  PRIORITY_CHANGED: "changed priority of", DATE_CHANGED: "changed the due date of",
  TITLE_CHANGED: "renamed", FORWARDED: "forwarded", MENTION: "mentioned someone on",
  TIMER_RESET: "reset the timer on", QA_TIME_LOGGED: "logged QA time on",
};

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false,
});

export function ActivityTodaySection({ items, total }: { items: ActivityItem[]; total: number }) {
  if (items.length === 0) return null;

  return (
    <RailCard
      id="activity"
      icon={Zap}
      accent="#f59e0b"
      title="Today's activity"
      defaultOpen={false}
      aside={
        <span className="font-sans text-[11px] text-pen-subtle">
          {total} event{total === 1 ? "" : "s"}{total > items.length ? ` · last ${items.length}` : ""}
        </span>
      }
    >
      <div className="relative max-h-[min(420px,48vh)] overflow-y-auto overscroll-contain px-4 py-3">
        {/* timeline rule */}
        <div className="absolute bottom-4 left-[59px] top-4 w-px bg-pen-card-border/70" />

        <div className="flex flex-col gap-2.5">
          {items.map((a) => {
            const phrase = ACTION_PHRASE[a.action] ?? a.action.replaceAll("_", " ").toLowerCase();
            return (
              <div key={a.id} className="relative flex items-start gap-2.5">
                <span className="w-[34px] shrink-0 pt-[2px] font-mono text-[10px] tabular-nums text-pen-subtle">
                  {timeFmt.format(new Date(a.createdAt))}
                </span>
                <span className="relative z-10 mt-[3px] shrink-0 rounded-full ring-4 ring-pen-card">
                  <UserAvatar name={a.actor.name} avatarUrl={a.actor.avatarUrl} size={18} />
                </span>
                <span className="min-w-0 flex-1 font-sans text-[11.5px] leading-[1.5] text-pen-muted">
                  <span className="font-semibold text-pen-foreground">{a.actor.name}</span>
                  {" "}{phrase}{" "}
                  <DrawerLink
                    ticketId={a.ticket.id}
                    href={`/tickets/${a.ticket.id}`}
                    className="font-mono text-[10.5px] font-semibold text-pen-id hover:text-pen-blue"
                  >
                    {a.ticket.humanId}
                  </DrawerLink>
                  {a.statusTo && (
                    <span className="text-pen-subtle"> → <span className="text-pen-foreground">{a.statusTo}</span></span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </RailCard>
  );
}
