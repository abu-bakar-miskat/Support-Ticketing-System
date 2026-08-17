"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  PREV_LIGHT_KEY,
  LightVariant,
  DarkVariant,
  isLightVariant,
  isDarkVariant,
} from "@/lib/theme";

const PREV_DARK_KEY = "pen-prev-dark"

type ThemeToggleProps = {
  className?: string;
};

const emptySubscribe = () => () => {};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";

  function handleToggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (isDark) {
      // Restore previous light variant (default to "light")
      const prev =
        typeof window !== "undefined"
          ? (localStorage.getItem(PREV_LIGHT_KEY) as LightVariant | null)
          : null;
      setTheme(isLightVariant(prev ?? "") ? (prev as LightVariant) : "light", e);
    } else {
      // Save current light variant, then restore previous dark variant (default to "dark")
      if (typeof window !== "undefined" && isLightVariant(theme)) {
        try { localStorage.setItem(PREV_LIGHT_KEY, theme) } catch {}
      }
      const prevDark =
        typeof window !== "undefined"
          ? (localStorage.getItem(PREV_DARK_KEY) as DarkVariant | null)
          : null;
      setTheme(isDarkVariant(prevDark ?? "") ? (prevDark as DarkVariant) : "dark", e);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg border transition-colors",
        "border-pen-card-border bg-pen-card text-pen-foreground",
        "hover:bg-pen-secondary-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-accent/60",
        className,
      )}
    >
      <span className="relative size-4" aria-hidden>
        <Sun
          className={cn(
            "absolute inset-0 size-4 transition-all duration-300 ease-out",
            mounted && isDark
              ? "rotate-0 scale-100 opacity-100"
              : "rotate-90 scale-75 opacity-0",
          )}
        />
        <Moon
          className={cn(
            "absolute inset-0 size-4 transition-all duration-300 ease-out",
            mounted && isDark
              ? "-rotate-90 scale-75 opacity-0"
              : "rotate-0 scale-100 opacity-100",
          )}
        />
      </span>
    </button>
  );
}
