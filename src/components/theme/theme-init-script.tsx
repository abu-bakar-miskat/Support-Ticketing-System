"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { LIGHT_VARIANTS, DARK_VARIANTS, THEME_STORAGE_KEY } from "@/lib/theme";

// Lists are generated from theme.ts so new variants can never be missed here —
// a dark variant missing from this pre-paint script causes a white flash on load.
const LV = JSON.stringify(LIGHT_VARIANTS.filter((v) => v !== "light"));
const DV = JSON.stringify(DARK_VARIANTS.filter((v) => v !== "dark"));

const THEME_INIT_SCRIPT = `(function(){try{if(location.pathname.indexOf('/support')===0){document.documentElement.classList.remove('dark');delete document.documentElement.dataset.theme;return;}var t=localStorage.getItem('${THEME_STORAGE_KEY}');var lv=${LV};var dv=${DV};var isDark=!t||t==='dark'||t==='system'||dv.indexOf(t)!==-1;if(isDark){document.documentElement.classList.add('dark');document.documentElement.dataset.theme=dv.indexOf(t)!==-1?t:'dark';}else if(t&&lv.indexOf(t)!==-1){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

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
