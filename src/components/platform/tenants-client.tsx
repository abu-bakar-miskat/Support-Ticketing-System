"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Layers,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Users,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TenantAvatar } from "@/components/platform/tenant-avatar";
import { TenantStatusSummary } from "@/components/platform/tenant-status-summary";
import { CreateTenantModal } from "@/components/platform/create-tenant-modal";
import { tenantTypeLabel } from "@/lib/tenant-types";

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  deleted: boolean;
  logoUrl: string | null;
  departments: number;
  members: number;
};

export function TenantsClient({
  tenants: initialTenants,
  canManage,
}: {
  tenants: TenantRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [tenants, setTenants] = useState(initialTenants);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ action: "suspend" | "delete"; tenant: TenantRow } | null>(
    null,
  );

  async function enterTenant(tenantId: string) {
    setBusy(`enter-${tenantId}`);
    setError(null);
    const res = await fetch("/api/active-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to enter tenant");
      setBusy(null);
      return;
    }
    window.location.href = "/departments";
  }

  async function setTenantStatus(tenantId: string, status: "active" | "suspended") {
    const res = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to update tenant status");
    }
    setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, status } : t)));
  }

  async function deleteTenant(tenantId: string) {
    const res = await fetch(`/api/admin/tenants/${tenantId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to delete tenant");
    }
    setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, deleted: true } : t)));
  }

  async function restoreTenant(tenantId: string) {
    const res = await fetch(`/api/admin/tenants/${tenantId}/restore`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to restore tenant");
    }
    setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, deleted: false } : t)));
  }

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={Building2}
          title="Tenants"
          description="Each tenant is fully independent, with its own departments, members, theme, and data. Enter a tenant to work inside its scope, or manage its branding without switching."
          actions={
            canManage && (
              <Button size="lg" onClick={() => setShowCreateModal(true)}>
                <Plus className="size-4" />
                Create tenant
              </Button>
            )
          }
        />

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {/* List */}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tenants.map((t) => {
            return (
              <li
                key={t.id}
                className="group flex flex-col rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card transition-all duration-200 hover:-translate-y-0.5 hover:border-pen-muted/40 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <TenantAvatar name={t.name} logoUrl={t.logoUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-sans text-[14.5px] font-semibold text-pen-foreground">
                        {t.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-pen-blue-tint px-2 py-0.5 font-sans text-[10.5px] font-medium text-pen-blue">
                        {tenantTypeLabel(t.type)}
                      </span>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`More actions for ${t.name}`}
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/platform/${t.id}`)}>
                              <Settings />
                              Manage
                            </DropdownMenuItem>
                            {!t.deleted &&
                              (t.status === "suspended" ? (
                                <DropdownMenuItem onClick={() => setTenantStatus(t.id, "active")}>
                                  <PlayCircle />
                                  Reactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setConfirmTarget({ action: "suspend", tenant: t })}>
                                  <PauseCircle />
                                  Suspend
                                </DropdownMenuItem>
                              ))}
                            {t.deleted ? (
                              <DropdownMenuItem onClick={() => restoreTenant(t.id)}>
                                <RotateCcw />
                                Restore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setConfirmTarget({ action: "delete", tenant: t })}
                              >
                                <Trash2 />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="truncate font-mono text-[11px] text-pen-subtle">
                        /{t.slug}
                      </span>
                      {t.deleted ? (
                        <span className="shrink-0 rounded-full bg-pen-red/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-pen-red">
                          Deleted
                        </span>
                      ) : t.status === "suspended" ? (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Suspended
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 border-t border-pen-card-border/60 pt-3 font-sans text-[12px] text-pen-muted">
                  <span className="flex items-center gap-1.5">
                    <Layers className="size-3.5 text-pen-subtle" />
                    {t.departments} dept{t.departments === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5 text-pen-subtle" />
                    {t.members} member{t.members === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="lg"
                    className="flex-1"
                    onClick={() => enterTenant(t.id)}
                    disabled={busy === `enter-${t.id}`}
                  >
                    {busy === `enter-${t.id}` ? (
                      "Entering…"
                    ) : (
                      <>
                        Enter
                        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {canManage && <TenantStatusSummary />}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => !open && setConfirmTarget(null)}
          title={
            confirmTarget.action === "suspend"
              ? `Suspend "${confirmTarget.tenant.name}"?`
              : `Delete "${confirmTarget.tenant.name}"?`
          }
          description={
            confirmTarget.action === "suspend"
              ? "Every member of this tenant will be locked out immediately until it's reactivated. No data is removed."
              : "This is a soft-delete — members lose access until it's restored, but no data is removed. You can restore it anytime."
          }
          confirmLabel={confirmTarget.action === "suspend" ? "Suspend" : "Delete"}
          successMessage={confirmTarget.action === "suspend" ? "Tenant suspended." : "Tenant deleted."}
          onConfirm={() =>
            confirmTarget.action === "suspend"
              ? setTenantStatus(confirmTarget.tenant.id, "suspended")
              : deleteTenant(confirmTarget.tenant.id)
          }
        />
      )}

      {showCreateModal && <CreateTenantModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
