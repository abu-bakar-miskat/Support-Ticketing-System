"use client";

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
  UserCheck,
  Eye,
  ArrowRight,
  Filter,
  Users,
  Sparkles,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
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
  | "intake";

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

type AnyItem =
  | ({ kind: "ticket" } & InboxItem)
  | ({ kind: "join_request" } & JoinRequestNotification);

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
          ? "border-pen-card-border bg-pen-card hover:border-pen-id/20"
          : "border-transparent bg-pen-surface/30 hover:bg-pen-surface/60",
      )}
    >
      {/* Unread accent bar */}
      {item.unread && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-pen-blue" />
      )}

      {/* Avatar + type badge */}
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={item.actor} avatarUrl={item.actorAvatarUrl} size={32} meta={{}} />
        <span
          className="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border-[1.5px] border-pen-card"
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
              item.unread ? "text-pen-foreground" : "text-pen-muted",
            )}
          >
            {item.actor}
          </span>
          <span className="shrink-0 font-sans text-[11.5px] leading-none text-pen-muted">
            {item.action}
          </span>
          <span className="ml-auto shrink-0 font-sans text-[11px] leading-none text-pen-subtle">
            {item.time}
          </span>
        </div>

        {/* Row 2: ticket id + title */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded bg-pen-surface px-1.5 py-px font-mono text-[10.5px] font-semibold text-pen-id">
            {detail.ticketHumanId}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium leading-none",
              item.unread ? "text-pen-foreground" : "text-pen-muted/80",
            )}
          >
            {detail.title}
          </span>
        </div>

        {/* Row 3: status + priority + comment preview */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-pen-surface px-2 py-0.5 font-sans text-[10.5px] font-medium text-pen-muted">
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
            <span className="min-w-0 flex-1 truncate font-sans text-[11px] text-pen-subtle">
              <span className="mr-1 text-pen-subtle/50">"</span>
              {detail.comment.body}
              <span className="ml-1 text-pen-subtle/50">"</span>
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-col items-end gap-1.5 self-center">
        {item.unread && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onMarkDone(item.id);
            }}
            title="Mark as read"
            className="flex size-6 items-center justify-center rounded-md border border-pen-card-border text-pen-subtle transition-all hover:border-pen-blue hover:bg-pen-blue-tint hover:text-pen-blue"
          >
            <Check className="size-3" strokeWidth={2.5} />
          </button>
        )}
        <span className="flex size-6 items-center justify-center rounded-md border border-pen-card-border text-pen-subtle transition-colors group-hover:border-pen-id/30 group-hover:text-pen-id">
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
      <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.8px] text-pen-subtle">
        {label}
      </span>
      <span className="font-sans text-[11px] text-pen-subtle/60">({count})</span>
      <div className="h-px flex-1 bg-pen-card-border/50" />
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
          ? "border-pen-card-border bg-pen-card hover:border-pen-id/20"
          : "border-transparent bg-pen-surface/30 hover:bg-pen-surface/60",
      )}
    >
      {item.unread && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-[#059669]" />
      )}
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={item.actor} avatarUrl={item.actorAvatarUrl} size={32} />
        <span className="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border-[1.5px] border-pen-card bg-[#059669]">
          <Users className="size-[8px] text-white" strokeWidth={2.5} />
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 font-sans text-[12.5px] font-semibold text-pen-foreground">
            {item.actor}
          </span>
          <span className="shrink-0 font-sans text-[11.5px] text-pen-muted">
            wants to join
          </span>
          <span className="shrink-0 font-sans text-[11.5px] font-semibold text-pen-foreground">
            {item.subDepartmentName}
          </span>
          <span className="ml-auto shrink-0 font-sans text-[11px] text-pen-subtle">
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
      <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-md border border-pen-card-border text-pen-subtle transition-colors group-hover:border-pen-id/30 group-hover:text-pen-id">
        <ArrowRight className="size-3" strokeWidth={2} />
      </span>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function InboxPage({
  items,
  joinRequestItems = [],
  currentUserInitials,
  userId,
}: {
  items: InboxItem[];
  joinRequestItems?: JoinRequestNotification[];
  currentUserInitials: string;
  userId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [liveItems, setLiveItems] = useState<InboxItem[]>(items);
  const decrement = useNotificationStore((s) => s.decrement);
  const reset = useNotificationStore((s) => s.reset);

  const prependNotification = useCallback(async (notifId: string) => {
    try {
      const item: InboxItem = await getNotification(notifId);
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
      await markNotificationRead(id).catch(() => null);
    });
  }

  function openJoinRequest(item: JoinRequestNotification) {
    markDone(item.id);
    router.push("/settings/sub-departments");
  }

  function markAllRead() {
    setReadIds(new Set(allItems.map((n) => n.id)));
    reset();
    startTransition(async () => {
      await markAllNotificationsRead().catch(() => null);
    });
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-8 lg:px-12">
      <PageHeader
        className="mb-5"
        title="Notifications"
        icon={Bell}
        iconClassName="text-pen-blue"
        description="Mentions, assignments, comments, and team updates"
        badge={
          unreadCount > 0 ? (
            <span className="rounded-full bg-pen-blue px-2 py-0.5 font-sans text-[11.5px] font-semibold text-white dark:text-gray-900">
              {unreadCount} new
            </span>
          ) : undefined
        }
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-card px-3 py-2 font-sans text-[11.5px] font-medium text-pen-muted transition-colors hover:border-pen-id/30 hover:text-pen-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="mb-5 flex items-center gap-2">
        <Filter className="size-3.5 shrink-0 text-pen-subtle" />
        <div className="flex gap-0.5 self-start rounded-lg border border-pen-card-border bg-pen-surface p-0.5">
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
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-[12px] font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-pen-blue text-white shadow-sm dark:text-gray-900"
                    : "text-pen-muted hover:text-pen-foreground",
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
                        : "bg-pen-blue/10 text-pen-blue",
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
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-pen-card-border bg-pen-card">
            <Inbox className="size-5 text-pen-subtle" strokeWidth={1.2} />
          </div>
          <div>
            <p className="font-sans text-[13px] font-semibold text-pen-foreground">
              All caught up
            </p>
            <p className="mt-0.5 font-sans text-[12px] text-pen-muted">
              No notifications match this filter.
            </p>
          </div>
        </div>
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
