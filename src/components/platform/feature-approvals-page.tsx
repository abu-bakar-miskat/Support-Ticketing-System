"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Clock, Layers, Loader2, UserRound } from "lucide-react";
import { TemplatePreview } from "@/components/settings/feature-preview";
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card transition-colors hover:border-sts-blue/50"
            >
              {/* Preview header — same gradient graphic as the Features marketplace */}
              <div className="relative h-28 border-b border-sts-card-border">
                <TemplatePreview featureKeys={request.featureKeys} />
                <div className="absolute top-2.5 right-2.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-sts-card/90 px-2 py-0.5 font-sans text-[11px] font-medium text-amber-700 shadow-sm dark:text-amber-400">
                    <Clock className="size-3" /> Pending
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="flex flex-1 flex-col px-4 py-3">
                <div className="font-sans text-[15px] leading-tight font-semibold tracking-tight text-sts-foreground">
                  {request.featureLabel}
                </div>
                {request.featureDescription && request.featureDescription !== request.featureLabel && (
                  <p className="mt-1 line-clamp-2 font-sans text-[12.5px] leading-snug text-sts-muted">
                    {request.featureDescription}
                  </p>
                )}

                {/* Who it's for — department is the subject, tenant the context, requester secondary */}
                <div className="mt-3 overflow-hidden rounded-lg border border-sts-card-border/70 bg-sts-surface/50">
                  <div className="flex items-start gap-2.5 px-3 py-2.5">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sts-blue-tint text-sts-blue">
                      <Building2 className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-sans text-[13px] font-semibold text-sts-foreground">
                        {request.department.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 font-sans text-[11.5px] text-sts-muted">
                        <Layers className="size-3 shrink-0 text-sts-subtle" />
                        <span className="truncate">{request.tenant.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 border-t border-sts-card-border/60 px-3 py-2.5">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sts-blue-tint text-sts-blue">
                      <UserRound className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-sans text-[13px] font-medium text-sts-foreground">
                        {request.requester?.name ?? "Tenant admin"}
                      </div>
                      <div className="mt-0.5 truncate font-sans text-[11.5px] text-sts-subtle">
                        {request.requester?.email ? `${request.requester.email} · ` : ""}
                        {new Date(request.requestedAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {request.message && (
                  <p className="mt-2.5 border-l-2 border-sts-blue/30 pl-2.5 font-sans text-[12px] leading-snug text-sts-muted">
                    {request.message}
                  </p>
                )}
              </div>

              {/* Footer — approve / decline */}
              <div className="border-t border-sts-card-border/60 px-4 py-3">
                {rejecting === request.id ? (
                  <div className="flex flex-col gap-2">
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
                  <div className="flex items-center justify-end gap-1.5">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
