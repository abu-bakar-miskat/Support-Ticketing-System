"use client";

import { useEffect, useState } from "react";
import { useFontSize } from "@/components/font-size/font-size-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { Separator } from "@/components/ui/separator";
import { FONT_SIZE_OPTIONS, type FontSize } from "@/lib/font-size";
import { LIGHT_THEME_SWATCHES, DARK_THEME_SWATCHES } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SettingsAppearanceProps = {
  initialFontSize?: FontSize;
};

export function SettingsAppearancePage({
  initialFontSize = "default",
}: SettingsAppearanceProps) {
  const { fontSize, setFontSize, ready: fontSizeReady } = useFontSize();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-[3px]">
        <h1 className="pen-text-admin-title">
          Appearance
        </h1>
        <p className="font-sans text-[13px] text-pen-muted">
          Customize theme and text size across the app.
        </p>
      </header>

      <section
        className={cn(
          "w-full max-w-[920px] rounded-[10px] border border-pen-card-border bg-pen-card",
          "px-[22px] py-5",
        )}
      >
        <div className="flex flex-col gap-[5px]">
          <p className="font-sans text-[13px] font-semibold text-pen-foreground">Theme</p>
          <p className="font-sans text-[12px] text-pen-muted">Choose how the interface looks.</p>
        </div>

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {mounted
            ? `${LIGHT_THEME_SWATCHES.find((s) => s.id === theme)?.label ?? DARK_THEME_SWATCHES.find((s) => s.id === theme)?.label ?? "Dark"} theme active`
            : null}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <div
            role="radiogroup"
            aria-label="Light themes"
            className="flex flex-wrap gap-3"
          >
            {LIGHT_THEME_SWATCHES.map(({ id, label, gradient }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mounted ? theme === id : false}
                aria-label={`${label} theme`}
                onClick={(e) => setTheme(id, e)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md p-0.5 transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-accent focus-visible:ring-offset-1",
                  mounted && theme === id
                    ? "ring-2 ring-pen-accent ring-offset-1 ring-offset-pen-bg"
                    : "hover:ring-1 hover:ring-pen-card-border",
                )}
              >
                <span
                  aria-hidden="true"
                  className="block h-8 w-14 rounded-[5px] border border-pen-card-border"
                  style={{ background: gradient }}
                />
                <span className="font-sans text-[11.5px] text-pen-muted">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2" aria-hidden="true">
              <div className="h-px flex-1 bg-pen-card-border" />
              <span className="font-sans text-[11.5px] font-medium tracking-[0.9px] text-pen-subtle uppercase">
                Dark
              </span>
              <div className="h-px flex-1 bg-pen-card-border" />
            </div>
            <div
              role="radiogroup"
              aria-label="Dark themes"
              className="flex flex-wrap gap-3"
            >
              {DARK_THEME_SWATCHES.map(({ id, label, gradient }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mounted ? theme === id : false}
                  aria-label={`${label} theme`}
                  onClick={(e) => setTheme(id, e)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md p-0.5 transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-accent focus-visible:ring-offset-1",
                    mounted && theme === id
                      ? "ring-2 ring-pen-accent ring-offset-1 ring-offset-pen-bg"
                      : "hover:ring-1 hover:ring-pen-card-border",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="block h-8 w-14 rounded-[5px] border border-pen-card-border"
                    style={{ background: gradient }}
                  />
                  <span className="font-sans text-[11.5px] text-pen-muted">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Separator className="my-5 bg-pen-card-border" />

        <div className="flex flex-col gap-[5px]">
          <p className="font-sans text-[13px] font-semibold text-pen-foreground">Font size</p>
          <p className="font-sans text-[12px] text-pen-muted">
            Resize text to match your preference. Changes apply immediately.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Font size"
          className="mt-4 flex flex-wrap gap-3"
        >
          {FONT_SIZE_OPTIONS.map(({ id, label, description, previewClass }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={fontSizeReady ? fontSize === id : id === initialFontSize}
              aria-label={`${label} font size`}
              onClick={() => setFontSize(id)}
              className={cn(
                "flex min-w-[88px] flex-col items-center gap-1.5 rounded-md border px-3 py-2.5 transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-accent focus-visible:ring-offset-1",
                fontSizeReady && fontSize === id
                  ? "border-pen-blue bg-pen-blue-tint ring-2 ring-pen-accent ring-offset-1 ring-offset-pen-bg"
                  : "border-pen-card-border bg-pen-bg hover:border-pen-blue/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "font-sans font-semibold leading-none text-pen-foreground",
                  previewClass,
                )}
              >
                Aa
              </span>
              <span className="font-sans text-[11.5px] font-medium text-pen-foreground">
                {label}
              </span>
              <span className="font-sans text-[10px] text-pen-subtle">{description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
