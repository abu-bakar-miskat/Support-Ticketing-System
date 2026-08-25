"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item";
import { matchesUserListSearch, type UserListPerson } from "@/lib/user-list-person";
import { sidebarDropdownPanelClass } from "@/components/tickets/sidebar-field-styles";
import { Input } from "@/components/ui/input";

export type MemberOption = UserListPerson;

/**
 * Multi-select member picker used for intake-issue assignees (and anywhere the
 * same "assign to" UX is wanted, e.g. SLA policies). Searchable popover with
 * avatar-stack summary. Selection is a list of user ids.
 */
export function IssueAssigneeSelect({
  value,
  onChange,
  members,
  className,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  members: MemberOption[];
  /** Extra classes for the trigger (e.g. "w-full"). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => members.filter((m) => matchesUserListSearch(m, query)),
    [members, query],
  );
  const selected = members.filter((m) => value.includes(m.id));

  function handleOpenChange(o: boolean) {
    setOpen(o);
    if (o) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-sts-card-border bg-sts-surface px-2.5 text-left transition-colors hover:border-sts-id focus:border-sts-id focus:outline-none",
          className,
        )}
      >
        {selected.length === 0 ? (
          <>
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-sts-card text-sts-subtle">
              <UserRound className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-sts-muted">Unassigned</span>
          </>
        ) : (
          <>
            <span className="flex shrink-0 -space-x-1.5">
              {selected.slice(0, 4).map((m) => (
                <span key={m.id} className="rounded-full ring-2 ring-sts-surface">
                  <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.id} size={22} />
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-sts-foreground">
              {selected.map((m) => m.name.split(" ")[0]).join(", ")}
            </span>
          </>
        )}
        <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className={cn(sidebarDropdownPanelClass, "w-(--anchor-width) min-w-[240px] gap-0 overflow-hidden p-0")}
      >
        <div className="border-b border-sts-card-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sts-subtle" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members…"
              className="h-8 border-sts-card-border bg-sts-surface pl-8 font-sans text-[12px]"
            />
          </div>
        </div>
        <ul className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-center font-sans text-[11.5px] text-sts-subtle">
              No members match &ldquo;{query}&rdquo;
            </li>
          ) : (
            filtered.map((member) => {
              const isSelected = value.includes(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => toggle(member.id)}
                    className={cn(
                      "sts-field-dropdown-item rounded-md px-2 py-1.5 font-sans text-[12px]",
                      userListPickerButtonClass,
                      isSelected && "bg-sts-surface",
                    )}
                  >
                    <UserListItem
                      person={member}
                      avatarSize={22}
                      trailing={isSelected ? <Check className="size-3.5 shrink-0 text-sts-blue" /> : null}
                    />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
