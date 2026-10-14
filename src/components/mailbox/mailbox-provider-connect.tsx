"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { mailboxOAuthStartUrl, type MailboxConnection } from "@/lib/api/admin";

export type MailboxProvider = MailboxConnection["authType"];

// OAUTH_GOOGLE / IMAP exist in the schema enum but aren't offered; they keep a
// label only so any row carrying them still renders.
export const MAILBOX_PROVIDER_META: Record<MailboxProvider, { label: string; short: string; description: string }> = {
  RESEND: {
    label: "Forwarding address",
    short: "Forwarding",
    description: "Forward or deliver mail to an address on a verified receiving domain.",
  },
  OAUTH_M365: {
    label: "Microsoft 365",
    short: "Microsoft 365",
    description: "Sign in with Microsoft to read an Outlook / Exchange Online inbox or shared mailbox.",
  },
  OAUTH_GOOGLE: { label: "Google", short: "Google", description: "" },
  IMAP: { label: "IMAP", short: "IMAP", description: "" },
};

const PROVIDER_ORDER: MailboxProvider[] = ["RESEND", "OAUTH_M365"];
/** Forwarding (Resend) addresses are only connected from an approved domain
 *  request; the general "Connect inbox" entry point offers these. */
export const INBOX_PROVIDERS: MailboxProvider[] = ["OAUTH_M365"];

export const isOAuthProvider = (p: MailboxProvider) => p === "OAUTH_M365";
export const isPullProvider = (p: MailboxProvider) => p === "OAUTH_M365";

const inputClass =
  "h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue/50";
const labelClass = "mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Segmented picker for how a mailbox is connected. Hidden when there's only one choice. */
export function MailboxProviderPicker({
  value,
  onChange,
  providers = PROVIDER_ORDER,
}: {
  value: MailboxProvider;
  onChange: (provider: MailboxProvider) => void;
  providers?: MailboxProvider[];
}) {
  if (providers.length < 2) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>Connect with</span>
      <div role="radiogroup" aria-label="Connect with" className="grid grid-cols-2 gap-1.5">
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            onClick={() => onChange(p)}
            className={cn(
              "h-8 rounded-lg border px-2 font-sans text-[12px] font-medium transition-colors",
              value === p
                ? "border-sts-blue/60 bg-sts-blue/10 text-sts-blue"
                : "border-sts-card-border bg-sts-surface text-sts-muted hover:text-sts-foreground",
            )}
          >
            {MAILBOX_PROVIDER_META[p].short}
          </button>
        ))}
      </div>
      <p className="font-sans text-[11px] text-sts-subtle">{MAILBOX_PROVIDER_META[value].description}</p>
    </div>
  );
}

/**
 * Connect form for a Microsoft 365 inbox: collects an optional shared-mailbox
 * address, then navigates to the Microsoft sign-in flow.
 */
export function ExternalMailboxConnectForm({
  teamId,
  scopeType,
  existingAddresses,
  onCancel,
  teamPicker,
}: {
  /** Sub-department new tickets file into (empty until chosen). */
  teamId: string;
  scopeType: "DEPARTMENT" | "SUB_DEPARTMENT";
  existingAddresses: string[];
  onCancel: () => void;
  /** Optional "Files into" control rendered above the action buttons. */
  teamPicker?: React.ReactNode;
}) {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startOAuth() {
    const mailbox = address.trim();
    if (mailbox && !isValidEmail(mailbox)) return setError("Enter a valid mailbox address, or leave it blank.");
    if (mailbox && existingAddresses.some((a) => a.toLowerCase() === mailbox.toLowerCase())) {
      return setError("That address is already connected.");
    }
    if (!teamId) return setError("Choose which sub-department this mailbox files into.");
    setBusy(true);
    window.location.assign(
      mailboxOAuthStartUrl("microsoft", {
        teamId,
        scopeType,
        mailbox: mailbox || undefined,
        returnTo: window.location.pathname,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-sans text-[12px] text-sts-muted">{MAILBOX_PROVIDER_META.OAUTH_M365.description}</p>
      <div>
        <label className={labelClass}>Shared mailbox address (optional)</label>
        <input
          type="text"
          inputMode="email"
          value={address}
          onChange={(e) => { setAddress(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") startOAuth(); }}
          placeholder="support@yourcompany.com"
          className={inputClass}
        />
        <p className="mt-1.5 font-sans text-[11px] text-sts-subtle">
          Leave blank to connect the inbox of the account you sign in with. For a shared mailbox, sign in with an
          account that has Full Access to it. The inbox is read-only to us — nothing is sent, moved or deleted.
        </p>
      </div>

      {teamPicker}

      {error && <p className="font-sans text-[11.5px] text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-full border border-sts-card-border px-4 font-sans text-[12.5px] text-sts-muted hover:bg-sts-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={startOAuth}
          disabled={busy}
          className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-4 font-sans text-[12.5px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}

/** Starts re-authorizing a Microsoft 365 mailbox whose sign-in expired or was revoked. */
export function reconnectMailbox(connection: MailboxConnection) {
  if (!isOAuthProvider(connection.authType)) return;
  window.location.assign(
    mailboxOAuthStartUrl("microsoft", { connectionId: connection.id, returnTo: window.location.pathname }),
  );
}

/**
 * Reads the outcome the OAuth callback appended to the URL, shows it as a
 * toast, strips it from the address bar, and calls `onConnected` so the page
 * reloads its connection list.
 */
export function useMailboxOAuthResult(onConnected: () => void) {
  const handled = useRef(false);
  const callback = useRef(onConnected);
  useEffect(() => {
    callback.current = onConnected;
  });

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("mailboxConnected");
    const error = url.searchParams.get("mailboxError");
    if (!connected && !error) return;
    if (connected) {
      toast.success(`Connected ${connected}. New mail will open tickets within a couple of minutes.`);
      callback.current();
    } else if (error) {
      toast.error(error);
    }
    url.searchParams.delete("mailboxConnected");
    url.searchParams.delete("mailboxError");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
}

/** The Microsoft 365 mailbox connected at exactly this scope (department or sub-department). */
export function scopeReplyMailbox(
  connections: MailboxConnection[],
  scope: { scopeType: "DEPARTMENT" } | { scopeType: "SUB_DEPARTMENT"; subDepartmentId: string },
): MailboxConnection | undefined {
  return connections.find(
    (c) =>
      c.authType === "OAUTH_M365" &&
      c.scopeType === scope.scopeType &&
      (scope.scopeType === "DEPARTMENT" || c.subDepartmentId === scope.subDepartmentId),
  );
}

/** One-line banner naming the address customers see for this scope's tickets. */
export function ReplyMailboxNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-sts-blue/20 bg-sts-blue/5 px-4 py-3 font-sans text-[12.5px] text-sts-foreground">
      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-sts-blue" />
      <p>{children}</p>
    </div>
  );
}
