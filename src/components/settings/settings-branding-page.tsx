"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { TenantBranding } from "@/lib/tenant-branding"
import { LogoUploadButton } from "./logo-upload-button"
import { AccentColorField } from "./accent-color-field"
import { normalizeHex } from "@/lib/tenant-accent"
import type { DeptOption } from "./settings-email-templates-page"
import { SidebarColorsEditor, type SidebarColorGroup } from "./sidebar-colors-editor"
import {
  Bell,
  CalendarDays,
  Columns3,
  GanttChart,
  Inbox,
  LayoutDashboard,
  Layers,
  ListChecks,
  Settings,
  UserRound,
  UsersRound,
} from "lucide-react"
import {
  DEPT_SIDEBAR_COLOR_DEFAULTS,
  DEPT_SIDEBAR_GROUP_LABELS,
  SETTINGS_NAV_COLOR_DEFAULTS,
  SETTINGS_NAV_GROUP_LABELS,
  TENANT_SIDEBAR_COLOR_DEFAULTS,
  TENANT_SIDEBAR_GROUP_LABELS,
  parseDeptSidebarColors,
  parseSettingsNavColors,
  parseTenantSidebarColors,
} from "@/lib/sidebar-colors"
import {
  DEPARTMENTS_NAV_GROUPS,
  DEPARTMENTS_OVERVIEW_ITEMS,
} from "@/components/departments/departments-sidebar"

type SidebarColorField = "sidebarColors" | "deptSidebarColors" | "settingsNavColors"
type SidebarColorState = Record<SidebarColorField, Record<string, string>>

/** Colour editors for each grouped sidebar the tenant can theme. */
const SIDEBAR_COLOR_SECTIONS: {
  field: SidebarColorField
  title: string
  description: string
  defaults: Record<string, string>
  parse: (value: unknown) => Record<string, string>
  groups: SidebarColorGroup[]
}[] = [
  {
    field: "sidebarColors",
    title: "All Departments sidebar",
    description: "The tenant-wide sidebar on the departments overview.",
    defaults: TENANT_SIDEBAR_COLOR_DEFAULTS,
    parse: parseTenantSidebarColors,
    groups: [
      { key: "overview", label: TENANT_SIDEBAR_GROUP_LABELS.overview, items: DEPARTMENTS_OVERVIEW_ITEMS },
      ...DEPARTMENTS_NAV_GROUPS.map((g) => ({ ...g, label: TENANT_SIDEBAR_GROUP_LABELS[g.key] })),
    ],
  },
  {
    field: "deptSidebarColors",
    title: "Department sidebar",
    description: "The sidebar inside a department workspace.",
    defaults: DEPT_SIDEBAR_COLOR_DEFAULTS,
    parse: parseDeptSidebarColors,
    groups: [
      { key: "workspace", label: DEPT_SIDEBAR_GROUP_LABELS.workspace, items: [{ label: "Home", icon: LayoutDashboard }] },
      {
        key: "operations",
        label: DEPT_SIDEBAR_GROUP_LABELS.operations,
        items: [
          { label: "Tasks", icon: ListChecks },
          { label: "Projects", icon: Layers },
          { label: "Notifications", icon: Bell },
        ],
      },
      {
        key: "team",
        label: DEPT_SIDEBAR_GROUP_LABELS.team,
        items: [
          { label: "Members", icon: UsersRound },
          { label: "Shared Mailboxes", icon: Inbox },
        ],
      },
      {
        key: "views",
        label: DEPT_SIDEBAR_GROUP_LABELS.views,
        items: [
          { label: "Board", icon: Columns3 },
          { label: "Timeline", icon: GanttChart },
          { label: "Calendar", icon: CalendarDays },
        ],
      },
      {
        key: "account",
        label: DEPT_SIDEBAR_GROUP_LABELS.account,
        items: [
          { label: "My Profile", icon: UserRound },
          { label: "Settings", icon: Settings },
        ],
      },
    ],
  },
  {
    field: "settingsNavColors",
    title: "Settings menu",
    description: "The grouped sub-menu on the Settings pages.",
    defaults: SETTINGS_NAV_COLOR_DEFAULTS,
    parse: parseSettingsNavColors,
    groups: [
      { key: "personal", label: SETTINGS_NAV_GROUP_LABELS.personal, items: [{ label: "Profile" }, { label: "Appearance" }] },
      { key: "workspace", label: SETTINGS_NAV_GROUP_LABELS.workspace, items: [{ label: "Departments" }, { label: "Branding" }] },
      {
        key: "configuration",
        label: SETTINGS_NAV_GROUP_LABELS.configuration,
        items: [{ label: "Projects" }, { label: "SLA policies" }],
      },
      {
        key: "integrations",
        label: SETTINGS_NAV_GROUP_LABELS.integrations,
        items: [{ label: "API keys" }, { label: "Email settings" }],
      },
    ],
  },
]

