"use client";

import { useEffect, useState } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

// Placeholder for the platform command/control modifier — resolved per-OS at
// render time (⌘ on macOS, Ctrl on Windows/Linux).
const MOD = "$mod";

type Shortcut = {
  label: string;
  keys: string[];
};

type ShortcutSection = {
  title: string;
  shortcuts: Shortcut[];
};

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "General",
    shortcuts: [
      { label: "Open command palette", keys: [MOD, "K"] },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { label: "Create task", keys: ["X", "Space"] },
    ],
  },
];

/**
 * The command/control modifier for the current OS. Defaults to ⌘ so the server
 * and first client render match (no hydration mismatch); corrected to "Ctrl" on
 * Windows/Linux right after mount.
 */
function useModifierKey(): string {
  const [mod, setMod] = useState("⌘");
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent;
    setMod(/mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl");
  }, []);
  return mod;
}

function ShortcutRow({ label, keys, modKey }: Shortcut & { modKey: string }) {
  return (
    <div className="flex items-center gap-4 border-t border-sts-surface py-2.5">
      <span className="min-w-0 font-sans text-[12.5px] text-sts-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1" aria-hidden />
      <KbdGroup>
        {keys.map((key) => (
          <Kbd key={key}>{key === MOD ? modKey : key}</Kbd>
        ))}
      </KbdGroup>
    </div>
  );
}

function ShortcutCard({ title, shortcuts, modKey }: ShortcutSection & { modKey: string }) {
  return (
    <section
      className={cn(
        "w-full max-w-[920px] rounded-[6px] border border-sts-card-border bg-sts-card",
        "px-[22px] pt-4 pb-2",
      )}
    >
      <h2 className="pb-1.5 font-sans text-sm font-semibold text-sts-foreground">
        {title}
      </h2>
      <div className="flex flex-col">
        {shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.label} {...shortcut} modKey={modKey} />
        ))}
      </div>
    </section>
  );
}

export function SettingsShortcutsPage() {
  const modKey = useModifierKey();
  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-[3px]">
        <h1 className="sts-text-admin-title">
          Keyboard shortcuts
        </h1>
        <p className="font-sans text-[13px] text-sts-muted">
          Move faster without the mouse.
        </p>
      </header>

      {SHORTCUT_SECTIONS.map((section) => (
        <ShortcutCard key={section.title} {...section} modKey={modKey} />
      ))}
    </div>
  );
}
