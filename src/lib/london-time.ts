"use client";

import { useEffect, useRef, useState } from "react";

export const LONDON_TZ = "Europe/London";

export function getLondonHour(date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    hour: "numeric",
    hour12: false,
  }).format(date);
  return parseInt(hour, 10);
}

export function getLondonTimeGreeting(date = new Date()): string {
  const hour = getLondonHour(date);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

/** Updates only when the London time-of-day greeting period changes. */
export function useLondonGreeting(): string {
  const [greeting, setGreeting] = useState(() => getLondonTimeGreeting());
  const greetingRef = useRef(greeting);

  useEffect(() => {
    const sync = () => {
      const next = getLondonTimeGreeting();
      if (next !== greetingRef.current) {
        greetingRef.current = next;
        setGreeting(next);
      }
    };

    sync();
    const id = setInterval(sync, 60_000);
    return () => clearInterval(id);
  }, []);

  return greeting;
}
