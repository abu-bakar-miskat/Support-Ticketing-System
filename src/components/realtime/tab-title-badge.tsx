"use client";

import { useEffect } from "react";
import { useNotificationStore } from "@/store";

/** Keeps the browser tab title in sync with the unread notification count. */
export function TabTitleBadge() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [unreadCount]);

  return null;
}
