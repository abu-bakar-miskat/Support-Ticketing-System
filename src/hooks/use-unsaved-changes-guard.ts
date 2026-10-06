"use client";

import { useEffect } from "react";

/**
 * Warns before the tab is closed or reloaded while a form has unsaved edits.
 * In-app navigation (tabs, scope switches) must be guarded by the caller —
 * the browser prompt only covers unloads.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers require returnValue to be set to show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
