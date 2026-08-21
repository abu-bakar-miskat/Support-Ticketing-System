"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Check, ChevronDown, Inbox, X } from "lucide-react";
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
  ticket: { id: string; title: string; humanId: string };
};

type SuppressedMail = {
  id: string;
  fromEmail: string | null;
  toAddress: string | null;
  subject: string | null;
  reason: string;
  createdAt: string;
};

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

export function SubDepartmentReceivedMail({
  subDepartmentId,
  canManage,
}: {
  subDepartmentId: string;
  canManage: boolean;
}) {
  const [messages, setMessages] = useState<MailboxMessage[] | null>(null);
  const [suppressed, setSuppressed] = useState<SuppressedMail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"mail" | "suppressed">("mail");

  useEffect(() => {
    fetch(`/api/admin/sub-departments/${subDepartmentId}/mailbox-mail`)
      .then(jsonOrThrow)
      .then((data) => {
        setMessages(data.messages);
        setSuppressed(data.suppressed);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Couldn't load received mail.");
        setMessages([]);
        setSuppressed([]);
      });
  }, [subDepartmentId]);

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
      <div className="flex items-center gap-2 border-b border-pen-card-border px-4 py-3.5">
        <Inbox className="size-4 text-pen-muted" />
        <div>
          <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">Received mail</h2>
          <p className="font-sans text-[11.5px] text-pen-muted">
            Every email these mailboxes received — filed tickets, mail awaiting review, and suppressed mail.
          </p>
        </div>
      </div>

      {error && (
        <p className="border-b border-pen-card-border bg-red-50/60 px-4 py-2.5 font-sans text-[12px] text-red-600 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-pen-card-border px-2">
        {(
          [
            { key: "mail" as const, label: `Mail${messages ? ` (${messages.length})` : ""}` },
            { key: "suppressed" as const, label: `Suppressed${suppressed ? ` (${suppressed.length})` : ""}` },
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
          (messages === null ? (
            <p className="px-1 py-3 font-sans text-[12.5px] text-pen-muted">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="px-1 py-3 font-sans text-[12.5px] text-pen-muted">No mail received yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {messages.map((m) => (
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
          (suppressed === null ? (
            <p className="px-1 py-3 font-sans text-[12.5px] text-pen-muted">Loading…</p>
          ) : suppressed.length === 0 ? (
            <p className="px-1 py-3 font-sans text-[12.5px] text-pen-muted">No suppressed mail.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {suppressed.map((s) => (
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
