"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isHexColor } from "@/lib/sidebar-colors";
import {
  GROUP_CARD_CLASS,
  GROUP_ITEM_ACTIVE_CLASS,
  GROUP_ITEM_IDLE_CLASS,
  groupStyle,
} from "@/components/dashboard/sidebar-group-styles";

export type SidebarColorGroup = {
  key: string;
  label: string;
  items: { label: string; icon?: LucideIcon }[];
};

/**
 * Per-group accent pickers plus a live mini-sidebar preview. Used by the
 * platform settings page and the tenant Branding page.
 */
export function SidebarColorsEditor({
  groups,
  value,
  onChange,
}: {
  groups: SidebarColorGroup[];
  value: Record<string, string>;
  onChange: (key: string, color: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex flex-col divide-y divide-sts-card-border/60 self-start rounded-lg border border-sts-card-border bg-sts-surface px-3.5">
        {groups.map((group) => (
          <SidebarColorRow
            key={group.key}
            label={group.label}
            value={value[group.key]}
            onChange={(color) => onChange(group.key, color)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-[5px]">
        <span className="font-sans text-[13px] font-medium text-sts-foreground">Preview</span>
        <div className="flex flex-col gap-2 rounded-lg border border-sts-card-border bg-sts-surface p-3">
          {groups.map((group, gi) => (
            <div
              key={group.key}
              style={groupStyle(value[group.key])}
              className={cn(GROUP_CARD_CLASS, "flex flex-col gap-0.5 p-1.5")}
            >
              <p className="px-[9px] pt-1 pb-0.5 font-sans text-[10px] font-semibold tracking-[1px] text-sts-subtle uppercase">
                {group.label}
              </p>
              {group.items.slice(0, 2).map((item, ii) => (
                <div
                  key={item.label}
                  className={cn(
                    "flex h-7 items-center gap-2 rounded-full px-[9px] font-sans text-[12px]",
                    gi === 0 && ii === 0 ? GROUP_ITEM_ACTIVE_CLASS : GROUP_ITEM_IDLE_CLASS,
                  )}
                >
                  {item.icon && <item.icon className="size-3.5" />}
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Native colour picker + hex field for one group. The hex field keeps a local
 * draft so partial input ("#3b8") doesn't clobber the chosen colour. */
function SidebarColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Re-sync when the colour changes from outside (picker, reset, save).
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="font-sans text-[13px] text-sts-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          aria-label={`${label} colour`}
          className="size-8 cursor-pointer rounded-md border border-sts-card-border bg-transparent p-0.5"
        />
        <Input
          value={draft}
          onChange={(e) => {
            const next = e.target.value.trim();
            setDraft(next);
            if (isHexColor(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => setDraft(value)}
          aria-label={`${label} hex value`}
          className="h-8 w-[96px] font-mono text-[12px]"
          maxLength={7}
        />
      </div>
    </div>
  );
}
