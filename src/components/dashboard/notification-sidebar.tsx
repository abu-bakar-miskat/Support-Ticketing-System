"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, Check, CheckCheck, X, AtSign, MessageCircle,
  MoveRight, UserCheck, Eye, GitPullRequest, Users, Loader2, Inbox, AlertTriangle, ArrowLeftRight, CalendarClock,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/api/notifications";
import { useNotificationStore } from "@/store";
import { Tip } from "@/components/ui/tooltip";

// ── Types ──────────────────────────────────────────────────────────────────────

type RecentNotif = {
  id: string;
  type: string;
  actorName: string;
  actorAvatarUrl: string | null;
  message: string | null;
  unread: boolean;
  time: string;
  ticket: { dbId: string; humanId: string; title: string } | null;
  joinRequest: { id: string; status: string } | null;
};

// ── Icon map ───────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  mention:        { icon: AtSign,         color: "#0a76b9", label: "mentioned you"       },
  assignment:     { icon: UserCheck,      color: "#7c3aed", label: "assigned you"        },
  qa_assignment:  { icon: UserCheck,      color: "#0d9488", label: "assigned you to QA"  },
  comment:        { icon: MessageCircle,  color: "#059669", label: "commented"           },
  pr:             { icon: GitPullRequest, color: "#7c3aed", label: "pull request"        },
  closed:         { icon: Check,          color: "#059669", label: "closed"              },
  status_change:  { icon: MoveRight,      color: "#0a76b9", label: "updated status"      },
  ticket_transferred: { icon: ArrowLeftRight, color: "#d97706", label: "transferred a ticket" },
  review_request: { icon: Eye,            color: "#dc2626", label: "requested review"    },
  join_request:   { icon: Users,          color: "#059669", label: "join request"        },
  intake_manager_alert: { icon: Inbox,    color: "#0a76b9", label: "new support ticket"   },
  assignment_failed_alert: { icon: AlertTriangle, color: "#dc2626", label: "needs a manual assignee" },
  agreement_expiring: { icon: CalendarClock, color: "#d97706", label: "agreement expiring" },
  feature_request_submitted: { icon: GitPullRequest, color: "#f84201", label: "requested feature approval" },
  sla_breach:     { icon: AlertTriangle,  color: "#dc2626", label: "Ticket breached the SLA"     },
  sla_at_risk:    { icon: CalendarClock,  color: "#d97706", label: "Ticket is at risk of breaching SLA" },
};

// ── Single notification row ────────────────────────────────────────────────────

function NotifRow({
  item,
  onClose,
  onMarkRead,
}: {
  item: RecentNotif;
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  const router = useRouter();
  const meta = TYPE_META[item.type] ?? TYPE_META.status_change;
  const Icon = meta.icon;

  // SLA alerts are system-generated: lead with the ticket number, not "System".
  const isSla = item.type === "sla_breach" || item.type === "sla_at_risk";
  const subject = isSla ? (item.ticket?.humanId ?? item.actorName) : item.actorName;

  function handleClick() {
    onMarkRead(item.id);
    onClose();
    if (item.type === "feature_request_submitted") {
      router.push("/platform/feature-approvals");
    } else if (item.ticket) {
      router.push(`/tickets/${item.ticket.dbId}`);
    } else if (item.joinRequest) {
      router.push("/settings/sub-departments");
    }
  }

  // Intake alerts name their source (support form / shared mailbox), which is
  // carried in `message`, e.g. "New Ticket raised from the IT Support Form".
  const isIntakeAlert = item.type === "intake_manager_alert";
  const intakeSource = isIntakeAlert ? item.message?.trim() : null;

  // Build a one-line summary. SLA rows lead with the ticket number, so show
  // just the title there instead of repeating "humanId · title".
  const summary = item.ticket
    ? isSla
      ? item.ticket.title
      : `${item.ticket.humanId} · ${item.ticket.title}`
    : item.message?.replace(/^(approved|rejected):\s*/i, "") ?? "";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-sts-surface/60",
        item.unread && "bg-sts-card",
      )}
    >
      {/* Unread dot */}
      <span className="mt-2 shrink-0">
        {item.unread
          ? <span className="block size-1.5 rounded-full bg-sts-blue" />
          : <span className="block size-1.5" />}
      </span>

      {/* Avatar + type badge */}
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={item.actorName} avatarUrl={item.actorAvatarUrl} size={28} />
        <span
          className="absolute -bottom-[2px] -right-[2px] flex size-[14px] items-center justify-center rounded-full border border-sts-card"
          style={{ backgroundColor: meta.color }}
        >
          <Icon className="size-[7px] text-white" strokeWidth={2.5} />
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={cn(
          "font-sans text-[12px] leading-snug",
          item.unread ? "font-semibold text-sts-foreground" : "text-sts-muted",
        )}>
          {isIntakeAlert && intakeSource ? (
            <>New Ticket raised from the <span className="font-semibold">{intakeSource}</span></>
          ) : (
            <>
              <span className="font-semibold">{subject}</span>
              {" "}{meta.label}
            </>
          )}
        </p>
        {summary && (
          <p className="mt-0.5 truncate font-sans text-[11.5px] text-sts-subtle">
            {summary}
          </p>
        )}
      </div>

      {/* Time */}
      <span className="mt-0.5 shrink-0 font-sans text-[11.5px] text-sts-subtle">
        {item.time}
      </span>
    </button>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function NotificationSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<RecentNotif[]>([]);
  const [loading, setLoading] = useState(false);
  const decrement = useNotificationStore((s) => s.decrement);
  const reset     = useNotificationStore((s) => s.reset);

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/recent");
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchRecent();
  }, [open, fetchRecent]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function markRead(id: string) {
    const item = items.find((n) => n.id === id);
    if (!item?.unread) return;
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, unread: false } : n));
    decrement();
    markNotificationRead(id).catch(() => null);
  }

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
    reset();
    markAllNotificationsRead().catch(() => null);
  }

  const unreadCount = items.filter((n) => n.unread).length;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 sts-overlay-backdrop transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[360px] max-w-[calc(100vw-48px)] flex-col border-l border-sts-card-border bg-sts-bg shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sts-card-border bg-sts-card px-4">
          <Bell className="size-4 shrink-0 text-sts-foreground" strokeWidth={1.8} />
          <span className="flex-1 sts-text-card-title">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-sts-blue px-1.5 py-0.5 font-sans text-[11.5px] font-semibold text-white dark:text-gray-900">
              {unreadCount}
            </span>
          )}
          {unreadCount > 0 && (
            <Tip label="Mark all read">
              <button
                type="button"
                onClick={markAllRead}
                aria-label="Mark all notifications as read"
                className="flex size-7 items-center justify-center rounded-full text-sts-subtle transition-colors hover:bg-sts-surface hover:text-sts-foreground"
              >
                <CheckCheck className="size-3.5" />
              </button>
            </Tip>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-full text-sts-subtle transition-colors hover:bg-sts-surface hover:text-sts-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-sts-muted" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Bell className="size-7 text-sts-subtle" strokeWidth={1.2} />
              <p className="font-sans text-[12.5px] text-sts-muted">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-sts-card-border">
              {items.map((item) => (
                <NotifRow
                  key={item.id}
                  item={item}
                  onClose={onClose}
                  onMarkRead={markRead}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-sts-card-border bg-sts-card px-4 py-3">
          <Link
            href="/inbox"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-sts-card-border py-2 font-sans text-[12px] font-semibold text-sts-foreground transition-colors hover:bg-sts-surface"
          >
            See all notifications
            <MoveRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </>
  );
}
