"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { useEffect, useRef } from "react";

const TRANSITION_DURATION_MS = 300;

export function ThemeTransition() {
  // Track the full theme (not just resolvedTheme) so variant-to-variant switches
  // (e.g. midnight → dracula) also get the smooth CSS transition.
  const { theme } = useTheme();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!theme) return;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const root = document.documentElement;
    root.classList.add("theme-transition");

    const timeout = window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, TRANSITION_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [theme]);

  return null;
}
