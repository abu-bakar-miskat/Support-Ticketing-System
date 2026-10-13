"use client";

import { useState, useSyncExternalStore } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Bump the suffix when the guide changes enough that everyone should see it again. */
const SEEN_KEY = "pen.mailboxes-guide.seen.v2";
const SEEN_CHANGED = "pen-mailboxes-guide-seen";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SEEN_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEEN_CHANGED, onChange);
  };
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true; // storage unavailable — never auto-open
  }
}

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Prepare the domain in Resend",
    body: <>Register and verify your domain directly in Resend. Enable receiving there before connecting a mailbox.</>,
  },
  {
    title: "Add a verified domain",
    body: <>Under <b>Add a verified domain</b>, enter the domain and choose its department or sub-department. We check Resend and only add it if it is already verified.</>,
  },
  {
    title: "Connect a mailbox to a sub-department",
    body: (
      <>
        Open the department, pick the sub-department, then choose <b>Mailbox</b> in its sidebar. The verified domain is
        listed there with <b>Connect mailbox</b>. Enter the address (e.g.{" "}
        <span className="font-mono">support@mail.yourcompany.com</span>), click <b>Check</b>, then <b>Save</b>. Emails
        sent to that address now open tickets for that sub-department.
      </>
    ),
  },
];

const NOTES: React.ReactNode[] = [
  <>
    Mailboxes always belong to a sub-department. A domain registered for a whole department can be used by every
    sub-department in it.
  </>,
  <>
    Managers can request domains already verified in Resend. They ask for one with <b>Request a sending domain</b> on their
    sub-department&apos;s Mailbox page, and the request appears at the top of this page for you to approve or reject.
  </>,
  <>
    <b>Mailbox overview</b> lists every connected mailbox and its health. Click a department, then{" "}
    <b>Manage mailboxes</b> to jump straight to a sub-department&apos;s Mailbox page.
  </>,
];

/**
 * First-visit walkthrough for /departments/mailboxes: what the page is for, how
 * to add a verified domain, and where mailboxes are actually connected. Opens on its
 * own the first time (remembered per browser) and stays reachable from the
 * header button.
 */
export function MailboxesGuide() {
  const [manualOpen, setManualOpen] = useState(false);
  // Server snapshot reports "seen" so the guide never flashes open during SSR.
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  const open = manualOpen || !seen;

  function handleOpenChange(next: boolean) {
    setManualOpen(next);
    if (!next && !seen) {
      try {
        localStorage.setItem(SEEN_KEY, "1");
        window.dispatchEvent(new Event(SEEN_CHANGED));
      } catch {
        /* storage unavailable */
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" onClick={() => setManualOpen(true)}>
        <CircleHelp className="size-4" />
        How it works
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop className="sts-overlay-backdrop fixed inset-0 z-50" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-sts-card-border px-6 py-4">
            <div>
              <Dialog.Title className="sts-text-modal-title">How mailboxes work</Dialog.Title>
              <Dialog.Description className="mt-1 font-sans text-[12.5px] leading-relaxed text-sts-muted">
                Customers email a support address, and the email becomes a ticket for the right sub-department. This
                page is where you set up the email domains those addresses use.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
            <ol className="flex flex-col gap-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-sts-card-border bg-sts-surface font-sans text-[11.5px] font-semibold text-sts-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-sans text-[13px] font-semibold text-sts-foreground">{step.title}</p>
                    <p className="mt-0.5 font-sans text-[12.5px] leading-relaxed text-sts-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="rounded-xl border border-sts-card-border bg-sts-surface px-4 py-3">
              <p className="font-sans text-[12.5px] font-semibold text-sts-foreground">Good to know</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 font-sans text-[12.5px] leading-relaxed text-sts-muted">
                {NOTES.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex justify-end border-t border-sts-card-border px-6 py-3">
            <Dialog.Close render={<Button />}>Got it</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
