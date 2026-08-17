"use client";

import { useEffect, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUpdateModuleStatus } from "@/hooks/queries/use-modules";
import type { ModuleStatus } from "@/lib/api/modules";

type ModuleStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  moduleId: string;
  moduleName: string;
  currentStatus: ModuleStatus;
};

const STATUS_OPTIONS: { value: ModuleStatus; label: string; dot: string; hint: string }[] = [
  { value: "planned", label: "Planned", dot: "bg-pen-subtle", hint: "Not started yet" },
  { value: "in_progress", label: "In Progress", dot: "bg-pen-blue", hint: "Actively being worked on" },
  { value: "completed", label: "Completed", dot: "bg-pen-green", hint: "All work wrapped up" },
];

export function ModuleStatusDialog({
  open,
  onOpenChange,
  projectId,
  moduleId,
  moduleName,
  currentStatus,
}: ModuleStatusDialogProps) {
  const [selected, setSelected] = useState<ModuleStatus>(currentStatus);

  useEffect(() => {
    if (open) setSelected(currentStatus);
  }, [open, currentStatus]);

  const mutation = useUpdateModuleStatus({
    onSuccess: () => {
      toast.success(`Module "${moduleName}" status updated`);
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleConfirm() {
    if (selected === currentStatus) {
      onOpenChange(false);
      return;
    }
    mutation.mutate({ id: moduleId, projectId, status: selected });
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 pen-overlay-backdrop" />
        <AlertDialog.Popup className="pen-glass-panel fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-pen-card-border p-6 shadow-2xl">
          <AlertDialog.Title className="pen-text-modal-title">
            Change module status
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 font-sans text-[13px] text-pen-subtle">
            Set the current lifecycle status of “{moduleName}”.
          </AlertDialog.Description>

          <div className="mt-4 flex flex-col gap-1.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected === opt.value
                    ? "border-pen-blue/50 bg-pen-blue-tint"
                    : "border-pen-card-border bg-pen-surface hover:border-pen-subtle/50",
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", opt.dot)} />
                <span className="flex flex-col">
                  <span className="font-sans text-[12.5px] font-medium text-pen-foreground">
                    {opt.label}
                  </span>
                  <span className="font-sans text-[11px] text-pen-subtle">{opt.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
              className="font-sans text-[12px]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={handleConfirm}
              className="gap-1.5 bg-pen-blue font-sans text-[12px] text-white dark:text-gray-900 hover:bg-pen-blue/90"
            >
              {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Update status
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
