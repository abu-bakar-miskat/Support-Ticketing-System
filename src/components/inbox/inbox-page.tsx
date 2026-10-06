"use client";

import { Tip } from "@/components/ui/tooltip";
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AtSign,
  Bell,
  Check,
  CheckCheck,
  GitPullRequest,
  Inbox,
  MessageCircle,
  MoveRight,
  ArrowLeftRight,
  UserCheck,
  Eye,
  ArrowRight,
  Filter,
  Users,
  Sparkles,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api/notifications";
import {
  JoinRequestRow,
  type JoinRequestNotification,
} from "@/components/inbox/join-request-item";
import { createClient } from "@/lib/supabase/client";
import { createNotificationsSubscription } from "@/lib/realtime";
import { useNotificationStore, notifEvents } from "@/store";
import { UserAvatar } from "@/components/ui/user-avatar";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "all" | "unread" | "mentions" | "assigned" | "comments";
type NotificationType =
  | "mention"
  | "assigned"
  | "comment"
  | "pr"
  | "closed"
  | "moved"
  | "review"
  | "intake"
  | "transferred";

export type InboxItem = {
  id: string;
  type: NotificationType;
  actor: string;
  actorInitials: string;
  actorColor: string;
  actorAvatarUrl?: string | null;
  action: string;
  preview?: string;
  previewMuted?: boolean;
  ticketId: string;
  time: string;
  createdAt: string;
  unread: boolean;
  section: "today" | "earlier";
  detail: {
    ticketDbId: string;
    ticketHumanId: string;
    status: string;
    priority: string;
    title: string;
    comment: {
      author: string;
      role: string;
      time: string;
      body: string;
      initials: string;
      color: string;
    } | null;
  };
};

/** Ticket-less system notifications (feature/template/domain approvals, agreement
 *  + mailbox alerts, access grants). Mirrors what the notification panel shows. */
export type GeneralItem = {
  id: string;
  notifType: string;
  actor: string;
  actorInitials: string;
  actorColor: string;
  actorAvatarUrl?: string | null;
  message: string | null;
  time: string;
  createdAt: string;
  unread: boolean;
};

type AnyItem =
  | ({ kind: "ticket" } & InboxItem)
  | ({ kind: "join_request" } & JoinRequestNotification)
  | ({ kind: "general" } & GeneralItem);

// Label + click target per ticket-less notification type. Unknown types still
// render (with a generic label and no navigation) so nothing from the panel is
// ever missing here.
const GENERAL_META: Record<
  string,
  { icon: React.ElementType; color: string; label: string; href: string | null }
> = {
  feature_request_submitted:  { icon: GitPullRequest, color: "#f84201", label: "requested feature approval", href: "/platform/feature-approvals" },
  template_request_submitted: { icon: GitPullRequest, color: "#f84201", label: "requested a template",       href: "/platform/feature-approvals" },
  domain_request_submitted:   { icon: GitPullRequest, color: "#f84201", label: "requested a domain",         href: "/platform/feature-approvals" },
  feature_request_reviewed:   { icon: Sparkles,       color: "#7c3aed", label: "reviewed a feature request", href: null },
  template_request_reviewed:  { icon: Sparkles,       color: "#7c3aed", label: "reviewed a template request", href: null },
  domain_request_reviewed:    { icon: Sparkles,       color: "#7c3aed", label: "reviewed a domain request",  href: null },
  agreement_expiring:         { icon: Clock,          color: "#d97706", label: "agreement expiring",         href: null },
  mailbox_connection_failed:  { icon: Bell,           color: "#dc2626", label: "mailbox connection failed",  href: null },
  access_granted:             { icon: UserCheck,      color: "#059669", label: "granted you access",         href: null },
};

function generalMeta(type: string) {
  return GENERAL_META[type] ?? { icon: Bell, color: "#0a76b9", label: "sent a notification", href: null };
}

type TimeGroup = "today" | "yesterday" | "this_week" | "earlier";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All", icon: Bell },
  { id: "unread", label: "Unread", icon: Sparkles },
  { id: "mentions", label: "Mentions", icon: AtSign },
  { id: "assigned", label: "Assigned", icon: UserCheck },
  { id: "comments", label: "Comments", icon: MessageCircle },
];

