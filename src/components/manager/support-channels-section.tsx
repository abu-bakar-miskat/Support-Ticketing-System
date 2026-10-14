"use client";

import Link from "next/link";
import { ExternalLink, FileText, Mail } from "lucide-react";
import { RailCard } from "./rail-card";

export type MailboxSummary = {
  id: string;
  address: string;
  isActive: boolean;
  status: "ACTIVE" | "AUTH_ERROR" | "UNREACHABLE";
  subDepartmentName: string;
};

export type SupportFormSummary = {
  id: string;
  name: string;
  isActive: boolean;
  submissionsToday: number;
};

function ChannelStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-mono text-[22px] font-semibold leading-none tabular-nums text-sts-foreground">{value}</p>
      <p className="mt-1 font-sans text-[10.5px] text-sts-subtle">{label}</p>
    </div>
  );
}

export function SupportChannelsSection({
  mailboxes,
  forms,
  canManageForms,
}: {
  mailboxes: MailboxSummary[];
  forms: SupportFormSummary[];
  canManageForms: boolean;
}) {
  const receiving = mailboxes.filter((mailbox) => mailbox.isActive && mailbox.status === "ACTIVE").length;
  const mailboxIssues = mailboxes.filter((mailbox) => !mailbox.isActive || mailbox.status !== "ACTIVE");
  const liveForms = forms.filter((form) => form.isActive).length;
  const submissionsToday = forms.reduce((sum, form) => sum + form.submissionsToday, 0);

  return (
    <RailCard
      id="support-channels"
      icon={Mail}
      accent="#0a76b9"
      title="Support channels"
      aside={<span className="font-sans text-[11px] text-sts-subtle">email and forms</span>}
    >
      <div className="divide-y divide-sts-card-border">
        <section className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-sts-blue/10 text-sts-blue">
                <Mail className="size-3.5" />
              </span>
              <div>
                <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">Shared mailboxes</h3>
                <p className="font-sans text-[10.5px] text-sts-subtle">Inbound email routes</p>
              </div>
            </div>
            <Link
              href="/mailboxes"
              className="inline-flex items-center gap-1 font-sans text-[10.5px] font-semibold text-sts-id transition-colors hover:text-sts-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue/40"
            >
              Open <ExternalLink className="size-3" />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <ChannelStat value={mailboxes.length} label="connected" />
            <ChannelStat value={receiving} label="receiving mail" />
            <ChannelStat value={mailboxIssues.length} label="need attention" />
          </div>
          {mailboxIssues.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2">
              <p className="font-sans text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
                {mailboxIssues.slice(0, 2).map((mailbox) => mailbox.address).join(", ")}
                {mailboxIssues.length > 2 ? ` and ${mailboxIssues.length - 2} more` : ""}
              </p>
            </div>
          )}
        </section>

        <section className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <FileText className="size-3.5" />
              </span>
              <div>
                <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">Support forms</h3>
                <p className="font-sans text-[10.5px] text-sts-subtle">Public ticket intake</p>
              </div>
            </div>
            {canManageForms && (
              <Link
                href="/settings/support-forms"
                className="inline-flex items-center gap-1 font-sans text-[10.5px] font-semibold text-sts-id transition-colors hover:text-sts-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue/40"
              >
                Manage <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <ChannelStat value={forms.length} label="configured" />
            <ChannelStat value={liveForms} label="accepting tickets" />
            <ChannelStat value={submissionsToday} label="received today" />
          </div>
        </section>
      </div>
    </RailCard>
  );
}
