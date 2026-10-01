"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { PendingFeatureRequest } from "@/lib/feature-marketplace-types";

export function FeatureApprovalsPage({ initialRequests }: { initialRequests: PendingFeatureRequest[] }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, decision: "APPROVED" | "REJECTED", reviewNote?: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/feature-requests/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewNote }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't review that request");
      return;
    }
    setRequests((prev) => prev.filter((request) => request.id !== id));
    setRejecting(null);
    setReason("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 px-6 py-8 sm:px-10">
      <div>
        <h1 className="sts-text-admin-title">Feature approvals</h1>
        <p className="mt-[3px] max-w-2xl font-sans text-[13px] text-sts-muted">
          Tenant admins and managers request a feature template for a department.
          Approving turns that template’s features on and notifies the department.
          Declining notifies them with the reason.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-lg border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[13px] text-sts-muted">
          No feature requests waiting.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex flex-col gap-3 rounded-lg border border-sts-card-border bg-sts-card px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[13px] font-semibold text-sts-foreground">
                  {request.featureLabel}
                </div>
                {request.featureDescription && (
                  <p className="mt-0.5 font-sans text-[12px] text-sts-muted">{request.featureDescription}</p>
                )}
                <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                  {request.department.name}
                  <span className="text-sts-subtle"> · {request.tenant.name}</span>
                </p>
                <p className="mt-0.5 font-sans text-[11.5px] text-sts-subtle">
                  {request.requester?.name ?? "Tenant admin"}
                  {request.requester?.email ? ` · ${request.requester.email}` : ""}
                  {" · "}
                  {new Date(request.requestedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                {request.message && (
                  <p className="mt-1 font-sans text-[12px] text-sts-muted">{request.message}</p>
                )}
              </div>
              {rejecting === request.id ? (
                <div className="flex w-full flex-col gap-2 sm:w-64">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for declining"
                    className="h-8 rounded-md border border-sts-card-border bg-sts-bg px-2 font-sans text-[12px] text-sts-foreground outline-none focus:border-sts-blue/50"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRejecting(null);
                        setReason("");
                      }}
                      className="h-7 rounded-full px-2.5 font-sans text-[11.5px] text-sts-muted hover:bg-sts-surface"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!reason.trim() || busy === request.id}
                      onClick={() => review(request.id, "REJECTED", reason.trim())}
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-red-600 px-2.5 font-sans text-[11.5px] font-medium text-white disabled:opacity-50"
                    >
                      {busy === request.id && <Loader2 className="size-3 animate-spin" />}
                      Decline
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => {
                      setRejecting(request.id);
                      setReason("");
                    }}
                    className="h-7 rounded-full border border-sts-card-border px-2.5 font-sans text-[11.5px] font-medium text-sts-muted hover:border-red-200 hover:text-red-500 disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => review(request.id, "APPROVED")}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-sts-blue px-3 font-sans text-[11.5px] font-medium text-white hover:bg-sts-blue/90 disabled:opacity-50 dark:text-gray-900"
                  >
                    {busy === request.id && <Loader2 className="size-3 animate-spin" />}
                    Approve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
