"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Palette, RotateCcw, Save } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import {
  PLATFORM_SIDEBAR_COLOR_DEFAULTS,
  PLATFORM_SIDEBAR_GROUP_LABELS,
  type PlatformSidebarColors,
} from "@/lib/sidebar-colors";
import { PLATFORM_NAV_GROUPS } from "@/components/platform/platform-sidebar";
import { SidebarColorsEditor } from "@/components/settings/sidebar-colors-editor";

export function PlatformBrandingPage({
  sidebarGroupColors,
}: {
  sidebarGroupColors: PlatformSidebarColors;
}) {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // ── Sidebar colours ──────────────────────────────────────────────────────────
  const [sidebarColors, setSidebarColors] = useState<PlatformSidebarColors>(sidebarGroupColors);
  const [sidebarBaseline, setSidebarBaseline] = useState<PlatformSidebarColors>(sidebarGroupColors);
  const [savingSidebar, setSavingSidebar] = useState(false);

  const sidebarDirty = JSON.stringify(sidebarColors) !== JSON.stringify(sidebarBaseline);
  const sidebarIsDefault = JSON.stringify(sidebarColors) === JSON.stringify(PLATFORM_SIDEBAR_COLOR_DEFAULTS);

  async function saveSidebarColors() {
    setSavingSidebar(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarGroupColors: sidebarColors }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to save sidebar colours");
        return;
      }
      setSidebarColors(body.sidebarGroupColors);
      setSidebarBaseline(body.sidebarGroupColors);
      setStatus("Sidebar colours saved");
      // The sidebar lives in the platform layout — re-render it with the new colours.
      router.refresh();
    } catch {
      setError("Failed to save sidebar colours");
    } finally {
      setSavingSidebar(false);
    }
  }

  useUnsavedChangesGuard(sidebarDirty);

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={Palette}
          title="Branding"
          description="Look and feel of the platform admin area. Changes are recorded in the Activity Log."
        />

        {(error || status) && (
          <div className="mt-5 space-y-2">
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
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card">
          <div className="flex items-center gap-3 border-b border-sts-card-border px-[22px] py-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sts-blue-tint text-sts-blue">
              <Palette className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Sidebar colours</h2>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                Accent colour for each group in the platform sidebar. Cards and highlights are soft tints of the colour you pick.
              </p>
            </div>
          </div>

          <div className="px-[22px] py-5">
            <SidebarColorsEditor
              groups={PLATFORM_NAV_GROUPS.map((g) => ({ ...g, label: PLATFORM_SIDEBAR_GROUP_LABELS[g.key] }))}
              value={sidebarColors}
              onChange={(key, color) => setSidebarColors((current) => ({ ...current, [key]: color }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-sts-card-border bg-sts-surface/40 px-[22px] py-3.5">
            <Button
              variant="outline"
              disabled={sidebarIsDefault || savingSidebar}
              onClick={() => setSidebarColors(PLATFORM_SIDEBAR_COLOR_DEFAULTS)}
            >
              <RotateCcw className="size-4" />
              Reset to default
            </Button>
            <Button disabled={!sidebarDirty || savingSidebar} onClick={saveSidebarColors}>
              {savingSidebar ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save colours
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
