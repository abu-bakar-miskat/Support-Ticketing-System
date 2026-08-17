"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { ThemeTransition } from "@/components/theme/theme-transition";
import {
  Theme,
  THEME_STORAGE_KEY,
  PREV_LIGHT_KEY,
  isLightVariant,
  isDarkVariant,
  applyTheme as applyThemeFn,
  resolveTheme,
} from "@/lib/theme";

const PREV_DARK_KEY = "pen-prev-dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme, event?: React.MouseEvent) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ?? "dark";
  });

  // Public support-form pages are always neutral light, never dark — see
  // `.pen-light-scope` and the theme init script.
  const pathname = usePathname();
  const publicLight = pathname?.startsWith("/support") ?? false;

  const resolvedTheme = publicLight ? "light" : resolveTheme(theme);
  // Prevents the useEffect from re-applying the theme when VTA already did it
  const skipNextEffect = useRef(false);

  const setTheme = useCallback(
    (next: Theme, event?: React.MouseEvent) => {
      // Persist the previous light/dark variant so the toggle can restore it
      if (isDarkVariant(next) && isLightVariant(theme)) {
        try { localStorage.setItem(PREV_LIGHT_KEY, theme) } catch {}
      }
      if (isLightVariant(next) && isDarkVariant(theme)) {
        try { localStorage.setItem(PREV_DARK_KEY, theme) } catch {}
      }
      try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch {}

      const supportsVTA =
        typeof document !== "undefined" && "startViewTransition" in document;

      if (supportsVTA) {
        // Pin the click origin for the CSS clip-path animation
        const x = event ? `${event.clientX}px` : "50%";
        const y = event ? `${event.clientY}px` : "0%";
        document.documentElement.style.setProperty("--pen-theme-origin-x", x);
        document.documentElement.style.setProperty("--pen-theme-origin-y", y);

        skipNextEffect.current = true;
        document.startViewTransition(() => {
          applyThemeFn(next);
          setThemeState(next);
        });
      } else {
        setThemeState(next);
      }
    },
    [theme],
  );

  useEffect(() => {
    if (publicLight) {
      applyThemeFn("light");
      return;
    }
    if (skipNextEffect.current) {
      skipNextEffect.current = false;
      return;
    }
    applyThemeFn(theme);
  }, [theme, publicLight]);

  useEffect(() => {
    if (publicLight || theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyThemeFn("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, publicLight]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      <ThemeTransition />
      {children}
    </ThemeContext.Provider>
  );
}
