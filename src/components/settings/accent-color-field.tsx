"use client"

import { cn } from "@/lib/utils"
import { DEFAULT_ACCENT, deriveAccentPalette, normalizeHex } from "@/lib/tenant-accent"

/**
 * Tenant accent color picker with a light/dark preview. Any color is accepted;
 * when one needs shifting for readability the preview shows the adjusted shade
 * and a note explains why.
 */
export function AccentColorField({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const active = value.trim().length > 0
  const valid = !active || normalizeHex(value) !== null
  const palette = deriveAccentPalette(active && valid ? value : DEFAULT_ACCENT)!

  const notes: string[] = []
  if (active && valid) {
    if (palette.adjustedLight) {
      notes.push(`Too light to read on white — light mode uses a darker shade (${palette.light.accent}).`)
    }
    if (palette.adjustedDark) {
      notes.push(`Too dark to read in dark mode — dark mode uses a lighter shade (${palette.dark.accent}).`)
    }
    if (palette.light.fg !== "#ffffff") {
      notes.push("White text is hard to read on this color, so buttons use dark text.")
    }
  }

  return (
    <div className="flex flex-col gap-[5px]">
      <label className="block font-sans text-[13px] font-medium text-sts-foreground">Accent color</label>
      <p className="font-sans text-[12px] text-sts-muted">
        Your brand color — used for buttons, links, highlights and the active sidebar item.
      </p>

      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={normalizeHex(value) ?? DEFAULT_ACCENT}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Accent color picker"
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-sts-card-border bg-sts-surface p-1"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${DEFAULT_ACCENT} (default)`}
          aria-label="Accent color hex"
          aria-invalid={!valid}
          className={cn(
            "h-9 w-full max-w-[220px] min-w-0 rounded-lg border bg-sts-surface px-3 font-mono text-[12.5px] text-sts-foreground outline-none focus:border-sts-id focus:ring-1 focus:ring-sts-id",
            valid ? "border-sts-card-border" : "border-sts-red",
          )}
        />
        {active && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="font-sans text-[11.5px] whitespace-nowrap text-sts-subtle hover:text-sts-foreground"
          >
            Use default
          </button>
        )}
      </div>
      {!valid && (
        <p className="font-sans text-[11.5px] text-sts-red">Enter a hex color like #1d4ed8.</p>
      )}

      <div className="mt-2 grid max-w-[460px] grid-cols-2 gap-2">
        <AccentPreview label="Light" surface="#ffffff" text="#111827" tokens={palette.light} />
        <AccentPreview label="Dark" surface="#000000" text="#f5f3f0" tokens={palette.dark} />
      </div>

      {notes.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 font-sans text-[11.5px] text-sts-muted">
          {notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AccentPreview({
  label,
  surface,
  text,
  tokens,
}: {
  label: string
  surface: string
  text: string
  tokens: { accent: string; fg: string; tint: string; id: string }
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-sts-card-border p-3"
      style={{ background: surface, color: text }}
    >
      <span className="font-sans text-[10.5px] font-semibold tracking-wide uppercase opacity-60">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-7 items-center rounded-full px-3 font-sans text-[12px] font-medium"
          style={{ background: tokens.accent, color: tokens.fg }}
        >
          Button
        </span>
        <span
          className="inline-flex h-6 items-center rounded-full px-2 font-sans text-[11px] font-medium"
          style={{ background: tokens.tint, color: tokens.id }}
        >
          Tag
        </span>
      </div>
      <span className="font-mono text-[11.5px]" style={{ color: tokens.id }}>
        TKT-1042
      </span>
    </div>
  )
}
