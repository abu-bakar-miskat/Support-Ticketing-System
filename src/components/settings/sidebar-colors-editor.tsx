"use client";

import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isHexColor } from "@/lib/sidebar-colors";
import {
  GROUP_CARD_CLASS,
  GROUP_ITEM_IDLE_CLASS,
  GROUP_LABEL_CLASS,
  GROUP_NAV_ACTIVE_CLASS,
  GROUP_NAV_ROW_CLASS,
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
  const [selectedKey, setSelectedKey] = useState(groups[0]?.key ?? "");
  const selected = groups.some((group) => group.key === selectedKey) ? selectedKey : groups[0]?.key;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <span className="font-sans text-[13px] font-medium text-sts-foreground">Preview</span>
        <div className="flex flex-col gap-1.5 rounded-xl border border-sts-card-border bg-sts-surface p-2">
          {groups.map((group) => {
            const active = group.key === selected;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => setSelectedKey(group.key)}
                style={groupStyle(value[group.key])}
                className={cn(
                  GROUP_CARD_CLASS,
                  "flex w-full cursor-pointer flex-col gap-px rounded-xl p-1 text-left",
                  active && "ring-2 ring-[color-mix(in_srgb,var(--grp)_55%,transparent)]",
                )}
              >
                <p className={GROUP_LABEL_CLASS}>{group.label}</p>
                {group.items.map((item, index) => (
                  <span
                    key={item.label}
                    className={cn(
                      GROUP_NAV_ROW_CLASS,
                      active && index === 0 ? GROUP_NAV_ACTIVE_CLASS : GROUP_ITEM_IDLE_CLASS,
                    )}
                  >
                    {item.icon && <item.icon className="size-3.5 shrink-0" />}
                    <span className="truncate">{item.label}</span>
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-sans text-[13px] font-medium text-sts-foreground">Group colours</span>
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const color = value[group.key];
            const active = group.key === selected;
            return (
              <div
                key={group.key}
                style={groupStyle(color)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-sts-card-border bg-sts-surface px-3 py-2.5",
                  active && "ring-2 ring-[color-mix(in_srgb,var(--grp)_55%,transparent)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedKey(group.key)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-sans text-[13px] font-medium text-sts-foreground">
                    {group.label}
                  </span>
                  <span className="mt-0.5 block truncate font-sans text-[12px] text-sts-muted">
                    {group.items.map((item) => item.label).join(", ")}
                  </span>
                </button>
                <SidebarColorRow
                  label={group.label}
                  value={color}
                  onChange={(next) => onChange(group.key, next)}
                  onFocus={() => setSelectedKey(group.key)}
                />
              </div>
            );
          })}
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
  onFocus,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  onFocus?: () => void;
}) {
  const safe = isHexColor(value) ? value : "#808080";
  const [draft, setDraft] = useState(safe);
  const [synced, setSynced] = useState(safe);
  // A hidden colour input can emit a system gray on mount. Only accept a
  // change after the person actually presses the control.
  const touched = useRef(false);
  if (synced !== safe) {
    setSynced(safe);
    setDraft(safe);
  }

  function commit(next: string) {
    if (!touched.current) return;
    const color = next.toLowerCase();
    if (!isHexColor(color) || color === safe) return;
    onChange(color);
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <label className="relative size-8 shrink-0 cursor-pointer">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border border-black/10 shadow-sm"
          style={{ backgroundColor: safe }}
        />
        <input
          type="color"
          value={safe}
          onPointerDown={() => {
            touched.current = true;
          }}
          onChange={(e) => commit(e.target.value)}
          onFocus={onFocus}
          aria-label={`${label} colour`}
          className="absolute inset-0 size-8 cursor-pointer opacity-0"
        />
      </label>
      <Input
        value={draft}
        onChange={(e) => {
          touched.current = true;
          const next = e.target.value.trim();
          setDraft(next);
          if (isHexColor(next)) onChange(next.toLowerCase());
        }}
        onFocus={onFocus}
        onBlur={() => setDraft(safe)}
        aria-label={`${label} hex value`}
        className="h-8 w-[92px] font-mono text-[12px]"
        maxLength={7}
      />
    </div>
  );
}
