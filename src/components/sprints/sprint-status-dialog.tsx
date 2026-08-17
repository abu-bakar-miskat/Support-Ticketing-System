"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { notifyMutationError } from "@/lib/notify-mutation-error";
import { Button } from "@/components/ui/button";
import { useUpdateSprintStatus } from "@/hooks/queries/use-sprints";
import type { SprintStatus } from "@/lib/api/sprints";

type SprintStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprintId: string;
  sprintName: string;
  currentStatus: SprintStatus;
  onSuccess: () => void;
};

const TRANSITION_COPY: Record<
  string,
  { title: string; description: string; confirmLabel: string; next: SprintStatus }
> = {
  planned: {
    title: "Start sprint",
    description:
      "Starting this sprint will move it to the active state. Multiple sprints can run at the same time.",
    confirmLabel: "Start sprint",
    next: "active",
  },
  active: {
    title: "Complete sprint",
    description:
      "Completing this sprint will move it to the completed state. Unfinished tickets will remain in their current status.",
    confirmLabel: "Complete sprint",
    next: "completed",
  },
};

export function SprintStatusDialog({
  open,
  onOpenChange,
  sprintId,
  sprintName,
  currentStatus,
  onSuccess,
}: SprintStatusDialogProps) {
  const copy = TRANSITION_COPY[currentStatus];

  const mutation = useUpdateSprintStatus({
    onSuccess: () => {
      toast.success(`Sprint "${sprintName}" ${copy?.next === "active" ? "started" : "completed"}`);
      onSuccess();
      onOpenChange(false);
    },
    onError: notifyMutationError,
  });

  if (!copy) return null;

  function handleConfirm() {
    mutation.mutate({ id: sprintId, status: copy.next });
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
            {copy.title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 font-sans text-[13px] text-pen-subtle">
            {copy.description}
          </AlertDialog.Description>
          <p className="mt-3 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 font-sans text-[12.5px] text-pen-foreground">
            {sprintName}
          </p>
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
              {copy.confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
