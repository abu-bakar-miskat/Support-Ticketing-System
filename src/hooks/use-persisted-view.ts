"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_PREFIX = "pen_view_";
const VIEW_CHANGED = "pen-view-changed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(VIEW_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VIEW_CHANGED, onChange);
  };
}

/** Shared localStorage keys for persisted tab / layout preferences. */
export const VIEW_KEYS = {
  /** board | list — shared across Board, My Tasks, and project subDepartment boards */
  boardLayout: "board-layout",
  /** board | list — project profile subDepartment tabs (defaults to board) */
  projectSubDepartmentLayout: "project-team-layout",
  /** mine | all | unassigned | drafts — Tasks page scope */
  tasksScope: "tasks-scope",
  /** mine | all — Projects page scope */
  projectsScope: "projects-scope",
  /** list | cards — Projects page layout */
  projectsLayout: "projects-layout",
  /** overview | list — Sprints page */
  sprintsLayout: "sprints-layout",
} as const;

export function usePersistedView<T extends string>(
  key: string,
  defaultValue: T,
  validValues?: readonly T[],
): [T, (value: T) => void] {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  const [fallback, setFallback] = useState<T>(defaultValue);
  const getSnapshot = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null && (!validValues || (validValues as readonly string[]).includes(stored))) return stored as T;
    } catch {
      // Storage can be disabled; retain this tab's selection.
    }
    return fallback;
  }, [storageKey, validValues, fallback]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => defaultValue);

  useEffect(() => {
    if (key !== VIEW_KEYS.tasksScope) return;
    try {
      document.cookie = `pen_tasks_scope=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=31536000`;
    } catch { /* Cookies may be disabled. */ }
  }, [key, value]);

  const setValue = useCallback(
    (next: T) => {
      setFallback(next);
      try {
        localStorage.setItem(storageKey, next);
        window.dispatchEvent(new Event(VIEW_CHANGED));
        if (key === VIEW_KEYS.tasksScope) document.cookie = `pen_tasks_scope=${encodeURIComponent(next)}; Path=/; SameSite=Lax; Max-Age=31536000`;
      } catch {
        // ignore storage errors
      }
    },
    [key, storageKey],
  );

  return [value, setValue];
}
