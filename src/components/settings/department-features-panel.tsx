"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MARKETPLACE_FEATURE_GROUPS,
  MARKETPLACE_FEATURE_KEYS,
  TEMPLATE_FEATURE_LABELS,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";
import { cn } from "@/lib/utils";

type FeaturesResponse = {
  featureKeys: string[];
};

/**
 * Super-admin grant/revoke for the marketplace features. New departments start
 * with none of these; a tenant admin can also request them, and approving that
 * request checks the same box. Everything not listed here stays available.
 */
export function DepartmentFeaturesPanel({ departmentId }: { departmentId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/departments/${departmentId}/features`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FeaturesResponse | null) => {
        if (!alive || !d) return;
        setEnabled(new Set(d.featureKeys));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [departmentId]);

  async function persist(nextEnabled: Set<string>) {
    const prevEnabled = enabled;
    setEnabled(nextEnabled);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/departments/${departmentId}/features`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKeys: [...nextEnabled] }),
      });
      if (!res.ok) throw new Error("save failed");
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
      router.refresh();
    } catch {
      setEnabled(prevEnabled);
      toast.error("Couldn't update this department's features.");
    } finally {
      setSaving(false);
    }
  }

  function toggleKey(key: MarketplaceFeatureKey) {
    const next = new Set(enabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    void persist(next);
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
      <p className="font-sans text-[11.5px] leading-snug text-sts-subtle">
        A new department starts with whatever is switched on under Platform
        settings. Check one to grant it now, or approve a request from the
        Features marketplace. {MARKETPLACE_FEATURE_KEYS.length} optional
        features — everything else stays available.
        {saving && <Loader2 className="ml-1.5 inline size-3.5 animate-spin" />}
      </p>
      {MARKETPLACE_FEATURE_GROUPS.map((group) => {
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
                    className="size-4 accent-sts-id"
                  />
                  <span className="font-sans text-[12px]">{TEMPLATE_FEATURE_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
