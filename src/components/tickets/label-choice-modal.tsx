"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Ban, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { hexToRgba } from "@/components/tickets/sidebar-field-styles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  NO_LINKED_LABEL_CHOICE,
  hasLinkedLabelSelection,
} from "@/lib/status-label-choice";

const FALLBACK_COLOR = "#94a3b8";

type Props = {
  open: boolean;
  statusLabel: string | null;
  options: { name: string; color: string }[];
  chosen: string | null;
  saving?: boolean;
  loading?: boolean;
  onChoose: (label: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Shown when a status has linked labels — pick one or continue without a label. */
export function LabelChoiceModal({
  open,
  statusLabel,
  options,
  chosen,
  saving = false,
  loading = false,
  onChoose,
  onCancel,
  onConfirm,
}: Props) {
  const noLabelActive = chosen === NO_LINKED_LABEL_CHOICE;

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 pen-overlay-backdrop" />
        <AlertDialog.Popup className="pen-glass-panel fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-pen-card-border p-6 shadow-2xl">
          <AlertDialog.Title className="pen-text-modal-title">
            Pick a label for &ldquo;{statusLabel}&rdquo;
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-1 font-sans text-[13px] text-pen-subtle">
            This status has linked labels. Choose one, or continue without a label.
          </AlertDialog.Description>

          <div className="mt-5 flex flex-wrap gap-2">
            {loading ? (
              <div className="flex w-full items-center gap-2 px-1 py-2 font-sans text-[13px] text-pen-subtle">
                <LoadingSpinner className="size-4 shrink-0" />
                Loading labels…
              </div>
            ) : null}
            {!loading && options.map(({ name, color }) => {
              const accent = color || FALLBACK_COLOR;
              const active = chosen === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChoose(name)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 font-sans text-[13px] font-semibold transition-all",
                    !active && "border-pen-card-border text-pen-muted hover:brightness-105",
                  )}
                  style={
                    active
                      ? {
                          borderColor: hexToRgba(accent, 0.6),
                          backgroundColor: hexToRgba(accent, 0.15),
                          color: accent,
                        }
                      : undefined
                  }
                >
                  <span
                    className="size-[9px] shrink-0 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  {active && <Check className="size-3.5 shrink-0" strokeWidth={2.5} />}
                  {name}
                </button>
              );
            })}

            {!loading && (
            <button
              type="button"
              onClick={() => onChoose(NO_LINKED_LABEL_CHOICE)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 font-sans text-[13px] font-semibold transition-all",
                !noLabelActive && "border-pen-card-border text-pen-muted hover:brightness-105",
                noLabelActive && "border-pen-card-border bg-pen-surface text-pen-foreground",
              )}
            >
              <Ban className="size-3.5 shrink-0 opacity-70" strokeWidth={2.25} />
              {noLabelActive && <Check className="size-3.5 shrink-0" strokeWidth={2.5} />}
              No label
            </button>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className="rounded-lg border border-pen-card-border px-4 py-1.5 font-sans text-[13px] text-pen-muted transition-colors hover:bg-pen-card-border disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !hasLinkedLabelSelection(chosen)}
              onClick={onConfirm}
              className="rounded-lg bg-pen-blue px-4 py-1.5 font-sans text-[13px] font-medium text-white transition-colors hover:bg-pen-blue/90 disabled:opacity-50 dark:text-gray-900"
            >
              {saving ? "Saving…" : "Confirm"}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
