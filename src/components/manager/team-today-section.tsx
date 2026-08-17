"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { RailCard } from "./rail-card";
import type { MemberWorkload } from "./aggregate";

function activeAgo(iso: string | null) {
  if (!iso) return "";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h <= 0) return "just now";
  return `${h}h ago`;
}

// active (blue) / overdue (red) / review (violet) — one bar per member,
// scaled against the busiest member so lengths are comparable.
function WorkloadBar({ m, max }: { m: MemberWorkload; max: number }) {
  const total = m.open + m.inReview;
  if (total === 0 || max === 0) return null;
  const activeN = m.open - m.overdue;
  const width = (total / max) * 100;
  return (
    <div className="h-[5px] w-full overflow-hidden rounded-full bg-pen-surface">
      <div className="flex h-full gap-[1px]" style={{ width: `${width}%` }}>
        {activeN > 0 && <div className="h-full" style={{ flex: activeN, backgroundColor: "#0a76b9" }} />}
        {m.overdue > 0 && <div className="h-full" style={{ flex: m.overdue, backgroundColor: "#ef4444" }} />}
        {m.inReview > 0 && <div className="h-full" style={{ flex: m.inReview, backgroundColor: "#7c3aed" }} />}
      </div>
    </div>
  );
}

function MemberRow({ m, max }: { m: MemberWorkload; max: number }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-pen-card-border/40 px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size={26} />
        <Link
          href={`/manager/people#p-${m.id}`}
          className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-semibold text-pen-foreground transition-colors hover:text-pen-blue"
          title={`Open ${m.name}'s report`}
        >
          {m.name}
        </Link>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-pen-muted">
          {m.open + m.inReview > 0 ? (
            <>
              <span className="text-pen-foreground">{m.open + m.inReview}</span>
              {m.overdue > 0 && <span className="text-red-500"> · {m.overdue} late</span>}
            </>
          ) : (
            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-500">idle</span>
          )}
        </span>
      </div>

      <WorkloadBar m={m} max={max} />

      <div className="flex items-center justify-between gap-2">
        {m.current ? (
          <DrawerLink
            ticketId={m.current.id}
            href={`/tickets/${m.current.id}`}
            className="group flex min-w-0 items-baseline gap-1.5"
          >
            <span className="shrink-0 font-sans text-[10.5px] text-pen-subtle">now</span>
            <span className="shrink-0 font-mono text-[10.5px] font-semibold text-pen-id group-hover:text-pen-blue">{m.current.humanId}</span>
            <span className="min-w-0 truncate font-sans text-[11.5px] text-pen-muted group-hover:text-pen-blue">{m.current.title}</span>
          </DrawerLink>
        ) : (
          <span className="font-sans text-[11.5px] italic text-pen-subtle">nothing in progress</span>
        )}
        {m.lastActivityAt && (
          <span className="shrink-0 font-sans text-[10.5px] text-pen-subtle">{activeAgo(m.lastActivityAt)}</span>
        )}
      </div>
    </div>
  );
}

export function TeamTodaySection({ members }: { members: MemberWorkload[] }) {
  const [showIdle, setShowIdle] = useState(false);
  if (members.length === 0) return null;

  const max = Math.max(...members.map((m) => m.open + m.inReview), 1);
  const working = members.filter((m) => m.open + m.inReview > 0);
  const idle = members.filter((m) => m.open + m.inReview === 0);

  return (
    <RailCard
      id="team"
      icon={Users}
      accent="#0a76b9"
      title="Team today"
      aside={
        <span className="flex items-center gap-3 font-sans text-[10px] text-pen-subtle">
          <span className="flex items-center gap-1"><span className="block size-[6px] rounded-[2px] bg-[#0a76b9]" />active</span>
          <span className="flex items-center gap-1"><span className="block size-[6px] rounded-[2px] bg-[#ef4444]" />late</span>
          <span className="flex items-center gap-1"><span className="block size-[6px] rounded-[2px] bg-[#7c3aed]" />review</span>
        </span>
      }
    >
      <div className="max-h-[min(420px,48vh)] overflow-y-auto overscroll-contain">
        {working.map((m) => <MemberRow key={m.id} m={m} max={max} />)}

        {idle.length > 0 && (
          <>
            {showIdle && idle.map((m) => <MemberRow key={m.id} m={m} max={max} />)}
            <button
              type="button"
              onClick={() => setShowIdle((v) => !v)}
              className="w-full px-4 py-2.5 text-center font-sans text-[11.5px] font-medium text-pen-muted transition-colors hover:bg-pen-surface/50 hover:text-pen-foreground"
            >
              {showIdle ? "Hide idle members" : `Show ${idle.length} idle member${idle.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>

      <Link
        href="/manager/people"
        className="flex items-center justify-center gap-1.5 border-t border-pen-card-border/60 px-4 py-2.5 font-sans text-[11.5px] font-semibold text-pen-blue transition-colors hover:bg-pen-surface/50"
      >
        View reports
        <ArrowRight className="size-3" />
      </Link>
    </RailCard>
  );
}
