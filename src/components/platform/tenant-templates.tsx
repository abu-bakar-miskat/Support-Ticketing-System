"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CatalogueEntry = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  features: string[];
  status: "active" | "requested" | "available";
};

const sectionCard = "rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card";

/**
 * Super-Admin view of the Template Catalogue for one tenant — replaces the
 * old static Tenant.type editor. Toggling a template only stages a change;
 * nothing is granted/revoked (bypassing the request/approve flow, which
 * still exists for tenant-initiated requests via /settings/templates-catalogue)
 * until Save is pressed.
 */
export function TenantTemplates({
  tenantId,
  initialCatalogue,
}: {
  tenantId: string;
  initialCatalogue: CatalogueEntry[];
}) {
  const [catalogue, setCatalogue] = useState(initialCatalogue);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialCatalogue.filter((t) => t.status === "active").map((t) => t.id)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const activeIds = useMemo(
    () => new Set(catalogue.filter((t) => t.status === "active").map((t) => t.id)),
    [catalogue],
  );
  const isDirty = useMemo(() => {
    if (selected.size !== activeIds.size) return true;
    for (const id of selected) if (!activeIds.has(id)) return true;
    return false;
  }, [selected, activeIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [catalogue, query]);

  const triggerLabel =
    selected.size === 0
      ? "No templates"
      : selected.size === 1
        ? (catalogue.find((t) => t.id === [...selected][0])?.name ?? "1 template")
        : `${selected.size} templates`;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function discard() {
    setSelected(new Set(activeIds));
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);

    const toGrant = [...selected].filter((id) => !activeIds.has(id));
    const toRevoke = [...activeIds].filter((id) => !selected.has(id));

    const results = await Promise.all([
      ...toGrant.map((templateId) =>
        fetch(`/api/admin/tenants/${tenantId}/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId }),
        }).then((res) => ({ res, templateId, action: "grant" as const })),
      ),
      ...toRevoke.map((templateId) =>
        fetch(`/api/admin/tenants/${tenantId}/templates/${templateId}`, { method: "DELETE" }).then((res) => ({
          res,
          templateId,
          action: "revoke" as const,
        })),
      ),
    ]);

    setSaving(false);

    const failed = results.filter((r) => !r.res.ok);
    const succeededIds = new Set(results.filter((r) => r.res.ok).map((r) => r.templateId));

    setCatalogue((prev) =>
      prev.map((t) => {
        if (!succeededIds.has(t.id)) return t;
        return { ...t, status: selected.has(t.id) ? "active" : "available" };
      }),
    );
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of failed) {
        // Revert any change that didn't stick so Save stays available to retry.
        if (r.action === "grant") next.delete(r.templateId);
        else next.add(r.templateId);
      }
      return next;
    });

    if (failed.length > 0) {
      setError(failed.length === 1 ? "Couldn't save 1 template change" : `Couldn't save ${failed.length} template changes`);
    }
  }

  return (
    <section className={sectionCard}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">Templates</h2>
          <p className="mt-1 font-sans text-[11.5px] text-pen-subtle">
            Which Template Catalogue entries this tenant runs. A tenant can run several at once.
          </p>
        </div>
        {isDirty && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      <Popover open={open} onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}>
        <PopoverTrigger
          className={cn(
            "mt-2 flex h-9 w-full items-center gap-2 rounded-lg border bg-pen-card px-2.5 text-left font-sans text-[12.5px] text-pen-foreground transition-colors hover:border-pen-muted",
            isDirty ? "border-pen-blue/60" : "border-pen-card-border",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          {isDirty && <span className="size-1.5 shrink-0 rounded-full bg-pen-blue" aria-hidden />}
          <ChevronDown className="size-3.5 shrink-0 text-pen-subtle" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-80 gap-0 rounded-xl border border-pen-card-border bg-pen-bg p-0 shadow-xl"
        >
          <div className="border-b border-pen-card-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates…"
                className="h-8 pl-8 pr-7 font-sans text-[12.5px]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {catalogue.length === 0 ? (
              <p className="px-2.5 py-3 text-center font-sans text-[11.5px] text-pen-subtle">
                No templates in the catalogue yet.
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-2.5 py-3 text-center font-sans text-[11.5px] text-pen-subtle">
                No templates match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              filtered.map((t) => {
                const checked = selected.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={t.description ?? undefined}
                    onClick={() => toggle(t.id)}
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      checked ? "bg-pen-blue-tint" : "hover:bg-pen-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                        checked
                          ? "border-pen-blue bg-pen-blue"
                          : "border-pen-card-border bg-transparent group-hover:border-pen-muted",
                      )}
                    >
                      {checked && <Check className="size-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-sans text-[12.5px] text-pen-foreground">{t.name}</span>
                      {t.description && (
                        <span className="block truncate font-sans text-[11px] text-pen-subtle">{t.description}</span>
                      )}
                    </span>
                    {t.status === "requested" && !checked && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        Requested
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-pen-card-border px-3 py-2">
            <span className="font-sans text-[11px] text-pen-subtle">
              {selected.size} of {catalogue.length} selected
            </span>
            {isDirty && <span className="font-sans text-[11px] font-medium text-pen-blue">Unsaved changes</span>}
          </div>
        </PopoverContent>
      </Popover>
    </section>
  );
}
