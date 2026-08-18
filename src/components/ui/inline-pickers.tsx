"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { Check, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarVisual } from "@/components/ui/user-avatar";
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item";
import { matchesUserListSearch } from "@/lib/user-list-person";
import { LabelChoiceModal } from "@/components/tickets/label-choice-modal";
import { useLabels } from "@/hooks/queries/use-labels";
import {
  buildLinkedLabelOptions,
  statusHasLinkedLabels,
  chosenLabelForApi,
  hasLinkedLabelSelection,
} from "@/lib/status-label-choice";
import type { SubDepartmentMember } from "@/lib/api/sub-departments";
import type { SubDepartmentStatus } from "@/lib/api/sub-departments";

// ── helpers ──────────────────────────────────────────────────────────────────

function usePortalMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

// Invisible click-catcher that closes the dropdown — unlike the modal/dialog
// backdrop, an inline dropdown should never dim or blur the page behind it.
function DropdownBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9990]"
      onMouseDown={onClose}
    />
  );
}

// ── Status picker ─────────────────────────────────────────────────────────────

interface StatusPickerProps {
  subDepartmentId: string;
  statuses: SubDepartmentStatus[];
  current: string;
  /** Called with the new status label (and the chosen linked label, if the status requires one). */
  onSelect: (status: string, chosenLabel?: string) => void;
  children: (props: {
    ref: React.RefObject<HTMLButtonElement | null>;
    onClick: () => void;
  }) => React.ReactNode;
}

export function InlineStatusPicker({
  statuses,
  current,
  onSelect,
  children,
}: StatusPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingChosenLabel, setPendingChosenLabel] = useState<string | null>(null);
  const mounted = usePortalMounted();
  const { data: labelOptions, isLoading: labelsLoading } = useLabels();
  const departmentLabels = Array.isArray(labelOptions) ? labelOptions : [];

  const open = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const DROPDOWN_W = 176; // w-44
    const DROPDOWN_H = Math.min(statuses.length * 36 + 12, 320);
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= DROPDOWN_H
      ? (r.bottom + 4) / zoom
      : (r.top - DROPDOWN_H - 4) / zoom;
    let left = r.left / zoom;
    if (left + DROPDOWN_W > document.body.offsetWidth - 8) {
      left = r.right / zoom - DROPDOWN_W;
    }
    setPos({ top, left: Math.max(8, left) });
  }, [statuses.length]);

  const close = useCallback(() => setPos(null), []);

  const select = useCallback(
    (label: string) => {
      close();
      const target = statuses.find((s) => s.label === label);
      if (statusHasLinkedLabels(target?.allowedLabels)) {
        // This status requires picking one of its linked labels first.
        setPendingStatus(label);
        setPendingChosenLabel(null);
        return;
      }
      onSelect(label);
    },
    [close, onSelect, statuses],
  );

  const pendingTargetConfig = useMemo(
    () => (pendingStatus ? statuses.find((s) => s.label === pendingStatus) ?? null : null),
    [pendingStatus, statuses],
  );
  const pendingLabelOptions = useMemo(
    () => buildLinkedLabelOptions(pendingTargetConfig?.allowedLabels, departmentLabels),
    [pendingTargetConfig, departmentLabels],
  );

  function cancelPending() {
    setPendingStatus(null);
    setPendingChosenLabel(null);
  }

  function confirmPending() {
    if (!pendingStatus || !hasLinkedLabelSelection(pendingChosenLabel)) return;
    onSelect(pendingStatus, chosenLabelForApi(pendingChosenLabel));
    cancelPending();
  }

  return (
    <>
      {children({ ref: triggerRef, onClick: open })}

      {mounted && pos &&
        createPortal(
          <>
            <DropdownBackdrop onClose={close} />
            <div
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
              className="w-44 rounded-xl border border-pen-card-border bg-pen-card py-1.5 shadow-pen-card backdrop-blur-[var(--pen-glass-blur)]"
            >
              {statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(s.label)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-pen-surface",
                    s.label === current && "bg-pen-blue-tint",
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="flex-1 font-sans text-[12px] text-pen-foreground">
                    {s.label}
                  </span>
                  {s.label === current && (
                    <Check className="size-3 shrink-0 text-pen-blue" />
                  )}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}

      <LabelChoiceModal
        open={!!pendingStatus}
        statusLabel={pendingStatus}
        options={pendingLabelOptions}
        chosen={pendingChosenLabel}
        loading={labelsLoading && pendingLabelOptions.length === 0}
        onChoose={setPendingChosenLabel}
        onCancel={cancelPending}
        onConfirm={confirmPending}
      />
    </>
  );
}

// ── Assignee picker ───────────────────────────────────────────────────────────

interface AssigneePickerProps {
  members: SubDepartmentMember[];
  currentId: string | null | undefined;
  onSelect: (member: SubDepartmentMember | null) => void;
  children: (props: {
    ref: React.RefObject<HTMLButtonElement | null>;
    onClick: () => void;
  }) => React.ReactNode;
}

export function InlineAssigneePicker({
  members,
  currentId,
  onSelect,
  children,
}: AssigneePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [search, setSearch] = useState("");
  const mounted = usePortalMounted();

  const open = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const DROPDOWN_W = 272;
    const DROPDOWN_H = 280;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= DROPDOWN_H
      ? (r.bottom + 4) / zoom
      : (r.top - DROPDOWN_H - 4) / zoom;
    let left = r.left / zoom;
    if (left + DROPDOWN_W > document.body.offsetWidth - 8) {
      left = r.right / zoom - DROPDOWN_W;
    }
    setPos({ top, left: Math.max(8, left) });
    setSearch("");
  }, []);

  const close = useCallback(() => setPos(null), []);

  const select = useCallback(
    (member: SubDepartmentMember | null) => {
      close();
      onSelect(member);
    },
    [close, onSelect],
  );

  const filtered = members.filter((m) => matchesUserListSearch(m, search));

  return (
    <>
      {children({ ref: triggerRef, onClick: open })}

      {mounted && pos &&
        createPortal(
          <>
            <DropdownBackdrop onClose={close} />
            <div
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
              className="w-[272px] rounded-xl border border-pen-card-border bg-pen-card shadow-pen-card backdrop-blur-[var(--pen-glass-blur)]"
            >
              {/* Search */}
              <div className="border-b border-pen-card-border px-3 py-2">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-transparent font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle"
                />
              </div>

              <div className="max-h-52 overflow-y-auto py-1.5">
                {/* Unassign option */}
                <button
                  type="button"
                  onClick={() => select(null)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left justify-start transition-colors hover:bg-pen-surface"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pen-surface">
                    <UserMinus className="size-3 text-pen-subtle" />
                  </span>
                  <span className="font-sans text-[12px] text-pen-muted">Unassign</span>
                </button>

                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => select(m)}
                  className={cn(
                      userListPickerButtonClass,
                      "px-3 py-1.5 transition-colors hover:bg-pen-surface",
                      m.id === currentId && "bg-pen-blue-tint",
                    )}
                  >
                    <UserListItem
                      person={m}
                      avatarSize={22}
                      trailing={
                        m.id === currentId ? (
                          <Check className="size-3 shrink-0 text-pen-blue" />
                        ) : null
                      }
                    />
                  </button>
                ))}

                {filtered.length === 0 && (
                  <p className="px-3 py-2 font-sans text-[12px] text-pen-subtle">
                    No members found
                  </p>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
