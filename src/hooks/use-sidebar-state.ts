"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pen_sidebar_collapsed";
/** Below this width, default to collapsed when no saved preference (laptop screens). */
const AUTO_COLLAPSE_BELOW = 1280;

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === "true");
    } else {
      setCollapsed(window.innerWidth < AUTO_COLLAPSE_BELOW);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, ready]);

  const toggle = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  return { collapsed, setCollapsed, toggle, ready };
}
