"use client";

import { useFontSize } from "@/components/font-size/font-size-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FONT_SIZE_OPTIONS, type FontSize } from "@/lib/font-size";
import { cn } from "@/lib/utils";

type SettingsAppearanceProps = {
  initialFontSize?: FontSize;
};

export function SettingsAppearancePage({
  initialFontSize = "default",
}: SettingsAppearanceProps) {
  const { fontSize, setFontSize, ready: fontSizeReady } = useFontSize();

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
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <p className="font-sans text-[13px] font-semibold text-pen-foreground">Theme</p>
            <p className="font-sans text-[12px] text-pen-muted">
              Switch between the light and dark appearance.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-5 h-px bg-pen-card-border" />

        <div className="mt-5 flex flex-col gap-[5px]">
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
