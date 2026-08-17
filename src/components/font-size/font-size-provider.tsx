"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type FontSize,
  applyFontSize,
  parseFontSize,
  persistFontSize,
  readStoredFontSize,
} from "@/lib/font-size";
import { getUserPreferences, updateFontSize as saveFontSizeApi } from "@/lib/api/preferences";

interface FontSizeContextValue {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  ready: boolean;
}

const FontSizeContext = createContext<FontSizeContextValue>({
  fontSize: "default",
  setFontSize: () => {},
  ready: false,
});

export function useFontSize() {
  return useContext(FontSizeContext);
}

export function FontSizeProvider({
  children,
  initialFontSize,
}: {
  children: React.ReactNode;
  initialFontSize?: FontSize;
}) {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    if (typeof window === "undefined") return initialFontSize ?? "default";
    return readStoredFontSize() ?? initialFontSize ?? "default";
  });
  const [ready, setReady] = useState(false);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;

    const stored = readStoredFontSize();
    if (stored) {
      applyFontSize(stored);
      setFontSizeState(stored);
      setReady(true);
      return;
    }

    if (initialFontSize && initialFontSize !== "default") {
      persistFontSize(initialFontSize);
      setFontSizeState(initialFontSize);
      setReady(true);
      return;
    }

    getUserPreferences()
      .then((prefs) => {
        const size = parseFontSize(prefs.fontSize);
        if (size !== "default") {
          persistFontSize(size);
          setFontSizeState(size);
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [initialFontSize]);

  const setFontSize = useCallback((size: FontSize) => {
    persistFontSize(size);
    setFontSizeState(size);
    saveFontSizeApi(size).catch(() => undefined);
  }, []);

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize, ready }}>
      {children}
    </FontSizeContext.Provider>
  );
}
