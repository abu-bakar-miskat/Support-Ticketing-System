"use client";

import { useEffect, useRef, useCallback } from "react";
import { getServiceWorkerRegistration } from "@/lib/service-worker";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return view;
}

async function subscribeAndSave(registration: ServiceWorkerRegistration) {
  let sub = await registration.pushManager.getSubscription();

  // If an existing sub was created under a different VAPID key (e.g. preview
  // deploy), subscribe() with the current key fails — drop and recreate.
  if (!sub) {
    try {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch {
      return;
    }
  } else {
    // Ensure the subscription is still valid for this key pair by attempting
    // a fresh subscribe; browsers return the same sub when the key matches.
    try {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch {
      try {
        await sub.unsubscribe();
      } catch {
        /* ignore */
      }
      try {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch {
        return;
      }
    }
  }

  const json = sub.toJSON();
  await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
  });
}

async function registerAndSubscribe() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!VAPID_PUBLIC_KEY) return;
  if (Notification.permission !== "granted") return;

  const registration = await getServiceWorkerRegistration();
  if (!registration) return;
  await subscribeAndSave(registration);
}

/**
 * Registers the service worker if permission is already granted (no dialog),
 * and returns a `requestAndSetup` function to call from a user-interaction
 * handler (click/keydown) which will prompt for permission if still needed.
 */
export function usePushNotifications() {
  const registered = useRef(false);

  // If permission was granted in a previous session, set up immediately — no dialog.
  useEffect(() => {
    if (registered.current) return;
    if (typeof window === "undefined") return;
    if (Notification.permission !== "granted") return;

    registered.current = true;
    registerAndSubscribe().catch(() => undefined);
  }, []);

  // Call this from a user-interaction handler (e.g. first click/keydown).
  // It will request permission if still pending, then register the SW.
  const requestAndSetup = useCallback(async () => {
    if (registered.current) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!VAPID_PUBLIC_KEY) return;

    const permission = Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;

    if (permission !== "granted") return;

    registered.current = true;
    await registerAndSubscribe();
  }, []);

  return { requestAndSetup };
}
