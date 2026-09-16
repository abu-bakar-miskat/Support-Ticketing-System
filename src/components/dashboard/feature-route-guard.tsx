"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { featureKeyForPath } from "@/lib/template-features";

/**
 * Centralized availability gate for feature-restricted routes. Disabled features
 * are already hidden from the nav; this also blocks direct navigation (bookmarks,
 * typed URLs) to a route whose feature isn't in the active set. Renders nothing.
 *
 * The active set is the tenant ∩ department effective feature set
 * (`getEffectiveFeatureKeys`); `"ALL"` means unrestricted → never blocks.
 */
export function FeatureRouteGuard() {
  const { activeFeatureKeys } = useDashboardContext();
  const pathname = usePathname();
  const router = useRouter();
  const notified = useRef(false);

  useEffect(() => {
    if (activeFeatureKeys === "ALL") return;
    const key = featureKeyForPath(pathname);
    if (!key) return;
    if (activeFeatureKeys.includes(key)) return;

    if (!notified.current) {
      notified.current = true;
      toast.error("This feature isn't enabled for this department.");
    }
    router.replace("/");
  }, [activeFeatureKeys, pathname, router]);

  // Reset the notice latch once the user lands on an allowed route.
  useEffect(() => {
    if (activeFeatureKeys === "ALL") return;
    const key = featureKeyForPath(pathname);
    if (!key || activeFeatureKeys.includes(key)) notified.current = false;
  }, [activeFeatureKeys, pathname]);

  return null;
}