/** One logo slot (upload, preview, URL). The dark slot previews on a dark plate. */
function LogoField({
  label,
  hint,
  dark = false,
  value,
  onChange,
  onUploaded,
  onError,
}: {
  label: string
  hint?: string
  dark?: boolean
  value: string
  onChange: (url: string) => void
  onUploaded: () => void
  onError: (message: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <label className="block font-sans text-[13px] font-medium text-sts-foreground">{label}</label>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={`${label} preview`}
            className={cn(
              "h-16 w-36 shrink-0 rounded-md border border-sts-card-border object-contain p-2",
              dark ? "bg-[#121212]" : "bg-[#f5f3f0]",
            )}
          />
        ) : (
          <div
            className={cn(
              "flex h-16 w-36 shrink-0 items-center justify-center rounded-md border border-dashed border-sts-card-border font-sans text-[11px]",
              dark ? "bg-[#121212] text-[#8a8580]" : "bg-[#f5f3f0] text-[#8a8580]",
            )}
          >
            No logo
          </div>
        )}
        <div className="flex items-center gap-2">
          <LogoUploadButton
            onUploaded={(url) => {
              onChange(url)
              onUploaded()
            }}
            onError={onError}
          />
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/logo.svg"
        className="mt-1 h-9"
      />
      {hint && <p className="font-sans text-[11px] text-sts-muted">{hint}</p>}
    </div>
  )
}

