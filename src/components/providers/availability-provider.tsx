"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserUnavailability } from "@/lib/availability";

type AvailabilityMap = Record<string, UserUnavailability>;

type AvailabilityContextValue = {
  map: AvailabilityMap;
  refresh: () => void;
  get: (userId: string | null | undefined) => UserUnavailability | null;
};

const AvailabilityContext = createContext<AvailabilityContextValue | null>(null);

async function fetchAvailability(): Promise<AvailabilityMap> {
  const res = await fetch("/api/availability");
  if (!res.ok) return {};
  return (await res.json()) as AvailabilityMap;
}

export function AvailabilityProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<AvailabilityMap>({});

  const refresh = useCallback(() => {
    void fetchAvailability().then(setMap).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const value = useMemo<AvailabilityContextValue>(
    () => ({
      map,
      refresh,
      get: (userId) => (userId ? map[userId] ?? null : null),
    }),
    [map, refresh],
  );

  return (
    <AvailabilityContext.Provider value={value}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useUnavailability(userId?: string | null): UserUnavailability | null {
  const ctx = useContext(AvailabilityContext);
  if (!ctx || !userId) return null;
  return ctx.get(userId);
}

export function useAvailabilityRefresh(): () => void {
  const ctx = useContext(AvailabilityContext);
  return ctx?.refresh ?? (() => {});
}
