"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import {
  THEME_STORAGE_KEY,
  DEFAULT_DARK,
  LEGACY_DARK_VALUES,
} from "@/lib/theme";

// Any stored dark value (AMOLED or a legacy dark variant) resolves to AMOLED;
// everything else — including a fresh visitor with nothing stored — resolves to
// the default Tangerine light theme. Generated from theme.ts so the list can't
// drift; a missing dark value here would cause a white flash on load.
const DARKS = JSON.stringify([DEFAULT_DARK, ...LEGACY_DARK_VALUES]);

const THEME_INIT_SCRIPT = `(function(){try{var r=document.documentElement;if(location.pathname.indexOf('/support')===0){r.classList.remove('dark');delete r.dataset.theme;return;}var t=localStorage.getItem('${THEME_STORAGE_KEY}');var darks=${DARKS};if(darks.indexOf(t)!==-1){r.classList.add('dark');r.dataset.theme='${DEFAULT_DARK}';}else{r.dataset.theme='tangerine';}}catch(e){}})();`;

/** Applies stored theme before first paint. */
export function ThemeInitScript() {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;

    return (
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
      />
    );
  });

  return null;
}
