"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import {
  THEME_STORAGE_KEY,
  DEFAULT_LIGHT,
  DEFAULT_DARK,
  DARK_VARIANTS,
} from "@/lib/theme";

// Light is the default: only an explicitly-stored dark variant resolves to
// dark; everything else — including a fresh visitor with nothing stored —
// resolves to the clean light theme. Generated from theme.ts so the list can't
// drift; a missing dark value here would cause a white flash for dark users.
const DARKS = JSON.stringify(DARK_VARIANTS);

const THEME_INIT_SCRIPT = `(function(){try{var r=document.documentElement;if(location.pathname.indexOf('/support')===0){r.classList.remove('dark');delete r.dataset.theme;return;}var t=localStorage.getItem('${THEME_STORAGE_KEY}');var darks=${DARKS};if(darks.indexOf(t)!==-1){r.classList.add('dark');r.dataset.theme='${DEFAULT_DARK}';}else{r.dataset.theme='${DEFAULT_LIGHT}';}}catch(e){}})();`;

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