const TYPE_META: Record<
  NotificationType,
  { icon: React.ElementType; color: string; label: string; bg: string }
> = {
  mention:  { icon: AtSign,         color: "#0a76b9", bg: "#0a76b9", label: "Mentioned you"    },
  assigned: { icon: UserCheck,      color: "#7c3aed", bg: "#7c3aed", label: "Assigned you"     },
  comment:  { icon: MessageCircle,  color: "#059669", bg: "#059669", label: "Commented"        },
  pr:       { icon: GitPullRequest, color: "#7c3aed", bg: "#7c3aed", label: "Pull request"     },
  closed:   { icon: Check,          color: "#059669", bg: "#059669", label: "Closed ticket"    },
  moved:    { icon: MoveRight,      color: "#0a76b9", bg: "#0a76b9", label: "Status changed"   },
  review:   { icon: Eye,            color: "#dc2626", bg: "#dc2626", label: "Review requested" },
  intake:   { icon: Inbox,          color: "#0a76b9", bg: "#0a76b9", label: "New support ticket" },
  transferred: { icon: ArrowLeftRight, color: "#d97706", bg: "#d97706", label: "Transferred" },
};

const PRIORITY_COLOR: Record<string, string> = {
  Urgent:   "#ff4500",
  Critical: "#dc2626",
  High:     "#f97316",
  Medium:   "#ec4899",
  Low:      "#94a3b8",
};

const PRIORITY_BG: Record<string, string> = {
  Urgent:   "#ff450015",
  Critical: "#dc262615",
  High:     "#f9731615",
  Medium:   "#ec489915",
  Low:      "#94a3b815",
};

const GROUP_LABELS: Record<TimeGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  earlier: "Earlier",
};

function getTimeGroup(createdAt: string): TimeGroup {
  const now = new Date();
  const date = new Date(createdAt);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor((nowDay.getTime() - itemDay.getTime()) / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "yesterday";
  if (diffDays < 7) return "this_week";
  return "earlier";
}

// ── Notification card ─────────────────────────────────────────────────────────

function NotificationCard({
  item,
  onMarkDone,
}: {
  item: InboxItem;
  onMarkDone: (id: string) => void;
}) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const { detail } = item;
  const priorityColor = PRIORITY_COLOR[detail.priority] ?? "#94a3b8";
  const priorityBg = PRIORITY_BG[detail.priority] ?? "#94a3b815";

  return (
    <Link
      href={`/tickets/${detail.ticketDbId}`}
      onClick={() => onMarkDone(item.id)}
      className={cn(
        "group relative flex items-start gap-3.5 rounded-xl border px-4 py-3.5 transition-all hover:shadow-sm",
        item.unread
          ? "border-sts-card-border bg-sts-card hover:border-sts-id/20"
          : "border-transparent bg-sts-surface/30 hover:bg-sts-surface/60",
      )}
    >
      {/* Unread accent bar */}
      {item.unread && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-sts-blue" />
      )}

      {/* Avatar + type badge */}
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={item.actor} avatarUrl={item.actorAvatarUrl} size={32} meta={{}} />
        <span
          className="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border-[1.5px] border-sts-card"
          style={{ backgroundColor: meta.bg }}
        >
          <Icon className="size-[8px] text-white" strokeWidth={2.5} />
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Row 1: actor + action + time */}
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span
            className={cn(
              "shrink-0 font-sans text-[12.5px] font-semibold leading-none",
              item.unread ? "text-sts-foreground" : "text-sts-muted",
            )}
          >
            {item.actor}
          </span>
          <span className="shrink-0 font-sans text-[11.5px] leading-none text-sts-muted">
            {item.action}
          </span>
          <span className="ml-auto shrink-0 font-sans text-[11px] leading-none text-sts-subtle">
            {item.time}
          </span>
        </div>

        {/* Row 2: ticket id + title */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded bg-sts-surface px-1.5 py-px font-mono text-[10.5px] font-semibold text-sts-id">
            {detail.ticketHumanId}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium leading-none",
              item.unread ? "text-sts-foreground" : "text-sts-muted/80",
            )}
          >
            {detail.title}
          </span>
        </div>

        {/* Row 3: status + priority + comment preview */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sts-surface px-2 py-0.5 font-sans text-[10.5px] font-medium text-sts-muted">
            <span className="size-[5px] rounded-full bg-current opacity-50" />
            {detail.status}
          </span>
          <span
            className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-sans text-[10.5px] font-semibold"
            style={{ color: priorityColor, backgroundColor: priorityBg }}
          >
            {detail.priority}
          </span>
          {detail.comment && (
            <span className="min-w-0 flex-1 truncate font-sans text-[11px] text-sts-subtle">
              <span className="mr-1 text-sts-subtle/50">"</span>
              {detail.comment.body}
              <span className="ml-1 text-sts-subtle/50">"</span>
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-col items-end gap-1.5 self-center">
        {item.unread && (
          <Tip label="Mark as read">
            <button
              aria-label="Mark as read"
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onMarkDone(item.id);
              }}
              className="flex size-6 items-center justify-center rounded-full border border-sts-card-border text-sts-subtle transition-all hover:border-sts-blue hover:bg-sts-blue-tint hover:text-sts-blue"
            >
              <Check className="size-3" strokeWidth={2.5} />
            </button>
          </Tip>
        )}
        <span className="flex size-6 items-center justify-center rounded-md border border-sts-card-border text-sts-subtle transition-colors group-hover:border-sts-id/30 group-hover:text-sts-id">
          <ArrowRight className="size-3" strokeWidth={2} />
        </span>
      </div>
    </Link>
  );
}

