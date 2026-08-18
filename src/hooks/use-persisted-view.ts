"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "pen_view_";

/** Shared localStorage keys for persisted tab / layout preferences. */
export const VIEW_KEYS = {
  /** board | list — shared across Board, My Tasks, and project team boards */
  boardLayout: "board-layout",
  /** board | list — project profile team tabs (defaults to board) */
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

  const [value, setValueState] = useState<T>(defaultValue);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === null) return;
      if (validValues && !(validValues as readonly string[]).includes(stored)) return;
      setValueState(stored as T);
    } catch {
      // ignore storage errors
    }
  }, [storageKey, validValues]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // ignore storage errors
      }
    },
    [storageKey],
  );

  return [value, setValue];
}
