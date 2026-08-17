"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Warm the router cache for common dashboard routes after shell loads. */
const PREFETCH_ROUTES = [
  "/tasks",
  "/board",
  "/projects",
  "/inbox",
  "/mentions",
  "/timeline",
  "/manager",
  "/time",
  "/profile",
];

export function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    const id = window.requestIdleCallback?.(
      () => {
        for (const route of PREFETCH_ROUTES) {
          router.prefetch(route);
        }
      },
      { timeout: 2000 },
    ) ?? window.setTimeout(() => {
      for (const route of PREFETCH_ROUTES) {
        router.prefetch(route);
      }
    }, 500);

    return () => {
      if (typeof id === "number") {
        window.cancelIdleCallback?.(id) ?? clearTimeout(id);
      }
    };
  }, [router]);

  return null;
}
