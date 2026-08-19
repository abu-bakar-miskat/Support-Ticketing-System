"use client";

import { useState } from "react";
import { Plus, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const RENEWAL_STATUSES = ["ACTIVE", "PENDING_RENEWAL", "RENEWED", "EXPIRED", "CANCELLED"] as const;
type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

const STATUS_LABEL: Record<RenewalStatus, string> = {
  ACTIVE: "Active",
  PENDING_RENEWAL: "Pending renewal",
  RENEWED: "Renewed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

const STATUS_CLASS: Record<RenewalStatus, string> = {
  ACTIVE: "bg-pen-green/10 text-pen-green",
  PENDING_RENEWAL: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  RENEWED: "bg-pen-blue/10 text-pen-blue",
  EXPIRED: "bg-pen-red/10 text-pen-red",
  CANCELLED: "bg-pen-surface text-pen-subtle",
};

export type AgreementDocumentRow = {
  id: string;
  storageUrl: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
};

export type AgreementRow = {
  id: string;
  startDate: string;
  endDate: string;
  renewalStatus: RenewalStatus;
  documents: AgreementDocumentRow[];
};

const sectionCard = "rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card";
const labelClass = "block font-sans text-[12.5px] font-medium text-pen-foreground";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TenantAgreements({
  tenantId,
  initialAgreements,
}: {
  tenantId: string;
  initialAgreements: AgreementRow[];
}) {
  const [agreements, setAgreements] = useState<AgreementRow[]>(initialAgreements);
  const [creating, setCreating] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [renewalStatus, setRenewalStatus] = useState<RenewalStatus>("ACTIVE");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createAgreement(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) return;
    setCreating(true);
    setError(null);
    const res = await fetch(`/api/admin/tenants/${tenantId}/agreements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, renewalStatus }),
    });
    setCreating(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create agreement");
      return;
    }
    const agreement = await res.json();
    setAgreements((prev) => [agreement, ...prev]);
    setStartDate("");
    setEndDate("");
    setRenewalStatus("ACTIVE");
  }

  async function updateStatus(agreementId: string, next: RenewalStatus) {
    setBusyId(agreementId);
    setError(null);
    const res = await fetch(`/api/admin/tenants/${tenantId}/agreements/${agreementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ renewalStatus: next }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update renewal status");
      return;
    }
    setAgreements((prev) => prev.map((a) => (a.id === agreementId ? { ...a, renewalStatus: next } : a)));
  }

  async function uploadDocument(agreementId: string, file: File) {
    setBusyId(agreementId);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/admin/tenants/${tenantId}/agreements/${agreementId}/documents`, {
      method: "POST",
      body: form,
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to upload document");
      return;
    }
    const document = await res.json();
    setAgreements((prev) =>
      prev.map((a) => (a.id === agreementId ? { ...a, documents: [document, ...a.documents] } : a)),
    );
  }

  async function removeDocument(agreementId: string, documentId: string) {
    setBusyId(agreementId);
    setError(null);
    const res = await fetch(
      `/api/admin/tenants/${tenantId}/agreements/${agreementId}/documents/${documentId}`,
      { method: "DELETE" },
    );
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to remove document");
      return;
    }
    setAgreements((prev) =>
      prev.map((a) =>
        a.id === agreementId ? { ...a, documents: a.documents.filter((d) => d.id !== documentId) } : a,
      ),
    );
  }

  return (
    <section className={cn(sectionCard, "xl:col-span-3")}>
      <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">Commercial agreements</h2>
      <p className="mt-1 font-sans text-[11.5px] text-pen-subtle">
        Administrative record of agreement terms — dates, renewal status, and supporting documents. Not a
        billing system.
      </p>

      <form onSubmit={createAgreement} className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className={labelClass}>Start date</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 h-9"
          />
        </div>
        <div>
          <label className={labelClass}>End date</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 h-9"
          />
        </div>
        <div>
          <label className={labelClass}>Renewal status</label>
          <Select value={renewalStatus} onValueChange={(v) => v && setRenewalStatus(v as RenewalStatus)}>
            <SelectTrigger className="mt-1 h-9 min-w-[170px]">
              <span className="font-sans text-[12.5px]">{STATUS_LABEL[renewalStatus]}</span>
            </SelectTrigger>
            <SelectContent>
              {RENEWAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="font-sans text-[12.5px]">
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="lg" disabled={creating || !startDate || !endDate}>
          <Plus className="size-4" />
          {creating ? "Creating…" : "Record agreement"}
        </Button>
      </form>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {agreements.map((a) => (
          <li key={a.id} className="rounded-lg border border-pen-card-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-sans text-[12.5px] text-pen-foreground">
                {fmtDate(a.startDate)} → {fmtDate(a.endDate)}
              </div>
              <Select
                value={a.renewalStatus}
                onValueChange={(v) => v && updateStatus(a.id, v as RenewalStatus)}
              >
                <SelectTrigger className="h-8 min-w-[170px]" disabled={busyId === a.id}>
                  <span className={cn("rounded-full px-2 py-0.5 font-sans text-[11px] font-medium", STATUS_CLASS[a.renewalStatus])}>
                    {STATUS_LABEL[a.renewalStatus]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {RENEWAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="font-sans text-[12.5px]">
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {a.documents.map((d) => (
                <a
                  key={d.id}
                  href={d.storageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface px-2.5 py-1 font-sans text-[11px] text-pen-muted hover:text-pen-foreground"
                >
                  <FileText className="size-3" />
                  <span className="max-w-[160px] truncate">{d.fileName}</span>
                  <span className="text-pen-subtle">({fmtSize(d.fileSize)})</span>
                  <button
                    type="button"
                    aria-label={`Remove ${d.fileName}`}
                    onClick={(e) => {
                      e.preventDefault();
                      removeDocument(a.id, d.id);
                    }}
                    className="ml-0.5 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-pen-red"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </a>
              ))}
              <Button variant="outline" size="sm" className="relative" disabled={busyId === a.id}>
                <Upload className="size-3.5" />
                Add document
                <input
                  type="file"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  disabled={busyId === a.id}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadDocument(a.id, f);
                    e.target.value = "";
                  }}
                />
              </Button>
            </div>
          </li>
        ))}
        {agreements.length === 0 && (
          <li className="font-sans text-[12px] text-pen-subtle">No agreements recorded yet.</li>
        )}
      </ul>
    </section>
  );
}
