"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

const STORAGE_PREFIX = "pen_hidden_filters_";
const CHANGED = "pen-hidden-filters-changed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

export type HiddenFilters = {
  /** True when the filter with this id should be rendered. */
  isVisible: (id: string) => boolean;
  /** Show/hide a single filter. */
  toggle: (id: string) => void;
  /** Number of filters currently hidden (for the trigger badge). */
  hiddenCount: number;
  /** Reveal every filter again. */
  reset: () => void;
};

/**
 * Persists a per-page set of hidden filter ids in localStorage so users can
 * curate which filter controls are shown. Storing the *hidden* set (rather than
 * the visible one) means filters added later default to visible.
 */
export function usePersistedHiddenFilters(key: string): HiddenFilters {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  const [fallback, setFallback] = useState<string>("[]");
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(storageKey) ?? fallback;
    } catch {
      return fallback;
    }
  }, [storageKey, fallback]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "[]");

  const hidden = useMemo(() => {
    try {
      const parsed = JSON.parse(raw);
      return new Set<string>(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [raw]);

  const write = useCallback(
    (next: Set<string>) => {
      const serialized = JSON.stringify([...next]);
      setFallback(serialized);
      try {
        localStorage.setItem(storageKey, serialized);
        window.dispatchEvent(new Event(CHANGED));
      } catch {
        // Storage can be disabled; this tab keeps its selection via fallback.
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(hidden);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(next);
    },
    [hidden, write],
  );

  const reset = useCallback(() => write(new Set()), [write]);

  const isVisible = useCallback((id: string) => !hidden.has(id), [hidden]);

  return { isVisible, toggle, hiddenCount: hidden.size, reset };
}
