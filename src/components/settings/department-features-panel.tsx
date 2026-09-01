"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  TEMPLATE_FEATURE_GROUPS,
  TEMPLATE_FEATURE_LABELS,
} from "@/lib/template-features";
import { cn } from "@/lib/utils";

type FeaturesResponse = {
  controlled: boolean;
  featureKeys: string[];
};

/**
 * Super-Admin-only control over a department's feature allowlist. Grant/revoke
 * individual features; the department (and its sub-departments) reflect it in
 * the sidebar + settings. "Controlled off" = every feature visible (fail-open).
 */
export function DepartmentFeaturesPanel({ departmentId }: { departmentId: string }) {
  const [controlled, setControlled] = useState(false);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/departments/${departmentId}/features`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FeaturesResponse | null) => {
        if (!alive || !d) return;
        setControlled(d.controlled);
        setEnabled(new Set(d.featureKeys));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [departmentId]);

  async function persist(nextControlled: boolean, nextEnabled: Set<string>) {
    setSaving(true);
    try {
      await fetch(`/api/admin/departments/${departmentId}/features`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          nextControlled ? { featureKeys: [...nextEnabled] } : { featureKeys: null },
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleControlled(v: boolean) {
    // Turning control on from an empty set seeds with all features so the admin
    // starts from "everything" and revokes down, rather than an empty board.
    const next =
      v && enabled.size === 0
        ? new Set(TEMPLATE_FEATURE_GROUPS.flatMap((g) => g.keys))
        : enabled;
    setControlled(v);
    setEnabled(next);
    void persist(v, next);
  }

  function toggleKey(key: string) {
    const next = new Set(enabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEnabled(next);
    void persist(true, next);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 font-sans text-[12px] text-sts-subtle">
        <Loader2 className="size-3.5 animate-spin" /> Loading features…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={controlled}
          onChange={(e) => toggleControlled(e.target.checked)}
          className="size-4 accent-[var(--sts-id)]"
        />
        <span className="font-sans text-[12.5px] font-medium text-sts-foreground">
          Restrict this department to selected features
        </span>
        {saving && <Loader2 className="size-3.5 animate-spin text-sts-subtle" />}
      </label>

      {!controlled ? (
        <p className="font-sans text-[11.5px] leading-snug text-sts-subtle">
          All features are available. Turn this on to grant/revoke specific
          features for this department and its sub-departments.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {TEMPLATE_FEATURE_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <div key={group.label} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-sts-subtle">
                  <GroupIcon className="size-3.5" />
                  <span className="font-sans text-[10.5px] font-semibold uppercase tracking-wide">
                    {group.label}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {group.keys.map((key) => (
                    <label
                      key={key}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sts-surface",
                        enabled.has(key) ? "text-sts-foreground" : "text-sts-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={enabled.has(key)}
                        onChange={() => toggleKey(key)}
                        disabled={saving}
                        className="size-4 accent-[var(--sts-id)]"
                      />
                      <span className="font-sans text-[12px]">{TEMPLATE_FEATURE_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
