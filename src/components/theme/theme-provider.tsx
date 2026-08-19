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
  DEFAULT_THEME,
  normalizeTheme,
  applyTheme as applyThemeFn,
  applyNeutralLight,
  resolveTheme,
} from "@/lib/theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme, event?: React.MouseEvent) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolvedTheme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  });

  // Public support-form pages are always neutral light, never dark — see
  // `.pen-light-scope` and the theme init script.
  const pathname = usePathname();
  const publicLight = pathname?.startsWith("/support") ?? false;

  const resolvedTheme = publicLight ? "light" : resolveTheme(theme);
  // Prevents the useEffect from re-applying the theme when VTA already did it
  const skipNextEffect = useRef(false);

  const setTheme = useCallback((next: Theme, event?: React.MouseEvent) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}

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
  }, []);

  useEffect(() => {
    if (publicLight) {
      applyNeutralLight();
      return;
    }
    if (skipNextEffect.current) {
      skipNextEffect.current = false;
      return;
    }
    applyThemeFn(theme);
  }, [theme, publicLight]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      <ThemeTransition />
      {children}
    </ThemeContext.Provider>
  );
}
