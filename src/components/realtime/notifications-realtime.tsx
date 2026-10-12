"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createNotificationsBroadcastSubscription,
  type NotificationBroadcastPayload,
} from "@/lib/realtime";
import { useAuthStore, useNotificationStore, notifEvents } from "@/store";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { markNotificationRead, getNotification } from "@/lib/api/notifications";
import { getNotificationHref } from "@/lib/notification-routing";
import { showNotificationToast } from "@/components/notifications/notification-toast";

function playNotificationSound() {
  try {
    const audio = new Audio("/sounds/notification.mp3");
    audio.volume = 0.5;
    audio.play().catch(() => undefined);
  } catch { /* ignore */ }
}

export function shouldForceLogoutFromStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function mailboxArrivalFromRecent(item: {
  id: string; type: string; unread: boolean; createdAt: string; message?: string | null;
  ticket?: { dbId: string; humanId: string; title: string } | null;
}, since: number): NotificationBroadcastPayload | null {
  const createdAt = new Date(item.createdAt).getTime();
  if (!item.id.startsWith("mailbox-arrival:") || !item.unread || !Number.isFinite(createdAt) || createdAt < since || !item.ticket) return null;
  return { id: item.id, type: item.type, title: `New shared mailbox ticket ${item.ticket.humanId}`, body: item.ticket.title, ticketDbId: item.ticket.dbId };
}

/** Mounted once in DashboardLayout — keeps the bell badge live and shows toasts. */
export function NotificationsRealtime() {
  const router = useRouter();
  const userId         = useAuthStore((s) => s.user?.id ?? "");
  const { inboxCount } = useDashboardContext();
  const init           = useNotificationStore((s) => s.init);
  const increment      = useNotificationStore((s) => s.increment);
  const decrement      = useNotificationStore((s) => s.decrement);
  const hasInteracted  = useRef(false);
  const seenIds        = useRef(new Set<string>());
  const openedIds      = useRef(new Set<string>());

  const { requestAndSetup } = usePushNotifications();

  // Sync whenever the server count changes — not just on mount. Layout badges
  // can be deferred (first paint has inboxCount 0, the real count hydrates
  // later), so a mount-only init left the bell stuck at 0 + live increments.
  // Re-renders with an unchanged count don't re-run this, so live increments survive.
  useEffect(() => {
    init(inboxCount);
  }, [init, inboxCount]);

  // If permission was already granted in a prior session, treat the page as
  // interacted so sound plays immediately without waiting for a click.
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      hasInteracted.current = true;
    }
  }, []);

  useEffect(() => {
    const mark = () => {
      hasInteracted.current = true;
      // Request push permission + register SW on first real user interaction.
      requestAndSetup().catch(() => undefined);
    };
    window.addEventListener("click", mark, { once: true });
    window.addEventListener("keydown", mark, { once: true });
    return () => {
      window.removeEventListener("click", mark);
      window.removeEventListener("keydown", mark);
    };
  }, [requestAndSetup]);

  // SA-03: force-sign-out on either the near-instant broadcast or the ~55s
  // poll fallback (covers a disconnected/reconnecting Realtime socket) —
  // whichever fires first wins, forceLogoutRef prevents a double redirect.
  const forceLoggedOut = useRef(false);
  const forceLogout = useCallback(async (reason: string) => {
    if (forceLoggedOut.current) return;
    forceLoggedOut.current = true;
    const supabase = createClient();
    await supabase.auth.signOut().catch(() => undefined);
    window.location.href = `/login?error=${encodeURIComponent(reason)}`;
  }, []);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/session/status", { cache: "no-store" });
        // Only an explicit auth rejection invalidates the browser session.
        // A transient 5xx (for example, Supabase/Postgres being unavailable)
        // must not turn an infrastructure failure into a forced logout.
        if (shouldForceLogoutFromStatus(res.status)) {
          await forceLogout("Your session is no longer valid. Please sign in again.");
        }
      } catch {
        // Network hiccup — don't force a logout on a transient fetch failure.
      }
    }, 55_000);
    return () => clearInterval(interval);
  }, [userId, forceLogout]);

  const openNotification = useCallback(async (payload: NotificationBroadcastPayload) => {
    if (!openedIds.current.has(payload.id)) {
      openedIds.current.add(payload.id);
      decrement();
      markNotificationRead(payload.id).catch(() => null);
    }

    let href = getNotificationHref(payload);

    // Fallback for broadcasts that predate ticketDbId in the payload
    if (href === "/inbox" && payload.type !== "join_request") {
      try {
        const item = await getNotification(payload.id);
        if (item.detail?.ticketDbId) {
          href = `/tickets/${item.detail.ticketDbId}`;
        }
      } catch {
        /* keep inbox fallback */
      }
    }

    router.push(href);
  }, [decrement, router]);

  const handleBroadcast = useCallback((p: NotificationBroadcastPayload) => {
    if (!p.id || seenIds.current.has(p.id)) return;
    seenIds.current.add(p.id);

    increment();
    notifEvents.emit(p.id, p.type);

    // Always attempt sound — browser silently drops it if policy blocks it
    // (background/minimized). Web Push handles OS-level sound for those cases.
    if (hasInteracted.current) playNotificationSound();

    showNotificationToast(p, openNotification);
  }, [increment, openNotification]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    return createNotificationsBroadcastSubscription(
      supabase,
      userId,
      handleBroadcast,
      (p) => notifEvents.emit(p.requestId, "join_request_resolved"),
      (reason) => { forceLogout(reason).catch(() => undefined); },
    );
  }, [userId, handleBroadcast, forceLogout]);

  // DB-persisted arrivals from older webhook instances have no app broadcast.
  // Poll the scoped inbox so their badge/toast still reaches an open browser.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let inFlight = false;
    const since = Date.now();
    const sync = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/notifications/recent", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled) return;
        for (const item of data.items ?? []) {
          const payload = mailboxArrivalFromRecent(item, since);
          if (payload) handleBroadcast(payload);
        }
        init(data.unreadCount);
      } catch { /* Next poll retries a disconnected inbox. */ }
      finally { inFlight = false; }
    };
    void sync();
    const interval = setInterval(() => { void sync(); }, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userId, handleBroadcast, init]);

  return null;
}
