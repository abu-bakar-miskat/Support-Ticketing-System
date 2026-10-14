"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { useAppPathname } from "@/hooks/use-app-pathname";
import { featureKeyForPath } from "@/lib/template-features";

/**
 * Centralized availability gate for feature-restricted routes. Disabled features
 * are already hidden from the nav; this also blocks direct navigation (bookmarks,
 * typed URLs) to a route whose feature isn't in the active set.
 *
 * The browser URL is `/<tenant>/<dept>/board`. The check uses the internal path
 * (`/board`), same as the sidebar. `"ALL"` means unrestricted → never blocks.
 */
export function FeatureRouteGuard({ children }: { children: ReactNode }) {
  const { activeFeatureKeys } = useDashboardContext();
  const pathname = useAppPathname();
  const router = useRouter();
  const notified = useRef(false);
  const key = featureKeyForPath(pathname);
  const blocked =
    activeFeatureKeys !== "ALL" && key != null && !activeFeatureKeys.includes(key);

  useEffect(() => {
    if (!blocked) {
      notified.current = false;
      return;
    }
    if (!notified.current) {
      notified.current = true;
      toast.error("This feature isn't enabled for this department.");
    }
    router.replace("/");
  }, [blocked, router]);

  if (blocked) return null;
  return children;
}