// ── Time group header ──────────────────────────────────────────────────────────

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.8px] text-sts-subtle">
        {label}
      </span>
      <span className="font-sans text-[11px] text-sts-subtle/60">({count})</span>
      <div className="h-px flex-1 bg-sts-card-border/50" />
    </div>
  );
}

// ── Join request card (upgraded) ───────────────────────────────────────────────

function JoinRequestCard({
  item,
  onSelect,
}: {
  item: JoinRequestNotification;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex w-full items-start gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-all hover:shadow-sm",
        item.unread
          ? "border-sts-card-border bg-sts-card hover:border-sts-id/20"
          : "border-transparent bg-sts-surface/30 hover:bg-sts-surface/60",
      )}
    >
      {item.unread && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-[#059669]" />
      )}
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={item.actor} avatarUrl={item.actorAvatarUrl} size={32} />
        <span className="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border-[1.5px] border-sts-card bg-[#059669]">
          <Users className="size-[8px] text-white" strokeWidth={2.5} />
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 font-sans text-[12.5px] font-semibold text-sts-foreground">
            {item.actor}
          </span>
          <span className="shrink-0 font-sans text-[11.5px] text-sts-muted">
            wants to join
          </span>
          <span className="shrink-0 font-sans text-[11.5px] font-semibold text-sts-foreground">
            {item.subDepartmentName}
          </span>
          <span className="ml-auto shrink-0 font-sans text-[11px] text-sts-subtle">
            {item.time}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {item.requestStatus === "approved" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#05966915] px-2 py-0.5 font-sans text-[10.5px] font-semibold text-[#059669]">
              <Check className="size-3" /> Approved
            </span>
          )}
          {item.requestStatus === "rejected" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 font-sans text-[10.5px] font-semibold text-red-500">
              Rejected
            </span>
          )}
          {item.requestStatus === "pending" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 font-sans text-[10.5px] font-semibold text-amber-600 dark:text-amber-400">
              <Clock className="size-3" /> Pending review
            </span>
          )}
        </div>
      </div>
      <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-md border border-sts-card-border text-sts-subtle transition-colors group-hover:border-sts-id/30 group-hover:text-sts-id">
        <ArrowRight className="size-3" strokeWidth={2} />
      </span>
    </button>
  );
}

// ── General (ticket-less) notification card ────────────────────────────────────

