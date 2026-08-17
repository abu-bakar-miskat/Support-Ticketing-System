"use client";

import { Bell } from "lucide-react";
import { toast } from "sonner";
import type { NotificationBroadcastPayload } from "@/lib/realtime";
import { getNotificationHref } from "@/lib/notification-routing";

const TOAST_DURATION_MS = 2000;
const toastIcon = <Bell className="size-4 text-pen-blue" />;
const OS_ICON = "/android-chrome-192x192.png";

/** OS-level notification for when the tab is open but not focused. */
export function showOsNotification(
  payload: NotificationBroadcastPayload,
  onOpen: (payload: NotificationBroadcastPayload) => void,
) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return false;
  }

  try {
    const n = new Notification(payload.title, {
      body: payload.body ?? undefined,
      icon: OS_ICON,
      badge: OS_ICON,
      tag: `pen-${payload.id}`,
      data: { url: getNotificationHref(payload) },
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      onOpen(payload);
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function showNotificationToast(
  payload: NotificationBroadcastPayload,
  onOpen: (payload: NotificationBroadcastPayload) => void,
) {
  // Tab in background / minimized — OS notification so it shows outside the tab
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    if (showOsNotification(payload, onOpen)) return;
  }

  const id = toast(payload.title, {
    description: payload.body ?? undefined,
    icon: toastIcon,
    duration: TOAST_DURATION_MS,
    action: {
      label: "View",
      onClick: () => {
        toast.dismiss(id);
        onOpen(payload);
      },
    },
  });
}
