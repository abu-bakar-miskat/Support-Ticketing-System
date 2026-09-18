"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { cn } from "@/lib/utils";
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

function StatusBadge({ tenant }: { tenant: TenantRow }) {
  if (tenant.deleted) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-sts-red/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-red">
        Deleted
      </span>
    );
  }
  if (tenant.status === "suspended") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-sts-green/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-green">
      Active
    </span>
  );
}

function TenantCard({
  tenant,
  canManage,
  entering,
  enterDisabled,
  index,
  onEnter,
  onManage,
  onSuspend,
  onReactivate,
  onDelete,
  onRestore,
}: {
  tenant: TenantRow;
  canManage: boolean;
  /** True only for the card whose Enter was clicked. */
  entering: boolean;
  /** True while any Enter is in flight — disables other cards without the loading label. */
  enterDisabled: boolean;
  index: number;
  onEnter: () => void;
  onManage: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const locked = tenant.deleted || tenant.status === "suspended";

  return (
    <li
      className="flex flex-col rounded-2xl border border-sts-card-border bg-sts-card transition-colors hover:border-sts-blue/30 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        <TenantAvatar name={tenant.name} logoUrl={tenant.logoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate font-sans text-[15px] font-semibold text-sts-foreground">
              {tenant.name}
            </h3>
            <StatusBadge tenant={tenant} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-[11.5px] text-sts-subtle">/{tenant.slug}</span>
            <span className="rounded-full bg-sts-surface px-2 py-px font-sans text-[10px] font-medium text-sts-muted">
              {tenantTypeLabel(tenant.type)}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[12px] text-sts-muted">
            <span className="flex items-center gap-1">
              <Layers className="size-3.5 shrink-0 text-sts-subtle" />
              {tenant.departments} department{tenant.departments === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5 shrink-0 text-sts-subtle" />
              {tenant.members} member{tenant.members === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More actions for ${tenant.name}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-sts-subtle outline-none transition-colors hover:bg-sts-surface hover:text-sts-foreground"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onClick={onManage}>
                <Settings className="size-3.5" />
                Manage
              </DropdownMenuItem>
              {!tenant.deleted &&
                (tenant.status === "suspended" ? (
                  <DropdownMenuItem onClick={onReactivate}>
                    <PlayCircle className="size-3.5" />
                    Reactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onSuspend}>
                    <PauseCircle className="size-3.5" />
                    Suspend
                  </DropdownMenuItem>
                ))}
              {tenant.deleted ? (
                <DropdownMenuItem onClick={onRestore}>
                  <RotateCcw className="size-3.5" />
                  Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-sts-card-border px-5 py-3.5">
        {canManage && (
          <button
            type="button"
            onClick={onManage}
            className="font-sans text-[12.5px] font-medium text-sts-muted transition-colors hover:text-sts-blue"
          >
            Manage
          </button>
        )}
        <button
          type="button"
          disabled={entering || enterDisabled || locked}
          onClick={onEnter}
          className={cn(
            "ml-auto flex items-center justify-center gap-2 rounded-full bg-sts-blue px-4 py-2.5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900",
            !canManage && "w-full",
          )}
        >
          {entering ? (
            "Entering…"
          ) : (
            <>
              Enter
              <ArrowRight className="size-3.5" />
            </>
          )}
        </button>
      </div>
    </li>
  );
}

export function TenantsClient({
  tenants: initialTenants,
  canManage,
}: {
  tenants: TenantRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tenants, setTenants] = useState(initialTenants);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ action: "suspend" | "delete"; tenant: TenantRow } | null>(
    null,
  );

  const liveTenants = tenants.filter((t) => !t.deleted);
  const deletedTenants = tenants.filter((t) => t.deleted);

  const activeCount = tenants.filter((t) => !t.deleted && t.status !== "suspended").length;
  const suspendedCount = tenants.filter((t) => !t.deleted && t.status === "suspended").length;
  const memberTotal = liveTenants.reduce((sum, t) => sum + t.members, 0);
  const deptTotal = liveTenants.reduce((sum, t) => sum + t.departments, 0);

  // Enter leaves busy set while navigating away. Returning via back (bfcache),
  // soft nav, or remount must clear it or every Enter button stays disabled.
  useEffect(() => {
    setBusy(null);
  }, [pathname]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function enterTenant(tenantId: string) {
    if (busy) return;
    setBusy(`enter-${tenantId}`);
    setError(null);
    const res = await fetch("/api/active-tenant", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to enter tenant");
      setBusy(null);
      return;
    }
    const { slug } = await res.json().catch(() => ({ slug: "" }));
    // Full navigation so the new cookies are the only source of truth.
    window.location.assign(slug ? `/${slug}/departments` : "/departments");
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
          iconClassName="text-sts-blue"
          title="Tenants"
          description="Browse independent organisations. Enter to work inside a tenant, or Manage for branding and settings."
          actions={
            canManage && (
              <Button size="lg" onClick={() => setShowCreateModal(true)}>
                <Plus className="size-4" />
                Create tenant
              </Button>
            )
          }
        />

        {/* Overview band */}
        {liveTenants.length > 0 && (
          <div className="mt-5 grid grid-cols-2 divide-x divide-y divide-sts-card-border overflow-hidden rounded-xl border border-sts-card-border bg-sts-card sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: "Tenants", value: liveTenants.length },
              { label: "Active", value: activeCount },
              { label: "Departments", value: deptTotal },
              { label: "Members", value: memberTotal },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1.5 px-3.5 py-3">
                <span className="sts-text-section-label">{stat.label}</span>
                <p className="font-mono text-[22px] font-semibold leading-none tracking-tight text-sts-foreground">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {suspendedCount > 0 && (
          <p className="mt-2 font-sans text-[12px] text-amber-600 dark:text-amber-400">
            {suspendedCount} suspended tenant{suspendedCount === 1 ? "" : "s"} — members are locked out until reactivated.
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {liveTenants.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-sts-card-border py-16 text-center">
            <Building2 className="size-8 text-sts-subtle" strokeWidth={1.2} />
            <p className="font-sans text-[13px] text-sts-muted">
              {deletedTenants.length > 0
                ? "No active tenants. Deleted tenants are hidden below."
                : "No tenants yet. Create one to get started."}
            </p>
            {canManage && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="size-4" />
                Create tenant
              </Button>
            )}
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {liveTenants.map((t, i) => (
              <TenantCard
                key={t.id}
                tenant={t}
                canManage={canManage}
                entering={busy === `enter-${t.id}`}
                enterDisabled={!!busy?.startsWith("enter-") && busy !== `enter-${t.id}`}
                index={i}
                onEnter={() => enterTenant(t.id)}
                onManage={() => router.push(`/platform/${t.id}`)}
                onSuspend={() => setConfirmTarget({ action: "suspend", tenant: t })}
                onReactivate={() => setTenantStatus(t.id, "active")}
                onDelete={() => setConfirmTarget({ action: "delete", tenant: t })}
                onRestore={() => restoreTenant(t.id)}
              />
            ))}
          </ul>
        )}

        {deletedTenants.length > 0 && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setShowDeleted((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-sts-card-border bg-sts-card px-3.5 py-2 font-sans text-[12.5px] font-medium text-sts-muted transition-colors hover:border-sts-red/30 hover:text-sts-red"
            >
              <Trash2 className="size-3.5" />
              {showDeleted ? "Hide" : "Show"} deleted tenant{deletedTenants.length === 1 ? "" : "s"} ({deletedTenants.length})
            </button>

            {showDeleted && (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {deletedTenants.map((t, i) => (
                  <TenantCard
                    key={t.id}
                    tenant={t}
                    canManage={canManage}
                    entering={busy === `enter-${t.id}`}
                enterDisabled={!!busy?.startsWith("enter-") && busy !== `enter-${t.id}`}
                    index={i}
                    onEnter={() => enterTenant(t.id)}
                    onManage={() => router.push(`/platform/${t.id}`)}
                    onSuspend={() => setConfirmTarget({ action: "suspend", tenant: t })}
                    onReactivate={() => setTenantStatus(t.id, "active")}
                    onDelete={() => setConfirmTarget({ action: "delete", tenant: t })}
                    onRestore={() => restoreTenant(t.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {canManage && tenants.length > 0 && <TenantStatusSummary />}
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
