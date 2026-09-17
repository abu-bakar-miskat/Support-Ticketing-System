"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Shown on the login page when the entered email has no matching Profile. */
export function NoAccountDialog({ email, next }: { email: string; next: string }) {
  const router = useRouter();

  function close() {
    router.replace(`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
  }

  return (
    <AlertDialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 sts-overlay-backdrop" />
        <AlertDialog.Popup className="sts-glass-panel fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sts-card-border p-6 shadow-2xl">
          <AlertDialog.Title className="sts-text-modal-title">
            No account found
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 font-sans text-[13px] leading-relaxed text-sts-subtle">
            We couldn&apos;t find a workspace account for{" "}
            <span className="font-medium text-sts-foreground">{email}</span>.
            Ask your department or tenant admin to invite you, then try
            signing in again.
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end">
            <Button onClick={close}>Got it</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
