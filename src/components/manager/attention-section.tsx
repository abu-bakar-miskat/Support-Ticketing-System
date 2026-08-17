"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Check, ChevronDown, Eye, MessageCircle, UserX, Users, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DrawerLink } from "@/components/tickets/drawer-link";

// ── Types ────────────────────────────────────────────────────────────────────

export type AttentionTab = "overdue" | "unassigned" | "review" | "requests";

export type SimpleTicket = {
  id: string; humanId: string; title: string; priority: string; status: string;
  dueDate: string | null; updatedAt: string; comments: number;
  assignee: { name: string; avatarUrl: string | null } | null;
  requester: { name: string; avatarUrl: string | null } | null;
};

export type OverdueGroup = {
  key: string; name: string; color: string; worstDaysLate: number; tickets: SimpleTicket[];
};

export type ReviewGroup = {
  key: string; name: string; avatarUrl: string | null; tickets: SimpleTicket[];
};

export type JoinRequest = {
  id: string; message: string; requestedAt: string;
  user: { name: string; email: string; avatarUrl: string | null };
  target: string; teamId: string | null; departmentId: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  Urgent:   "#ff4500",
  Critical: "#ef4444",
  High:     "#f97316",
  Medium:   "#ec4899",
  Low:      "#64748b",
};

