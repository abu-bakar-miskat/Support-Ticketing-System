"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Loader2, LogIn, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  deleteMailboxConnection,
  mailboxOAuthStartUrl,
  recheckMailboxConnection,
  type MailboxConnection,
} from "@/lib/api/admin";
import { reconnectMailbox, useMailboxOAuthResult } from "@/components/mailbox/mailbox-provider-connect";

const STATUS: Record<MailboxConnection["status"], { label: string; chip: string; dot: string }> = {
  ACTIVE: { label: "Connected", chip: "bg-sts-green/10 text-sts-green", dot: "bg-sts-green" },
  AUTH_ERROR: {
    label: "Sign-in expired",
    chip: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    dot: "bg-red-500",
  },
  UNREACHABLE: {
    label: "Not responding",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    dot: "bg-amber-500",
  },
};

/**
 * The organisation's (tenant's) Microsoft 365 mailbox. Send-only: it never
 * opens tickets. It sends tenant-wide email (invitations, notifications) and is
 * the fallback sender for any department or sub-department without its own
 * mailbox; customer replies to it still thread onto their tickets.
 */
export function TenantMailboxPanel({ initial }: { initial: MailboxConnection | null }) {
  const router = useRouter();
  const [mailbox, setMailbox] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Back from the Microsoft sign-in: re-read the server-rendered mailbox.
  useMailboxOAuthResult(() => router.refresh());

  // Keep in sync when the server re-renders after a connect/reconnect.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setMailbox(initial);
  }

  function connect() {
    window.location.assign(mailboxOAuthStartUrl("microsoft", { scopeType: "TENANT", returnTo: window.location.pathname }));
  }

  async function check() {
    if (!mailbox) return;
    setChecking(true);
    try {
      setMailbox(await recheckMailboxConnection(mailbox.id));
    } catch {
      // keep the previous status on a failed check
    } finally {
      setChecking(false);
    }
  }

  async function disconnect() {
    if (!mailbox) return;
    await deleteMailboxConnection(mailbox.id);
    setMailbox(null);
    setConfirmDisconnect(false);
    router.refresh();
  }

  const meta = mailbox ? STATUS[mailbox.status] : null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-sts-card-border bg-sts-card p-4">
      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect organisation mailbox"
        description={
          mailbox
            ? `Stop sending from "${mailbox.address}"? Email for departments without their own mailbox will go out from the platform's default sender instead.`
            : ""
        }
        confirmLabel="Disconnect"
        successMessage={mailbox ? `Disconnected ${mailbox.address}` : undefined}
        onConfirm={disconnect}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sts-surface">
          <Building2 className="size-4 text-sts-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[13.5px] font-semibold text-sts-foreground">Organisation mailbox</p>
          <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
            {mailbox ? (
              <>
                Sends invitations and notifications from <span className="font-medium text-sts-foreground">{mailbox.address}</span>,
                and is the sender for any department without its own mailbox.
              </>
            ) : (
              <>
                Connect a Microsoft 365 mailbox (e.g. noreply@yourcompany.com) to send invitations and notifications, and as
                the sender for departments without their own. Until then, the platform&rsquo;s default sender is used.
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {mailbox && meta ? (
            <>
              <span className={cn("flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold", meta.chip)}>
                <span className={cn("size-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </span>
              <Tip label="Reconnect — sign in with Microsoft again">
                <button
                  type="button"
                  aria-label="Reconnect mailbox"
                  onClick={() => reconnectMailbox(mailbox)}
                  className={cn(
                    "rounded-full p-1.5 hover:bg-sts-surface hover:text-sts-foreground",
                    mailbox.status === "ACTIVE" ? "text-sts-subtle" : "text-red-500",
                  )}
                >
                  <LogIn className="size-3.5" />
                </button>
              </Tip>
              <Tip label="Test connection">
                <button
                  type="button"
                  aria-label="Test connection"
                  onClick={check}
                  disabled={checking}
                  className="rounded-full p-1.5 text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
                </button>
              </Tip>
              <Tip label="Disconnect">
                <button
                  type="button"
                  aria-label="Disconnect mailbox"
                  onClick={() => setConfirmDisconnect(true)}
                  className="rounded-full p-1.5 text-sts-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </Tip>
            </>
          ) : (
            <button
              type="button"
              onClick={connect}
              className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-3.5 font-sans text-[12.5px] font-medium text-white dark:text-gray-900"
            >
              {checking ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Connect
            </button>
          )}
        </div>
      </div>

      {mailbox && mailbox.status !== "ACTIVE" && mailbox.lastErrorMessage && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50/60 px-3 py-2 dark:bg-red-900/10">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
          <p className="font-sans text-[11.5px] text-red-600 dark:text-red-400">{mailbox.lastErrorMessage}</p>
        </div>
      )}
    </section>
  );
}
