"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { TenantBranding } from "@/lib/tenant-branding"
import { EmailIdentityCard } from "./settings-email-identity"
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

  const labelClass = "block font-sans text-[13px] font-medium text-sts-foreground"

  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-[3px]">
        <h1 className="sts-text-admin-title">Branding</h1>
        <p className="font-sans text-[13px] text-sts-muted">
          Customize how <span className="font-medium text-sts-foreground">{tenantName}</span> appears
          across the app. These settings apply only to this tenant.
        </p>
      </header>

      {error && (
        <div className="w-full max-w-[920px] rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}
      {status && (
        <div className="w-full max-w-[920px] rounded-lg border border-sts-green/30 bg-sts-green/10 px-3 py-2 font-sans text-[12.5px] text-sts-green">
          {status}
        </div>
      )}

      <section
        className={cn(
          "w-full max-w-[920px] rounded-[6px] border border-sts-card-border bg-sts-card",
          "px-[22px] py-5",
        )}
      >
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-[5px]">
            <label className={labelClass}>Display name</label>
            <p className="font-sans text-[12px] text-sts-muted">
              Shown in the sidebar (falls back to the tenant name).
            </p>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={tenantName}
              className="mt-1 h-9"
            />
          </div>

          <div className="flex flex-col gap-[5px]">
            <label className={labelClass}>Logo</label>
            <p className="font-sans text-[12px] text-sts-muted">
              Upload an image or paste an absolute (https://…) or root-relative (/…) URL.
            </p>

            <div className="mt-1 flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="h-20 w-40 shrink-0 rounded-md border border-sts-card-border object-contain bg-sts-surface p-2"
                />
              ) : (
                <div className="flex h-20 w-40 shrink-0 items-center justify-center rounded-md border border-dashed border-sts-card-border text-[11px] text-sts-muted">
                  Logo
                </div>
              )}

              <LogoUploadButton
                onUploaded={(url) => {
                  setLogoUrl(url)
                  setError(null)
                  setStatus("Logo uploaded. Click “Save branding” to apply.")
                }}
                onError={(m) => setError(m)}
              />
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogoUrl("")}
                >
                  Remove
                </Button>
              )}
            </div>

            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.svg"
              className="mt-2 h-9"
            />
            <p className="font-sans text-[11px] text-sts-muted">
              PNG, JPG, GIF, WebP, or SVG · up to 5 MB.
            </p>
          </div>

          <div className="border-t border-sts-card-border pt-4">
            <AccentColorField value={accentColor} onChange={setAccentColor} />
          </div>

          <div className="flex flex-col gap-[5px] border-t border-sts-card-border pt-4">
            <label className={labelClass}>Sidebar colours</label>
            <p className="font-sans text-[12px] text-sts-muted">
              Accent for each group in the navigation menus. Cards and highlights are soft tints of
              the colour you pick.
            </p>
            <div className="mt-2 flex flex-col gap-5">
              {SIDEBAR_COLOR_SECTIONS.map((sec) => (
                <div key={sec.field} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">
                        {sec.title}
                      </h3>
                      <p className="font-sans text-[12px] text-sts-muted">{sec.description}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isDefaultColors(sec.field)}
                      onClick={() =>
                        setSidebarColors((current) => ({ ...current, [sec.field]: { ...sec.defaults } }))
                      }
                    >
                      Reset
                    </Button>
                  </div>
                  <SidebarColorsEditor
                    groups={sec.groups}
                    value={sidebarColors[sec.field]}
                    onChange={(key, color) =>
                      setSidebarColors((current) => ({
                        ...current,
                        [sec.field]: { ...current[sec.field], [key]: color },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-sts-card-border pt-4">
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
                Hide logo{" "}
                <span className="text-sts-muted">— the display name fills the width.</span>
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
                Hide display name{" "}
                <span className="text-sts-muted">— the logo fills the width.</span>
              </span>
            </label>
          </div>

          <Button type="submit" size="lg" disabled={saving || !accentValid} className="w-fit">
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </form>
      </section>

      {departments.length > 1 ? (
        <div className="flex max-w-[920px] flex-col gap-1.5">
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

      <EmailIdentityCard scope={selectedScope} />
    </div>
  )
}