function GeneralCard({
  item,
  onSelect,
}: {
  item: GeneralItem;
  onSelect: () => void;
}) {
  const meta = generalMeta(item.notifType);
  const Icon = meta.icon;
  // Feature/template/domain review messages are prefixed with "approved:"/
  // "rejected:" for other surfaces — strip it for a clean one-liner here.
  const summary = item.message?.replace(/^(approved|rejected):\s*/i, "").trim() || null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex w-full items-start gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-all hover:shadow-sm",
        item.unread
          ? "border-sts-card-border bg-sts-card hover:border-sts-id/20"
          : "border-transparent bg-sts-surface/30 hover:bg-sts-surface/60",
      )}
    >
      {item.unread && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-sts-blue" />
      )}
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={item.actor} avatarUrl={item.actorAvatarUrl} size={32} />
        <span
          className="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border-[1.5px] border-sts-card"
          style={{ backgroundColor: meta.color }}
        >
          <Icon className="size-[8px] text-white" strokeWidth={2.5} />
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span
            className={cn(
              "shrink-0 font-sans text-[12.5px] font-semibold",
              item.unread ? "text-sts-foreground" : "text-sts-muted",
            )}
          >
            {item.actor}
          </span>
          <span className="shrink-0 font-sans text-[11.5px] text-sts-muted">{meta.label}</span>
          <span className="ml-auto shrink-0 font-sans text-[11px] text-sts-subtle">{item.time}</span>
        </div>
        {summary && (
          <p
            className={cn(
              "min-w-0 truncate font-sans text-[12px] leading-none",
              item.unread ? "text-sts-foreground/90" : "text-sts-muted/80",
            )}
          >
            {summary}
          </p>
        )}
      </div>
      <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-md border border-sts-card-border text-sts-subtle transition-colors group-hover:border-sts-id/30 group-hover:text-sts-id">
        <ArrowRight className="size-3" strokeWidth={2} />
      </span>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function InboxPage({
  items,
  joinRequestItems = [],
  generalItems = [],
  currentUserInitials,
  userId,
  initialTab,
}: {
  items: InboxItem[];
  joinRequestItems?: JoinRequestNotification[];
  generalItems?: GeneralItem[];
  currentUserInitials: string;
  userId: string;
  /** From `?tab=` — lets links (e.g. /mentions) open a specific tab. */
  initialTab?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTabState] = useState<TabId>(() =>
    TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "all",
  );
  // Mirror the tab into the URL so reload/back keeps it.
  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [liveItems, setLiveItems] = useState<InboxItem[]>(items);
  const decrement = useNotificationStore((s) => s.decrement);
  const increment = useNotificationStore((s) => s.increment);
  const reset = useNotificationStore((s) => s.reset);
  const initCount = useNotificationStore((s) => s.init);

  const prependNotification = useCallback(async (notifId: string) => {
    try {
      const item: InboxItem = await getNotification(notifId);
      // Ticket-less notifications (join requests, feature/template/domain
      // approvals, …) come back with `detail: null` — they can't render as a
      // ticket card, so don't live-prepend them; they'll appear on next load.
      if (!item?.detail) return;
      setLiveItems((prev) => {
        if (prev.some((p) => p.id === notifId)) return prev;
        return [item, ...prev];
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return notifEvents.subscribe((id) => prependNotification(id));
  }, [prependNotification]);

  useEffect(() => {
    const supabase = createClient();
    return createNotificationsSubscription(
      supabase,
      userId,
      (payload) => {
        const raw = payload as { new?: { id?: string } };
        if (raw?.new?.id) prependNotification(raw.new.id);
      },
      "inbox",
    );
  }, [userId, prependNotification]);

  const allItems: AnyItem[] = [
    ...liveItems.map((i): AnyItem => ({ kind: "ticket", ...i })),
    ...joinRequestItems.map((i): AnyItem => ({ kind: "join_request", ...i })),
    ...generalItems.map((i): AnyItem => ({ kind: "general", ...i })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const all = allItems.map((n) =>
    readIds.has(n.id) ? { ...n, unread: false } : n,
  );
  const unreadCount = all.filter((n) => n.unread).length;

  const filtered = all.filter((n) => {
    if (activeTab === "unread") return n.unread;
    if (activeTab === "mentions")
      return n.kind === "ticket" && n.type === "mention";
    if (activeTab === "assigned")
      return n.kind === "ticket" && n.type === "assigned";
    if (activeTab === "comments")
      return n.kind === "ticket" && n.type === "comment";
    return true;
  });

  // Group by time
  const groups: { key: TimeGroup; items: AnyItem[] }[] = [];
  const groupOrder: TimeGroup[] = ["today", "yesterday", "this_week", "earlier"];
  const grouped = new Map<TimeGroup, AnyItem[]>();
  for (const item of filtered) {
    const g = getTimeGroup(item.createdAt);
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(item);
  }
  for (const key of groupOrder) {
    const g = grouped.get(key);
    if (g && g.length > 0) groups.push({ key, items: g });
  }

  function markDone(id: string) {
    const item = allItems.find((n) => n.id === id);
    const alreadyRead = readIds.has(id) || item?.unread === false;
    if (alreadyRead) return;
    setReadIds((prev) => new Set(prev).add(id));
    decrement();
    startTransition(async () => {
      try {
        await markNotificationRead(id);
      } catch {
        // Roll back so the unread state/counter match the server.
        setReadIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        increment();
        toast.error("Couldn't mark notification as read");
      }
    });
  }

  function openJoinRequest(item: JoinRequestNotification) {
    markDone(item.id);
    router.push("/settings/sub-departments");
  }

  function openGeneral(item: GeneralItem) {
    markDone(item.id);
    const href = generalMeta(item.notifType).href;
    if (href) router.push(href);
  }

  function markAllRead() {
    const previousReadIds = readIds;
    const previousCount = useNotificationStore.getState().unreadCount;
    setReadIds(new Set(allItems.map((n) => n.id)));
    reset();
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
      } catch {
        setReadIds(previousReadIds);
        initCount(previousCount);
        toast.error("Couldn't mark all as read");
      }
    });
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-8 lg:px-12">
      <PageHeader
        className="mb-5"
        title="Notifications"
        icon={Bell}
        iconClassName="text-sts-blue"
        description="Mentions, assignments, comments, and sub department updates"
        badge={
          unreadCount > 0 ? (
            <span className="rounded-full bg-sts-blue px-2 py-0.5 font-sans text-[11.5px] font-semibold text-white dark:text-gray-900">
              {unreadCount} new
            </span>
          ) : undefined
        }
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-card px-3 py-2 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:border-sts-id/30 hover:text-sts-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="mb-5 flex items-center gap-2">
        <Filter className="size-3.5 shrink-0 text-sts-subtle" />
        <div className="flex gap-0.5 self-start rounded-full border border-sts-card-border bg-sts-surface p-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const tabCount =
              tab.id === "unread"
                ? all.filter((n) => n.unread).length
                : tab.id === "mentions"
                  ? all.filter((n) => n.kind === "ticket" && n.type === "mention" && n.unread).length
                  : tab.id === "assigned"
                    ? all.filter((n) => n.kind === "ticket" && n.type === "assigned" && n.unread).length
                    : tab.id === "comments"
                      ? all.filter((n) => n.kind === "ticket" && n.type === "comment" && n.unread).length
                      : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[12px] font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-sts-blue text-white shadow-sm dark:text-gray-900"
                    : "text-sts-muted hover:text-sts-foreground",
                )}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.8} />
                {tab.label}
                {tabCount !== null && tabCount > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px font-sans text-[10px] font-semibold",
                      activeTab === tab.id
                        ? "bg-white/25 text-white dark:text-gray-900"
                        : "bg-sts-blue/10 text-sts-blue",
                    )}
                  >
                    {tabCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        activeTab === "all" ? (
          <EmptyState
            icon={Inbox}
            title="All caught up"
            description="You have no notifications. Mentions, assignments and comments will show up here."
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title={activeTab === "unread" ? "No unread notifications" : `No ${TABS.find((t) => t.id === activeTab)?.label.toLowerCase() ?? "notifications"} yet`}
            description="Nothing matches this tab right now."
            action={
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className="h-8 rounded-full border border-sts-card-border px-3.5 font-sans text-[12px] font-medium text-sts-foreground transition-colors hover:bg-sts-surface"
              >
                Show all notifications
              </button>
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ key, items: groupItems }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <GroupHeader label={GROUP_LABELS[key]} count={groupItems.length} />
              <div className="flex flex-col gap-1.5">
                {groupItems.map((item) =>
                  item.kind === "join_request" ? (
                    <JoinRequestCard
                      key={item.id}
                      item={item}
                      onSelect={() => openJoinRequest(item)}
                    />
                  ) : item.kind === "general" ? (
                    <GeneralCard
                      key={item.id}
                      item={item}
                      onSelect={() => openGeneral(item)}
                    />
                  ) : (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      onMarkDone={markDone}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
