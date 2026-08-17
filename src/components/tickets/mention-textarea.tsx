"use client";

import { useRef, useState } from "react";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item";
import type { MentionableUser } from "@/lib/mentionable-users";
import { cn } from "@/lib/utils";

/**
 * A controlled textarea with `@mention` autocomplete (members + `@all`),
 * mirroring the comment composer. Names are inserted as `@First_Last`; the
 * server parses those handles to create Mention records + notifications.
 */
export function MentionTextarea({
  value,
  onChange,
  teamMembers = [],
  placeholder,
  onSubmit,
  onCancel,
  autoFocus,
  rows = 2,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  teamMembers?: MentionableUser[];
  placeholder?: string;
  /** Enter (without Shift) submits. */
  onSubmit?: () => void;
  /** Escape cancels. */
  onCancel?: () => void;
  autoFocus?: boolean;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const showAll =
    mentionQuery !== null && "all".startsWith(mentionQuery.toLowerCase());
  const filtered =
    mentionQuery !== null
      ? teamMembers.filter((m) =>
          m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
        )
      : [];
  const count = (showAll ? 1 : 0) + filtered.length;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    const before = v.slice(0, e.target.selectionStart ?? v.length);
    const m = before.match(/@(\w*)$/);
    const q = m ? m[1] : null;
    if (q !== mentionQuery) setHighlightedIndex(0);
    setMentionQuery(q);
  }

  function insert(name: string) {
    const el = ref.current;
    if (!el) return;
    const handle = name.replace(/\s+/g, "_");
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos).replace(/@[\w.-]*$/, `@${handle} `);
    const after = value.slice(pos);
    const next = before + after;
    onChange(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const open = mentionQuery !== null && count > 0;
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % count);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + count) % count);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (showAll && highlightedIndex === 0) insert("all");
        else insert(filtered[showAll ? highlightedIndex - 1 : highlightedIndex].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    } else if (e.key === "Escape") {
      onCancel?.();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={className}
      />
      <AnchoredDropdown
        anchorRef={ref}
        open={mentionQuery !== null && count > 0}
        placement="bottom"
        maxHeight={160}
        className="rounded-lg border border-pen-card-border bg-pen-bg shadow-lg"
      >
        <ul className="w-full">
          {showAll && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert("all");
                }}
                className={cn(
                  userListPickerButtonClass,
                  "w-full px-2.5 py-1.5 text-left transition-colors",
                  highlightedIndex === 0 ? "bg-pen-surface" : "hover:bg-pen-surface",
                )}
              >
                <span className="font-semibold text-pen-blue">@all</span>
                <span className="ml-2 text-pen-subtle">
                  — mention everyone ({teamMembers.length})
                </span>
              </button>
            </li>
          )}
          {filtered.map((m, i) => {
            const idx = showAll ? i + 1 : i;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insert(m.name);
                  }}
                  className={cn(
                    userListPickerButtonClass,
                    "px-2.5 py-1.5 transition-colors",
                    idx === highlightedIndex ? "bg-pen-surface" : "hover:bg-pen-surface",
                  )}
                >
                  <UserListItem person={m} avatarSize={22} nameClassName="font-normal" />
                </button>
              </li>
            );
          })}
        </ul>
      </AnchoredDropdown>
    </div>
  );
}
