"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function IntakeSubmissionDeleteButton({
  intakeId,
  submitterName,
  backHref,
}: {
  intakeId: string;
  submitterName: string;
  backHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    const res = await fetch(`/api/intake/submissions/${intakeId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setOpen(false);
      router.push(backHref);
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface px-3 py-1.5 font-sans text-[12px] font-semibold text-pen-muted hover:border-pen-red hover:text-pen-red transition-colors"
        title="Delete submission"
      >
        <Trash2 className="size-3.5" />
        Delete
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete submission?"
        description={`The submission from "${submitterName}" will be permanently deleted. Any linked ticket will remain.`}
        confirmLabel="Delete"
        successMessage="Submission deleted."
        onConfirm={handleDelete}
      />
    </>
  );
}
