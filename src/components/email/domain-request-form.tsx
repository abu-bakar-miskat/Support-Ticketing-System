"use client";

import { Tip } from "@/components/ui/tooltip";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";
import { Globe, Loader2, Send, CheckCircle2, Clock, XCircle, Mail, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const WHOLE_DEPT = "__whole__";

export type ScopeRequestStatus = {
  id: string;
  domain: string;
  status: string;
  /** Live verification of the registered domain (only for approved requests). */
  verified: boolean;
  subDepartmentName: string | null;
  requesterName: string;
  createdAt: string;
};

function RequestStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
    pending: { label: "Pending review", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", Icon: Clock },
    not_verified: { label: "Not verified yet", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", Icon: Clock },
    verified: { label: "Verified", cls: "bg-sts-green/15 text-sts-green", Icon: CheckCircle2 },
    approved: { label: "Approved", cls: "bg-sts-green/15 text-sts-green", Icon: CheckCircle2 },
    rejected: { label: "Declined", cls: "bg-destructive/15 text-destructive", Icon: XCircle },
  };
  const v = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold uppercase tracking-wide", v.cls)}>
      <v.Icon className="size-3" />
      {v.label}
    </span>
  );
}

/**
 * Lets a department / sub-department manager request a sending domain. They
 * can't register domains directly (tenant-admin only), so this files a request
 * a tenant admin then approves + verifies. `fixedSubDepartment` locks the scope
 * (sub-department mailbox page); otherwise `subDepartments` offers an optional
 * picker (department mailbox page). Rendered inside {@link RequestDomainDialog}.
 */