export function SettingsBrandingPage({
  tenantName,
  initialBranding,
  departments = [],
}: {
  tenantName: string
  initialBranding: TenantBranding
  departments?: DeptOption[]
}) {
  const [displayName, setDisplayName] = useState(initialBranding.displayName ?? "")
  const [logoUrl, setLogoUrl] = useState(initialBranding.logoUrl ?? "")
  const [logoUrlDark, setLogoUrlDark] = useState(initialBranding.logoUrlDark ?? "")
  const [hideLogo, setHideLogo] = useState(initialBranding.hideLogo ?? false)
  // Default on (logo fills the width) unless the tenant explicitly turned it off.
  const [hideDisplayName, setHideDisplayName] = useState(
    initialBranding.hideDisplayName ?? !initialBranding.hideLogo,
  )
  const [accentColor, setAccentColor] = useState(initialBranding.accentColor ?? "")
  const [sidebarColors, setSidebarColors] = useState<SidebarColorState>(() =>
    Object.fromEntries(
      SIDEBAR_COLOR_SECTIONS.map((sec) => [sec.field, sec.parse(initialBranding[sec.field])]),
    ) as SidebarColorState,
  )
  const isDefaultColors = (field: SidebarColorField) => {
    const sec = SIDEBAR_COLOR_SECTIONS.find((x) => x.field === field)!
    return JSON.stringify(sidebarColors[field]) === JSON.stringify(sec.defaults)
  }
  const accentValid = !accentColor.trim() || normalizeHex(accentColor) !== null
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scopeKeyOf = (d: DeptOption) => `${d.id}::${d.subDepartmentId ?? ""}`
  const [scopeKey, setScopeKey] = useState<string>(departments[0] ? scopeKeyOf(departments[0]) : "")
  const selectedScope = departments.find((d) => scopeKeyOf(d) === scopeKey) ?? departments[0]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setStatus(null)
    const res = await fetch("/api/admin/tenant-branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        logoUrlDark: logoUrlDark.trim() || undefined,
        hideLogo,
        hideDisplayName,
        accentColor: normalizeHex(accentColor) ?? undefined,
        // Only store custom palettes — defaults stay implicit so they can evolve.
        ...Object.fromEntries(
          SIDEBAR_COLOR_SECTIONS.map((sec) => [
            sec.field,
            isDefaultColors(sec.field) ? undefined : sidebarColors[sec.field],
          ]),
        ),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Failed to save")
      return
    }
    setStatus("Branding saved.")
    // Re-render the server shell layout so the sidebar header and accent pick up the change.
    router.refresh()
  }

  const [colorSection, setColorSection] = useState<SidebarColorField>("sidebarColors")
  const activeColorSection =
    SIDEBAR_COLOR_SECTIONS.find((sec) => sec.field === colorSection) ?? SIDEBAR_COLOR_SECTIONS[0]
  const labelClass = "block font-sans text-[13px] font-medium text-sts-foreground"
  const cardClass = "rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card"

  return (
    <div className="flex flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-[3px]">
        <h1 className="sts-text-admin-title">Branding</h1>
        <p className="max-w-2xl font-sans text-[13px] text-sts-muted">
          Customize how <span className="font-medium text-sts-foreground">{tenantName}</span> appears
          across the app. These settings apply only to this tenant.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}
      {status && (
        <div className="rounded-lg border border-sts-green/30 bg-sts-green/10 px-3 py-2 font-sans text-[12.5px] text-sts-green">
          {status}
        </div>
      )}

      <form onSubmit={save} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <section className={cn(cardClass, "flex flex-col gap-5 px-[22px] py-5")}>
            <div>
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Identity</h2>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                Name and logo shown in the sidebar.
              </p>
            </div>

            <div className="flex flex-col gap-[5px]">
              <label className={labelClass}>Display name</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={tenantName}
                className="h-9"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <LogoField
                label="Logo — light theme"
                value={logoUrl}
                onChange={setLogoUrl}
                onUploaded={() => {
                  setError(null)
                  setStatus("Logo uploaded. Click “Save branding” to apply.")
                }}
                onError={setError}
              />
              <LogoField
                label="Logo — dark theme"
                hint="Optional. Shown in dark mode; the light logo is used if empty."
                dark
                value={logoUrlDark}
                onChange={setLogoUrlDark}
                onUploaded={() => {
                  setError(null)
                  setStatus("Dark logo uploaded. Click “Save branding” to apply.")
                }}
                onError={setError}
              />
            </div>
            <p className="-mt-2 font-sans text-[11px] text-sts-muted">PNG, JPG, GIF, WebP, or SVG · up to 5 MB.</p>

            <div className="flex flex-col gap-2 rounded-lg border border-sts-card-border bg-sts-surface px-3.5 py-3">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={hideLogo}
                  onChange={(e) => {
                    setHideLogo(e.target.checked)
                    if (e.target.checked) setHideDisplayName(false)
                  }}
                  className="size-4 shrink-0 accent-sts-green"
                />
                <span className="font-sans text-[13px] text-sts-foreground">
                  Hide logo <span className="text-sts-muted">— the display name fills the width.</span>
                </span>
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={hideDisplayName}
                  onChange={(e) => {
                    setHideDisplayName(e.target.checked)
                    if (e.target.checked) setHideLogo(false)
                  }}
                  className="size-4 shrink-0 accent-sts-green"
                />
                <span className="font-sans text-[13px] text-sts-foreground">
                  Hide display name <span className="text-sts-muted">— the logo fills the width.</span>
                </span>
              </label>
            </div>
          </section>

          <section className={cn(cardClass, "px-[22px] py-5")}>
            <AccentColorField value={accentColor} onChange={setAccentColor} />
          </section>
        </div>

        <section className={cn(cardClass, "px-[22px] py-5")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Sidebar colours</h2>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                {activeColorSection.description} Cards and highlights are soft tints of the colour you pick.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDefaultColors(activeColorSection.field)}
              onClick={() =>
                setSidebarColors((current) => ({
                  ...current,
                  [activeColorSection.field]: { ...activeColorSection.defaults },
                }))
              }
            >
              Reset
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-sts-card-border bg-sts-surface p-1">
            {SIDEBAR_COLOR_SECTIONS.map((sec) => {
              const active = sec.field === activeColorSection.field
              return (
                <button
                  key={sec.field}
                  type="button"
                  onClick={() => setColorSection(sec.field)}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-sans text-[12.5px] transition-colors",
                    active
                      ? "bg-sts-card font-medium text-sts-foreground shadow-sm"
                      : "text-sts-muted hover:text-sts-foreground",
                  )}
                >
                  {sec.title}
                </button>
              )
            })}
          </div>

          <div className="mt-4">
            <SidebarColorsEditor
              key={activeColorSection.field}
              groups={activeColorSection.groups}
              value={sidebarColors[activeColorSection.field]}
              onChange={(key, color) =>
                setSidebarColors((current) => ({
                  ...current,
                  [activeColorSection.field]: { ...current[activeColorSection.field], [key]: color },
                }))
              }
            />
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={saving || !accentValid}>
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </form>

      {departments.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label className="sts-text-label">Applies to</label>
          <Select value={scopeKey} onValueChange={(v) => setScopeKey(v ?? (departments[0] ? scopeKeyOf(departments[0]) : ""))}>
            <SelectTrigger className="h-9 w-full max-w-[320px] rounded-full border-sts-card-border bg-sts-bg font-sans text-[12.5px] text-sts-foreground">
              <span>{selectedScope?.name ?? "Select department"}</span>
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={scopeKeyOf(d)} value={scopeKeyOf(d)} className="font-sans text-[12.5px]">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}
