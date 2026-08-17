"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { FONT_SIZE_STORAGE_KEY } from "@/lib/font-size";

const FONT_SIZE_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${FONT_SIZE_STORAGE_KEY}');if(s&&s!=='default'){document.documentElement.dataset.penFontSize=s;}}catch(e){}})();`;

/** Applies stored font size before first paint (same pattern as theme). */
export function FontSizeInitScript() {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;

    return (
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: FONT_SIZE_INIT_SCRIPT }}
      />
    );
  });

  return null;
}
