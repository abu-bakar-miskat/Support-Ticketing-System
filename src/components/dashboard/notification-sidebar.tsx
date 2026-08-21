"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, Check, CheckCheck, X, AtSign, MessageCircle,
  MoveRight, UserCheck, Eye, GitPullRequest, Users, Loader2, Inbox, AlertTriangle,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/api/notifications";
import { useNotificationStore } from "@/store";

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
  review_request: { icon: Eye,            color: "#dc2626", label: "requested review"    },
  join_request:   { icon: Users,          color: "#059669", label: "join request"        },
  intake_manager_alert: { icon: Inbox,    color: "#0a76b9", label: "new support ticket"   },
  assignment_failed_alert: { icon: AlertTriangle, color: "#dc2626", label: "needs a manual assignee" },
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

  function handleClick() {
    onMarkRead(item.id);
    onClose();
    if (item.ticket) {
      router.push(`/tickets/${item.ticket.dbId}`);
    } else if (item.joinRequest) {
      router.push("/settings/sub-departments");
    }
  }

  // Build a one-line summary
  const summary = item.ticket
    ? `${item.ticket.humanId} · ${item.ticket.title}`
    : item.message?.replace(/^(approved|rejected):\s*/i, "") ?? "";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-pen-surface/60",
        item.unread && "bg-pen-card",
      )}
    >
      {/* Unread dot */}
      <span className="mt-2 shrink-0">
        {item.unread
          ? <span className="block size-1.5 rounded-full bg-pen-blue" />
          : <span className="block size-1.5" />}
      </span>

      {/* Avatar + type badge */}
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={item.actorName} avatarUrl={item.actorAvatarUrl} size={28} />
        <span
          className="absolute -bottom-[2px] -right-[2px] flex size-[14px] items-center justify-center rounded-full border border-pen-card"
          style={{ backgroundColor: meta.color }}
        >
          <Icon className="size-[7px] text-white" strokeWidth={2.5} />
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={cn(
          "font-sans text-[12px] leading-snug",
          item.unread ? "font-semibold text-pen-foreground" : "text-pen-muted",
        )}>
          <span className="font-semibold">{item.actorName}</span>
          {" "}{meta.label}
        </p>
        {summary && (
          <p className="mt-0.5 truncate font-sans text-[11.5px] text-pen-subtle">
            {summary}
          </p>
        )}
      </div>

      {/* Time */}
      <span className="mt-0.5 shrink-0 font-sans text-[11.5px] text-pen-subtle">
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
          "fixed inset-0 z-40 pen-overlay-backdrop transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[360px] max-w-[calc(100vw-48px)] flex-col border-l border-pen-card-border bg-pen-bg shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-pen-card-border bg-pen-card px-4">
          <Bell className="size-4 shrink-0 text-pen-foreground" strokeWidth={1.8} />
          <span className="flex-1 pen-text-card-title">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-pen-blue px-1.5 py-0.5 font-sans text-[11.5px] font-semibold text-white dark:text-gray-900">
              {unreadCount}
            </span>
          )}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              title="Mark all read"
              className="flex size-7 items-center justify-center rounded-md text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
            >
              <CheckCheck className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-md text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-pen-muted" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Bell className="size-7 text-pen-subtle" strokeWidth={1.2} />
              <p className="font-sans text-[12.5px] text-pen-muted">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-pen-card-border">
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
        <div className="shrink-0 border-t border-pen-card-border bg-pen-card px-4 py-3">
          <Link
            href="/inbox"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-pen-card-border py-2 font-sans text-[12px] font-semibold text-pen-foreground transition-colors hover:bg-pen-surface"
          >
            See all notifications
            <MoveRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </>
  );
}
