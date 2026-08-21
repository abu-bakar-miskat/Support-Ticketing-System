"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Check, ChevronDown, Inbox, Mail, X } from "lucide-react";
import { cn } from "@/lib/utils";

type MailboxMessage = {
  id: string;
  status: "trusted" | "quarantined" | "system";
  fromName: string;
  fromEmail: string;
  bodyHtml: string;
  createdAt: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  subDepartmentId: string;
  ticket: { id: string; title: string; humanId: string };
};

type SuppressedMail = {
  id: string;
  fromEmail: string | null;
  toAddress: string | null;
  subject: string | null;
  reason: string;
  mailboxConnectionId: string | null;
  createdAt: string;
};

type MailboxOption = {
  id: string;
  address: string;
  subDepartmentId: string;
};

const ALL_MAILBOXES = "all";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

const STATUS_STYLES: Record<MailboxMessage["status"], string> = {
  trusted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  quarantined: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  system: "bg-pen-surface text-pen-subtle",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Received-mail viewer for a mailbox scope. `endpoint` returns
 * `{ messages, suppressed }` (see the department / sub-department
 * `mailbox-mail` routes). Managers can accept/reject quarantined mail.
 */
export function ReceivedMailPanel({
  endpoint,
  canManage,
}: {
  endpoint: string;
  canManage: boolean;
}) {
  const [messages, setMessages] = useState<MailboxMessage[] | null>(null);
  const [suppressed, setSuppressed] = useState<SuppressedMail[] | null>(null);
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>(ALL_MAILBOXES);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"mail" | "suppressed">("mail");

  useEffect(() => {
    fetch(endpoint)
      .then(jsonOrThrow)
      .then((data) => {
        setMessages(data.messages);
        setSuppressed(data.suppressed);
        setMailboxes(data.connections ?? []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Couldn't load received mail.");
        setMessages([]);
        setSuppressed([]);
      });
  }, [endpoint]);

  const activeMailbox = mailboxes.find((m) => m.id === selectedMailbox) ?? null;

  // Filter by the chosen mailbox: messages route by the mailbox's sub-department
  // (mail to an address opens tickets for the team it files into); suppressed
  // mail is keyed directly to the connection.
  const shownMessages = useMemo(() => {
    if (!messages) return null;
    if (!activeMailbox) return messages;
    return messages.filter((m) => m.subDepartmentId === activeMailbox.subDepartmentId);
  }, [messages, activeMailbox]);

  const shownSuppressed = useMemo(() => {
    if (!suppressed) return null;
    if (!activeMailbox) return suppressed;
    return suppressed.filter((s) => s.mailboxConnectionId === activeMailbox.id);
  }, [suppressed, activeMailbox]);

  async function act(message: MailboxMessage, action: "accept" | "reject") {
    setBusyId(message.id);
    setError(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/tickets/${message.ticket.id}/messages/${message.id}/${action}`, { method: "POST" }),
      );
      if (action === "accept") {
        setMessages((prev) => prev?.map((m) => (m.id === message.id ? { ...m, status: "trusted" } : m)) ?? null);
      } else {
        setMessages((prev) => prev?.filter((m) => m.id !== message.id) ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Couldn't ${action} that message.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex flex-col rounded-2xl border border-pen-card-border bg-pen-card">
      <div className="flex flex-col gap-3 border-b border-pen-card-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="size-4 shrink-0 text-pen-muted" />
          <div>
            <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">Received mail</h2>
            <p className="font-sans text-[11.5px] text-pen-muted">
              Every email these mailboxes received — filed tickets, mail awaiting review, and suppressed mail.
            </p>
          </div>
        </div>
        {mailboxes.length > 0 && (
          <label className="flex shrink-0 items-center gap-2 font-sans text-[11.5px] text-pen-muted">
            <span className="hidden sm:inline">Mailbox</span>
            <select
              value={selectedMailbox}
              onChange={(e) => { setSelectedMailbox(e.target.value); setExpandedId(null); }}
              className="h-8 max-w-[220px] rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue/50"
            >
              <option value={ALL_MAILBOXES}>All mailboxes</option>
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>{m.address}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {activeMailbox && (
        <div className="flex items-center gap-2 border-b border-pen-blue/30 bg-pen-blue/5 px-4 py-2">
          <Mail className="size-3.5 shrink-0 text-pen-blue" />
          <p className="font-sans text-[11.5px] text-pen-foreground">
            Showing mail for{" "}
            <span className="rounded bg-pen-blue/15 px-1.5 py-0.5 font-medium text-pen-blue">
              {activeMailbox.address}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setSelectedMailbox(ALL_MAILBOXES)}
            className="ml-auto font-sans text-[11px] font-medium text-pen-muted hover:text-pen-foreground"
          >
            Show all
          </button>
        </div>
      )}

      {error && (
        <p className="border-b border-pen-card-border bg-red-50/60 px-4 py-2.5 font-sans text-[12px] text-red-600 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-pen-card-border px-2">
        {(
          [
            { key: "mail" as const, label: `Mail${shownMessages ? ` (${shownMessages.length})` : ""}` },
            { key: "suppressed" as const, label: `Suppressed${shownSuppressed ? ` (${shownSuppressed.length})` : ""}` },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "relative -mb-px px-3 py-2.5 font-sans text-[12.5px] font-medium transition-colors",
              tab === t.key
                ? "text-pen-blue after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-pen-blue"
                : "text-pen-muted hover:text-pen-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-3">
        {tab === "mail" &&
          (shownMessages === null ? (
            <p className="px-1 py-3 font-sans text-[12.5px] text-pen-muted">Loading…</p>
          ) : shownMessages.length === 0 ? (
            <p className="px-1 py-3 font-sans text-[12.5px] text-pen-muted">
              {activeMailbox ? `No mail for ${activeMailbox.address} yet.` : "No mail received yet."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {shownMessages.map((m) => (
                <div key={m.id} className="rounded-lg border border-pen-card-border bg-pen-surface/40">
                  <button
                    type="button"
                    onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold tracking-wide uppercase",
                        STATUS_STYLES[m.status],
                      )}
                    >
                      {m.status}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                        {m.fromName}{" "}
                        <span className="font-normal text-pen-subtle">&lt;{m.fromEmail}&gt;</span>
                      </p>
                      <p className="truncate font-sans text-[11px] text-pen-subtle">
                        {m.ticket.humanId} · {m.ticket.title}
                      </p>
                    </div>
                    <span className="hidden shrink-0 font-sans text-[11px] text-pen-subtle sm:inline">
                      {formatDate(m.createdAt)}
                    </span>
                    {canManage && m.status === "quarantined" ? (
                      <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => act(m, "accept")}
                          title="Accept — mark trusted"
                          className="inline-flex size-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-900/20"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => act(m, "reject")}
                          title="Reject — discard this message"
                          className="inline-flex size-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ) : (
                      <ChevronDown
                        className={cn(
                          "size-3.5 shrink-0 text-pen-subtle transition-transform",
                          expandedId === m.id && "rotate-180",
                        )}
                      />
                    )}
                  </button>
                  {expandedId === m.id && (
                    <div className="border-t border-pen-card-border px-3 py-3">
                      {m.acceptedAt && (
                        <p className="mb-2 font-sans text-[11px] text-pen-subtle">
                          Accepted{m.acceptedByName ? ` by ${m.acceptedByName}` : ""} on {formatDate(m.acceptedAt)}
                        </p>
                      )}
                      <div
                        className="prose prose-sm max-w-none font-sans text-[12.5px] text-pen-foreground"
                        dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                      />
                      <Link
                        href={`/tasks/${m.ticket.id}`}
                        className="mt-3 inline-flex font-sans text-[11.5px] font-medium text-pen-blue hover:underline"
                      >
                        Open {m.ticket.humanId} →
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

        {tab === "suppressed" &&
          (shownSuppressed === null ? (
            <p className="px-1 py-3 font-sans text-[12.5px] text-pen-muted">Loading…</p>
          ) : shownSuppressed.length === 0 ? (
            <p className="px-1 py-3 font-sans text-[12.5px] text-pen-muted">
              {activeMailbox ? `No suppressed mail for ${activeMailbox.address}.` : "No suppressed mail."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {shownSuppressed.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border border-pen-card-border bg-pen-surface/40 px-3 py-2.5"
                >
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[10px] font-semibold tracking-wide text-pen-subtle uppercase">
                    <Ban className="size-2.5" /> {s.reason}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                      {s.subject ?? "(no subject)"}
                    </p>
                    <p className="truncate font-sans text-[11px] text-pen-subtle">
                      {s.fromEmail ?? "unknown sender"} → {s.toAddress ?? "unknown address"}
                    </p>
                  </div>
                  <span className="hidden shrink-0 font-sans text-[11px] text-pen-subtle sm:inline">
                    {formatDate(s.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </section>
  );
}
