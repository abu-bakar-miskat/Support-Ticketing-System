"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/service-worker";

/** Registers the PWA service worker on every visit (required for installability). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    registerServiceWorker().catch(() => undefined);
  }, []);

  return null;
}
