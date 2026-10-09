"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2, Check, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ListSearchInput,
  SortDropdown,
  useListControls,
  byText,
  byDateDesc,
  byDateAsc,
} from "@/components/ui/list-controls";

export type PendingDomainRequest = {
  id: string;
  domain: string;
  departmentName: string;
  subDepartmentName: string | null;
  requesterName: string;
  note: string | null;
  createdAt: string;
};

/**
 * Tenant-admin review of pending domain requests. Approve auto-registers the
 * domain (it then appears in the domains manager below); reject declines it.
 * Both refresh the server data so the manager list and this panel update.
 */
export function DomainRequestsPanel({ requests }: { requests: PendingDomainRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<{ id: string; action: "approve" | "reject" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useListControls(requests, {
    searchText: (r) =>
      [r.domain, r.departmentName, r.subDepartmentName ?? "", r.requesterName, r.note ?? ""].join(" "),
    sortOptions: [
      { id: "newest", label: "Newest first", compare: byDateDesc((r) => r.createdAt) },
      { id: "oldest", label: "Oldest first", compare: byDateAsc((r) => r.createdAt) },
      { id: "domain", label: "Domain (A–Z)", compare: byText((r) => r.domain) },
      { id: "department", label: "Department", compare: byText((r) => r.departmentName) },
    ],
  });

  if (requests.length === 0) return null;

  async function act(id: string, action: "approve" | "reject") {
    setBusy({ id, action });
    setError(null);
    try {
      const res = await fetch(`/api/admin/email-identity/domain-requests/${id}/${action}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Action failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-amber-400/40 bg-amber-50/40 shadow-sts-card dark:bg-amber-900/10">
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-400/30 px-[22px] py-3">
        <Inbox className="size-4 text-amber-600 dark:text-amber-400" />
        <h3 className="font-sans text-[13.5px] font-semibold text-sts-foreground">
          Domain requests
          <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            {requests.length} pending
          </span>
        </h3>
        <div className="ml-auto flex items-center gap-2">
          <ListSearchInput value={list.query} onChange={list.setQuery} placeholder="Search requests…" />
          <SortDropdown value={list.sortKey} onChange={list.setSortKey} options={list.sortDropdownOptions} />
        </div>
      </div>

      {error && (
        <div className="border-b border-amber-400/30 px-[22px] py-2 font-sans text-[12.5px] text-destructive">{error}</div>
      )}

      {list.visible.length === 0 && (
        <p className="px-[22px] py-6 text-center font-sans text-[12.5px] text-sts-muted">
          No requests match &ldquo;{list.query.trim()}&rdquo;
        </p>
      )}

      <ul className="divide-y divide-amber-400/20">
        {list.visible.map((r) => {
          const rowBusy = busy?.id === r.id;
          const rejecting = rowBusy && busy?.action === "reject";
          const approving = rowBusy && busy?.action === "approve";
          const scope = r.subDepartmentName ? `${r.departmentName} › ${r.subDepartmentName}` : r.departmentName;
          return (
            <li key={r.id} className="flex flex-col gap-3 px-[22px] py-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13.5px] font-medium text-sts-foreground">{r.domain}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-sts-blue/25 bg-sts-blue-tint px-2 py-0.5 font-sans text-[11px] font-semibold text-sts-blue">
                    <Building2 className="size-3" />
                    {scope}
                  </span>
                </div>
                <p className="mt-1 font-sans text-[11.5px] text-sts-subtle">
                  Requested by {r.requesterName}
                  {r.note ? ` — “${r.note}”` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" disabled={rowBusy} onClick={() => act(r.id, "reject")}>
                  {rejecting ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                  Decline
                </Button>
                <Button size="sm" disabled={rowBusy} onClick={() => act(r.id, "approve")}>
                  {approving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Approve &amp; register
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