function daysLate(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return { label: "due today" };
  return { label: `${d}d late` };
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

// Shared column template so header and rows align like a real table.
const GRID = "grid grid-cols-[92px_minmax(0,1fr)_92px] items-center gap-3 sm:grid-cols-[92px_minmax(0,1fr)_150px_92px]";

function TableHead({ last }: { last: string }) {
  return (
    <div className={cn(GRID, "sticky top-0 z-10 border-b border-pen-card-border bg-pen-card/95 px-4 py-2 backdrop-blur-sm")}>
      <span className="pen-text-table-head">Ticket</span>
      <span className="pen-text-table-head">Title</span>
      <span className="pen-text-table-head hidden sm:block">Assignee</span>
      <span className="pen-text-table-head text-right">{last}</span>
    </div>
  );
}

function TicketRow({ t, last }: { t: SimpleTicket; last: React.ReactNode }) {
  const priorityColor = PRIORITY_COLOR[t.priority] ?? "#64748b";
  const person = t.assignee ?? t.requester;
  return (
    <DrawerLink
      ticketId={t.id}
      href={`/tickets/${t.id}`}
      className={cn(GRID, "group h-[42px] border-b border-pen-card-border/40 px-4 last:border-b-0 transition-colors hover:bg-pen-surface/60")}
    >
      <span className="flex items-center gap-2">
        <span className="block size-[7px] shrink-0 rounded-full" style={{ backgroundColor: priorityColor }} title={t.priority} />
        <span className="font-mono text-[11.5px] font-semibold text-pen-id">{t.humanId}</span>
      </span>
      <span className="truncate font-sans text-[12.5px] text-pen-foreground group-hover:text-pen-blue">
        {t.title}
        {t.comments > 0 && (
          <span className="ml-2 inline-flex translate-y-[1px] items-center gap-0.5 text-pen-subtle">
            <MessageCircle className="size-3" />
            <span className="font-sans text-[11px]">{t.comments}</span>
          </span>
        )}
      </span>
      <span className="hidden min-w-0 items-center gap-2 sm:flex">
        {person ? (
          <>
            <UserAvatar name={person.name} avatarUrl={person.avatarUrl} size={20} />
            <span className="truncate font-sans text-[12px] text-pen-muted">{person.name}</span>
          </>
        ) : (
          <span className="font-sans text-[12px] italic text-pen-subtle">unassigned</span>
        )}
      </span>
      <span className="text-right">{last}</span>
    </DrawerLink>
  );
}

function StatusPill({ status }: { status: string }) {
  const isPR = status.toLowerCase().includes("pull") || status.toLowerCase() === "pr";
  return (
    <span className={cn(
      "inline-block rounded-md px-2 py-0.5 font-sans text-[10.5px] font-medium",
      isPR ? "bg-purple-500/10 text-purple-500" : "bg-pen-blue/10 text-pen-blue",
    )}>
      {status}
    </span>
  );
}

// ── Cards & group headers ─────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card shadow-pen-card">
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, accent, title, count, aside }: {
  icon: React.ElementType; accent: string; title: string; count: number; aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-pen-card-border px-4 py-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${accent}18` }}>
        <Icon className="size-3.5" style={{ color: accent }} />
      </span>
      <span className="pen-text-card-title">{title}</span>
      <span
        className="flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] font-bold tabular-nums"
        style={{ backgroundColor: `${accent}18`, color: accent }}
      >
        {count}
      </span>
      {aside && (
        <div className="ml-auto flex items-center gap-3 font-sans text-[11px] text-pen-subtle">
          {aside}
        </div>
      )}
    </div>
  );
}

function GroupRow({ open, onToggle, children }: {
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 border-b border-pen-card-border/60 bg-pen-surface/30 px-4 py-2 text-left transition-colors hover:bg-pen-surface/70"
    >
      <ChevronDown className={cn("size-3.5 shrink-0 text-pen-subtle transition-transform", !open && "-rotate-90")} />
      {children}
    </button>
  );
}

function AvatarStack({ people }: { people: { name: string; avatarUrl: string | null }[] }) {
  const unique = [...new Map(people.map((p) => [p.name, p])).values()].slice(0, 4);
  return (
    <span className="flex items-center">
      {unique.map((p, i) => (
        <span key={p.name} className={cn("rounded-full ring-2 ring-pen-card", i > 0 && "-ml-1.5")}>
          <UserAvatar name={p.name} avatarUrl={p.avatarUrl} size={18} />
        </span>
      ))}
    </span>
  );
}

// ── Join request row ──────────────────────────────────────────────────────────

function JoinRow({ req, onProcessed }: { req: JoinRequest; onProcessed: (id: string) => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function handle(action: "approve" | "reject") {
    setLoading(action);
    const res = await fetch(`/api/join-requests/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(req.teamId ? { teamId: req.teamId } : {}) }),
    });
    setLoading(null);
    if (res.ok) { onProcessed(req.id); startTransition(() => router.refresh()); }
  }

  return (
    <div className="flex items-center gap-3 border-b border-pen-card-border/40 px-4 py-3 last:border-b-0 transition-colors hover:bg-pen-surface/60">
      <UserAvatar name={req.user.name} avatarUrl={req.user.avatarUrl} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-sans text-[12.5px] font-semibold text-pen-foreground">{req.user.name}</span>
          <span className="font-sans text-[11px] text-pen-subtle">→</span>
          <span className="truncate font-sans text-[12px] text-pen-muted">{req.target}</span>
        </div>
        {req.message && (
          <p className="truncate font-sans text-[11px] italic text-pen-subtle">&quot;{req.message}&quot;</p>
        )}
      </div>
      <span className="shrink-0 font-sans text-[11px] text-pen-subtle">{timeAgo(req.requestedAt)}</span>
      <button
        type="button" disabled={!!loading} onClick={() => handle("approve")}
        className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-400"
      >
        <Check className="size-3.5" strokeWidth={2.5} />
      </button>
      <button
        type="button" disabled={!!loading} onClick={() => handle("reject")}
        className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-pen-card-border bg-pen-surface text-pen-muted transition-colors hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
      >
        <X className="size-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

const TAB_META: Record<AttentionTab, { label: string; accent: string }> = {
  overdue: { label: "Overdue", accent: "#ef4444" },
  unassigned: { label: "Unassigned", accent: "#f59e0b" },
  review: { label: "Needs review", accent: "#7c3aed" },
  requests: { label: "Requests", accent: "#f59e0b" },
};

function AttentionTabs({
  tabs, active, onChange,
}: {
  tabs: { id: AttentionTab; count: number }[];
  active: AttentionTab;
  onChange: (tab: AttentionTab) => void;
}) {
  if (tabs.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2 border-b border-pen-card-border px-4 py-3">
      {tabs.map(({ id, count }) => {
        const meta = TAB_META[id];
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-[11.5px] font-semibold transition-colors",
              isActive
                ? "border-transparent text-white dark:text-gray-900"
                : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground",
            )}
            style={isActive ? { backgroundColor: meta.accent } : undefined}
          >
            {meta.label}
            <span
              className={cn(
                "font-mono text-[10px] font-bold tabular-nums",
                isActive ? "text-white/90 dark:text-gray-900/80" : "text-pen-subtle",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function AttentionSection({
  overdueGroups, unassignedTickets, reviewGroups, joinRequests: initialJoinRequests,
  defaultTab = "overdue",
}: {
  overdueGroups: OverdueGroup[];
  unassignedTickets: SimpleTicket[];
  reviewGroups: ReviewGroup[];
  joinRequests: JoinRequest[];
  defaultTab?: AttentionTab;
}) {
  const [joinRequests, setJoinRequests] = useState(initialJoinRequests);
  const [activeTab, setActiveTab] = useState<AttentionTab>(defaultTab);
  const [openOverdue, setOpenOverdue] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    overdueGroups.forEach((g, i) => {
      if (i === 0 || g.tickets.length <= 3) initial.add(g.key);
    });
    return initial;
  });
  const [openReview, setOpenReview] = useState<Set<string>>(
    () => new Set(reviewGroups.length === 1 ? [reviewGroups[0].key] : []),
  );

  useEffect(() => {
    function onFocus(e: Event) {
      const tab = (e as CustomEvent<AttentionTab>).detail;
      if (tab) setActiveTab(tab);
    }
    window.addEventListener("manager-focus-attention", onFocus);
    return () => window.removeEventListener("manager-focus-attention", onFocus);
  }, []);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const overdueTotal = overdueGroups.reduce((s, g) => s + g.tickets.length, 0);
  const reviewTotal = reviewGroups.reduce((s, g) => s + g.tickets.length, 0);

  const availableTabs: { id: AttentionTab; count: number }[] = [];
  if (overdueGroups.length > 0) availableTabs.push({ id: "overdue", count: overdueTotal });
  if (unassignedTickets.length > 0) availableTabs.push({ id: "unassigned", count: unassignedTickets.length });
  if (reviewGroups.length > 0) availableTabs.push({ id: "review", count: reviewTotal });
  if (joinRequests.length > 0) availableTabs.push({ id: "requests", count: joinRequests.length });

  const showOverdue = activeTab === "overdue" && overdueGroups.length > 0;
  const showUnassigned = activeTab === "unassigned" && unassignedTickets.length > 0;
  const showReview = activeTab === "review" && reviewGroups.length > 0;
  const showRequests = activeTab === "requests" && joinRequests.length > 0;

  // If the active tab emptied (e.g. after approve), fall back to first available.
  useEffect(() => {
    const ids = [
      ...(overdueGroups.length > 0 ? ["overdue" as const] : []),
      ...(unassignedTickets.length > 0 ? ["unassigned" as const] : []),
      ...(reviewGroups.length > 0 ? ["review" as const] : []),
      ...(joinRequests.length > 0 ? ["requests" as const] : []),
    ];
    if (ids.length === 0) return;
    if (!ids.includes(activeTab)) setActiveTab(ids[0]);
  }, [activeTab, overdueGroups.length, unassignedTickets.length, reviewGroups.length, joinRequests.length]);

  const allOverdueOpen = overdueGroups.length > 0 && overdueGroups.every((g) => openOverdue.has(g.key));
  const toggleAllOverdue = () => {
    if (allOverdueOpen) {
      setOpenOverdue(new Set());
    } else {
      setOpenOverdue(new Set(overdueGroups.map((g) => g.key)));
    }
  };

  const allClear =
    overdueGroups.length === 0 && unassignedTickets.length === 0 &&
    reviewGroups.length === 0 && joinRequests.length === 0;

  if (allClear) {
    return (
      <section id="attention">
        <Card>
          <div className="flex items-center gap-2.5 px-4 py-5">
            <Check className="size-4 text-emerald-500" />
            <p className="font-sans text-[12.5px] text-pen-muted">Nothing needs your attention.</p>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section id="attention" className="flex min-w-0 flex-col">
      <Card>
        <AttentionTabs tabs={availableTabs} active={activeTab} onChange={setActiveTab} />

      {/* Overdue — grouped by project */}
      {showOverdue && (
        <>
          <CardTitle
            icon={AlertTriangle}
            accent="#ef4444"
            title="Overdue"
            count={overdueTotal}
            aside={
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleAllOverdue}
                  className="font-sans text-[11px] font-medium text-pen-id hover:underline"
                >
                  {allOverdueOpen ? "Collapse all" : "Expand all"}
                </button>
                <span>grouped by project</span>
              </span>
            }
          />
          <div className="max-h-[min(560px,70vh)] overflow-y-auto">
            <TableHead last="Late by" />
            {overdueGroups.map((g) => {
              const open = openOverdue.has(g.key);
              return (
                <div key={g.key}>
                  <GroupRow open={open} onToggle={() => toggle(setOpenOverdue, g.key)}>
                    <span className="block size-[7px] shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="font-sans text-[12px] font-semibold text-pen-foreground">{g.name}</span>
                    <span className="font-mono text-[11px] tabular-nums text-pen-subtle">{g.tickets.length}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <AvatarStack people={g.tickets.map((t) => t.assignee).filter(Boolean) as { name: string; avatarUrl: string | null }[]} />
                      <span className="font-sans text-[11px] font-semibold tabular-nums text-red-500">up to {g.worstDaysLate}d</span>
                    </span>
                  </GroupRow>
                  {open && g.tickets.map((t) => (
                    <TicketRow
                      key={t.id}
                      t={t}
                      last={
                        <span className={cn(
                          "font-sans text-[11.5px] font-semibold tabular-nums",
                          daysLate(t.dueDate!).label === "due today" ? "text-amber-500" : "text-red-500",
                        )}>
                          {daysLate(t.dueDate!).label}
                        </span>
                      }
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Unassigned — needs triage */}
      {showUnassigned && (
        <>
          <CardTitle icon={UserX} accent="#f59e0b" title="Unassigned" count={unassignedTickets.length} aside="waiting for triage" />
          <div className="max-h-[min(480px,60vh)] overflow-y-auto">
            <TableHead last="Status" />
            {unassignedTickets.map((t) => (
              <TicketRow key={t.id} t={t} last={<StatusPill status={t.status} />} />
            ))}
          </div>
        </>
      )}

      {/* Needs review — grouped by assignee */}
      {showReview && (
        <>
          <CardTitle icon={Eye} accent="#7c3aed" title="Needs review" count={reviewTotal} aside="grouped by assignee" />
          <div className="max-h-[min(560px,70vh)] overflow-y-auto">
            <TableHead last="Updated" />
            {reviewGroups.map((g) => {
              const open = openReview.has(g.key);
              return (
                <div key={g.key}>
                  <GroupRow open={open} onToggle={() => toggle(setOpenReview, g.key)}>
                    <UserAvatar name={g.name} avatarUrl={g.avatarUrl} size={20} />
                    <span className="font-sans text-[12px] font-semibold text-pen-foreground">{g.name}</span>
                    <span className="font-mono text-[11px] tabular-nums text-pen-subtle">{g.tickets.length}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      {[...new Set(g.tickets.map((t) => t.status))].slice(0, 2).map((s) => <StatusPill key={s} status={s} />)}
                    </span>
                  </GroupRow>
                  {open && g.tickets.map((t) => (
                    <TicketRow
                      key={t.id}
                      t={t}
                      last={<span className="font-sans text-[11.5px] text-pen-muted">{timeAgo(t.updatedAt)}</span>}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Approval requests — only when pending */}
      {showRequests && (
        <>
          <CardTitle icon={Users} accent="#f59e0b" title="Approval requests" count={joinRequests.length} />
          {joinRequests.map((r) => (
            <JoinRow
              key={r.id}
              req={r}
              onProcessed={(id) => setJoinRequests((p) => p.filter((x) => x.id !== id))}
            />
          ))}
        </>
      )}
      </Card>
    </section>
  );
}
