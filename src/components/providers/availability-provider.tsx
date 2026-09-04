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

// React development mode may mount/replay effects twice, and several consumers
// can request a refresh at once. Keep one network request in flight so those
// refreshes do not queue duplicate database work behind the shared pool.
let availabilityRequest: Promise<AvailabilityMap> | null = null;

async function fetchAvailability(): Promise<AvailabilityMap> {
  if (availabilityRequest) return availabilityRequest;

  availabilityRequest = fetch("/api/availability")
    .then(async (res) => (res.ok ? (await res.json()) as AvailabilityMap : {}))
    .finally(() => {
      availabilityRequest = null;
    });

  return availabilityRequest;
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