function DomainRequestForm({
  departmentId,
  subDepartments,
  fixedSubDepartment,
  onSubmitted,
}: {
  departmentId: string;
  subDepartments?: { id: string; name: string }[];
  fixedSubDepartment?: { id: string; name: string };
  /** Called after a successful submit. */
  onSubmitted: (domain: string) => void;
}) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [subId, setSubId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectable = !fixedSubDepartment && Array.isArray(subDepartments) && subDepartments.length > 0;

  async function submit() {
    const d = domain.trim().toLowerCase();
    if (!d) return;
    setSubmitting(true);
    setError(null);
    try {
      const subDepartmentId = fixedSubDepartment
        ? fixedSubDepartment.id
        : selectable && subId && subId !== WHOLE_DEPT
          ? subId
          : null;
      const res = await fetch("/api/email-domain-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, subDepartmentId, domain: d, note: note.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't send the request");
        return;
      }
      onSubmitted(d);
      setDomain("");
      setNote("");
      setSubId("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12px] text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-[5px]">
          <label className="font-sans text-[12px] font-medium text-sts-muted">Domain</label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="h-9 w-full"
            placeholder="mail.example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {fixedSubDepartment ? (
          <div className="flex flex-col gap-[5px]">
            <label className="font-sans text-[12px] font-medium text-sts-muted">For</label>
            <div className="flex h-9 items-center rounded-md border border-sts-card-border bg-sts-surface px-3 font-sans text-[12.5px] text-sts-foreground">
              {fixedSubDepartment.name}
            </div>
          </div>
        ) : selectable ? (
          <div className="flex flex-col gap-[5px]">
            <label className="font-sans text-[12px] font-medium text-sts-muted">For</label>
            <Select value={subId} onValueChange={(v) => setSubId(v ?? "")}>
              <SelectTrigger className="h-9 w-full">
                <span className={cn("truncate font-sans text-[12.5px]", !subId && "text-sts-subtle")}>
                  {subId === WHOLE_DEPT || !subId
                    ? "Whole department"
                    : subDepartments!.find((s) => s.id === subId)?.name ?? "Whole department"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_DEPT} className="font-sans text-[12.5px]">
                  Whole department
                </SelectItem>
                {subDepartments!.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="font-sans text-[12.5px]">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-[5px]">
        <label className="font-sans text-[12px] font-medium text-sts-muted">Note (optional)</label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-9 w-full"
          placeholder="Why you need this domain"
        />
      </div>

      <div className="flex justify-end">
        <Button disabled={submitting || !domain.trim()} onClick={submit}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send request
        </Button>
      </div>
    </div>
  );
}

function DomainRequestIntro() {
  return (
    <p className="font-sans text-[12px] text-sts-muted">
      Want to send from your own domain (e.g. <span className="font-mono">mail.example.com</span>)? Request it here —
      the domain must already be verified in Resend before a workspace admin can add it.
    </p>
  );
}

/** The scope's existing domain requests with their status; declined ones can be deleted. */
export function DomainRequestStatusList({
  requests,
  onConnectMailbox,
}: {
  requests: ScopeRequestStatus[];
  onConnectMailbox?: (domain: string) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<{ id: string; domain: string } | null>(null);

  async function performDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/email-domain-requests/${deleting.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Failed to delete the request");
    router.refresh();
  }

  if (requests.length === 0) return null;

  return (
    <div className="rounded-2xl border border-sts-card-border bg-sts-card p-4">
      <h3 className="mb-2 font-sans text-[12.5px] font-semibold text-sts-foreground">Your domain requests</h3>
      <ul className="flex flex-col divide-y divide-sts-card-border/60">
        {requests.map((r) => {
          const badgeStatus =
            r.status === "approved" ? (r.verified ? "verified" : "not_verified") : r.status;
          const showConnect = r.status === "approved" && r.verified;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-mono text-[12.5px] font-medium text-sts-foreground">{r.domain}</span>
              {r.subDepartmentName && (
                <span className="font-sans text-[11.5px] text-sts-subtle">· {r.subDepartmentName}</span>
              )}
              <RequestStatusBadge status={badgeStatus} />
              {showConnect && onConnectMailbox && (
                <Button variant="outline" size="sm" onClick={() => onConnectMailbox(r.domain)}>
                  <Mail className="size-3.5" />
                  Connect mailbox
                </Button>
              )}
              <span className="ml-auto font-sans text-[11px] text-sts-subtle">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
              {r.status === "rejected" && (
                <Tip label="Delete request">
                  <button
                    type="button"
                    onClick={() => setDeleting({ id: r.id, domain: r.domain })}
                    className="rounded-full p-1 text-sts-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete request"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </Tip>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Delete request?"
        description={deleting ? `Remove the declined request for ${deleting.domain}?` : ""}
        confirmLabel="Delete"
        successMessage={deleting ? `Request for ${deleting.domain} deleted.` : undefined}
        onConfirm={performDelete}
      />
    </div>
  );
}

/** Header button that opens the sending-domain request form in a modal. */
export function RequestDomainDialog({
  departmentId,
  subDepartments,
  fixedSubDepartment,
}: {
  departmentId: string;
  subDepartments?: { id: string; name: string }[];
  fixedSubDepartment?: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => setOpen(true)}
        className="h-[34px] w-full shrink-0 gap-1.5 rounded-full bg-sts-blue px-4 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-sts-blue/90 sm:w-auto"
      >
        <Globe className="size-[13px]" strokeWidth={2.5} />
        Request a sending domain
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 sts-overlay-backdrop" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex w-[min(560px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl">
          <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
            <Dialog.Title className="flex items-center gap-2 font-sans text-[14px] font-semibold text-sts-foreground">
              <Globe className="size-4 text-sts-muted" />
              Request a sending domain
            </Dialog.Title>
            <Dialog.Close aria-label="Close">
              <X className="size-4 text-sts-muted" />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-3 px-5 py-4">
            <DomainRequestIntro />
            <DomainRequestForm
              departmentId={departmentId}
              subDepartments={subDepartments}
              fixedSubDepartment={fixedSubDepartment}
              onSubmitted={(domain) => {
                setOpen(false);
                toast.success(`Request for ${domain} sent — your workspace admin has been notified.`);
              }}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
