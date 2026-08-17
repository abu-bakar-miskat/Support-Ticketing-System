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

  // Initialize once with the server-rendered count. Using a ref guard so
  // re-renders of the provider (e.g. sidebar collapse) don't reset live increments.
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    init(inboxCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    );
  }, [userId, handleBroadcast]);

  return null;
}
