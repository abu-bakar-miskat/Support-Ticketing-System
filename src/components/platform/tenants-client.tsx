"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Layers,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Users,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getAgreementExpiry, renewalStatusLabel } from "@/lib/agreement-expiry";
import { Tip } from "@/components/ui/tooltip";

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
  agreementEndDate: string | null;
  renewalStatus: string | null;
};

/** Only non-default states get a badge — "Active" on every card is noise. */
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
  return null;
}

/** One-line agreement health: end date, flagged amber/red as it nears or passes. */
function AgreementLine({ tenant }: { tenant: TenantRow }) {
  if (!tenant.agreementEndDate) {
    return (
      <span className="flex items-center gap-1.5 text-sts-subtle">
        <CalendarClock className="size-3.5 shrink-0" aria-hidden />
        No agreement on file
      </span>
    );
  }
  const flag = getAgreementExpiry(tenant.agreementEndDate, tenant.renewalStatus);
  const ends = format(new Date(tenant.agreementEndDate), "d MMM yyyy");
  return (
    <span
      className={cn(
        "flex items-center gap-1.5",
        flag.state === "expired" && "font-medium text-sts-red",
        flag.state === "expiring_soon" && "font-medium text-amber-600 dark:text-amber-400",
      )}
    >
      <CalendarClock
        className={cn("size-3.5 shrink-0", flag.state === "ok" && "text-sts-subtle")}
        aria-hidden
      />
      {flag.state === "ok" ? (
        <>
          Agreement ends {ends}
          {tenant.renewalStatus && tenant.renewalStatus !== "ACTIVE" && (
            <span className="text-sts-subtle">· {renewalStatusLabel(tenant.renewalStatus)}</span>
          )}
        </>
      ) : (
        <Tip label={`Agreement ends ${ends}`}>
          <span tabIndex={0} className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            {flag.label}
          </span>
        </Tip>
      )}
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
  onPurge,
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
  onPurge: () => void;
}) {
  const locked = tenant.deleted || tenant.status === "suspended";

  return (
    <li
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card transition-[border-color,box-shadow] duration-200 hover:border-sts-blue/30 hover:shadow-[0_6px_24px_-12px_rgb(0_0_0/0.18)] animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300",
        locked && "opacity-80",
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {/* Logo band — tenant logos are mostly wordmarks, which are unreadable
          squeezed into a square avatar. Give them room at their own aspect. */}
      <div className="relative flex h-24 items-center justify-center border-b border-sts-card-border bg-sts-surface/60 px-12">
        {tenant.logoUrl ? (
          <div className="flex h-14 max-w-full items-center justify-center rounded-lg bg-white px-3 py-2 shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tenant.logoUrl}
              alt={`${tenant.name} logo`}
              // Definite height: SVGs with only a viewBox have no intrinsic
              // size and collapse to 0×0 under max-* constraints alone.
              className="h-full w-auto max-w-[160px] object-contain"
            />
          </div>
        ) : (
          <TenantAvatar name={tenant.name} size={52} />
        )}
        <div className="absolute top-2.5 left-3">
          <StatusBadge tenant={tenant} />
        </div>
        {canManage && (
          <DropdownMenu>
            <Tip label="More actions">
              <DropdownMenuTrigger
                aria-label={`More actions for ${tenant.name}`}
                className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full text-sts-subtle outline-none transition-colors hover:bg-sts-card hover:text-sts-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-sts-card aria-expanded:text-sts-foreground"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
            </Tip>
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
                <>
                  <DropdownMenuItem onClick={onRestore}>
                    <RotateCcw className="size-3.5" />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onPurge}>
                    <Trash2 className="size-3.5" />
                    Delete permanently
                  </DropdownMenuItem>
                </>
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

      <div className="flex flex-1 flex-col gap-3 px-5 pt-4 pb-4">
        <div className="min-w-0">
          <h3 className="truncate font-sans text-[15px] font-semibold text-sts-foreground">
            {tenant.name}
          </h3>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-[11.5px] text-sts-subtle">/{tenant.slug}</span>
            <span className="shrink-0 rounded-full bg-sts-surface px-2 py-px font-sans text-[10px] font-medium text-sts-muted">
              {tenantTypeLabel(tenant.type)}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 font-sans text-[12px] text-sts-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <Layers className="size-3.5 shrink-0 text-sts-subtle" aria-hidden />
              {tenant.departments} department{tenant.departments === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5 shrink-0 text-sts-subtle" aria-hidden />
              {tenant.members} member{tenant.members === 1 ? "" : "s"}
            </span>
          </div>
          {canManage && <AgreementLine tenant={tenant} />}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-sts-card-border px-3 py-2.5">
        {canManage && (
          <Button variant="ghost" size="sm" onClick={onManage} aria-label={`Manage ${tenant.name}`}>
            <Settings className="size-3.5" aria-hidden />
            Manage
          </Button>
        )}
        {/* Outlined at rest so a grid of cards isn't a wall of primary buttons;
            fills in when its card is hovered. */}
        <Button
          variant="outline"
          size="sm"
          disabled={entering || enterDisabled || locked}
          onClick={onEnter}
          aria-label={`Enter ${tenant.name}`}
          className={cn(
            // The outline variant's dark:bg-input/30 / dark:border-input win over
            // plain hover/group-hover fills, so dark mode restates them.
            "ml-auto border-sts-blue/30 px-3.5 text-sts-blue hover:bg-sts-blue hover:text-white group-hover:border-transparent group-hover:bg-sts-blue group-hover:text-white dark:border-sts-blue/45 dark:bg-sts-blue/10 dark:hover:bg-sts-blue dark:hover:text-white dark:group-hover:border-transparent dark:group-hover:bg-sts-blue dark:group-hover:text-white",
            !canManage && "w-full",
          )}
        >
          {entering ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Entering…
            </>
          ) : (
            <>
              Enter
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </>
          )}
        </Button>
      </div>
    </li>
  );
}

/**
 * Irreversible hard-delete confirmation. Unlike the shared ConfirmDialog this
 * requires the super-admin to type the tenant's slug before the button enables —
 * a deliberate speed-bump because there is no restore after a purge.
 */
function PurgeDialog({
  tenant,
  onCancel,
  onConfirm,
}: {
  tenant: TenantRow;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const matches = value.trim() === tenant.slug;

  async function handleConfirm() {
    if (!matches) return;
    setLoading(true);
    try {
      await onConfirm();
      onCancel();
      toast.success("Tenant permanently deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog.Root open onOpenChange={(o) => { if (!o && !loading) onCancel(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 sts-overlay-backdrop" />
        <AlertDialog.Popup className="sts-glass-panel fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sts-card-border p-6 shadow-2xl">
          <AlertDialog.Title className="sts-text-modal-title">
            Permanently delete &ldquo;{tenant.name}&rdquo;?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 font-sans text-[13px] text-sts-subtle">
            This erases the tenant and <strong>all of its data</strong> — departments, tickets,
            members, mailboxes and history. This cannot be undone. Type the slug{" "}
            <code className="rounded bg-sts-surface px-1 py-0.5 font-mono text-[12px] text-sts-foreground">
              {tenant.slug}
            </code>{" "}
            to confirm.
          </AlertDialog.Description>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={tenant.slug}
            disabled={loading}
            className="mt-4 h-9"
            aria-label="Type the tenant slug to confirm"
          />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" disabled={loading} onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={loading || !matches} onClick={handleConfirm}>
              {loading && <Loader2 className="animate-spin" />}
              Delete permanently
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
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
  const [purgeTarget, setPurgeTarget] = useState<TenantRow | null>(null);
  const [query, setQuery] = useState("");

  const liveTenants = tenants.filter((t) => !t.deleted);
  const deletedTenants = tenants.filter((t) => t.deleted);

  const q = query.trim().toLowerCase();
  const matches = (t: TenantRow) =>
    !q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
  const visibleLive = liveTenants.filter(matches);
  const visibleDeleted = deletedTenants.filter(matches);

  const suspendedCount = tenants.filter((t) => !t.deleted && t.status === "suspended").length;
  const memberTotal = liveTenants.reduce((sum, t) => sum + t.members, 0);
  const deptTotal = liveTenants.reduce((sum, t) => sum + t.departments, 0);
  // Agreements expiring within the flag window or already lapsed.
  const renewalsDue = liveTenants.filter(
    (t) =>
      t.agreementEndDate &&
      getAgreementExpiry(t.agreementEndDate, t.renewalStatus).state !== "ok",
  ).length;

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

  async function purgeTenant(tenant: TenantRow) {
    const res = await fetch(`/api/admin/tenants/${tenant.id}/purge`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmSlug: tenant.slug }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to permanently delete tenant");
    }
    setTenants((prev) => prev.filter((t) => t.id !== tenant.id));
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
          <div
            className={cn(
              "mt-5 grid grid-cols-2 divide-x divide-y divide-sts-card-border overflow-hidden rounded-xl border border-sts-card-border bg-sts-card sm:divide-y-0",
              canManage ? "sm:grid-cols-4" : "sm:grid-cols-3",
            )}
          >
            {[
              {
                label: "Tenants",
                value: liveTenants.length,
                hint: suspendedCount > 0 ? `${suspendedCount} suspended` : "All active",
                warn: suspendedCount > 0,
              },
              { label: "Departments", value: deptTotal, hint: "Across all tenants", warn: false },
              { label: "Members", value: memberTotal, hint: "Distinct active users", warn: false },
              ...(canManage
                ? [
                    {
                      label: "Renewals due",
                      value: renewalsDue,
                      hint: renewalsDue > 0 ? "Expiring within 30 days or lapsed" : "All agreements current",
                      warn: renewalsDue > 0,
                    },
                  ]
                : []),
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1.5 px-4 py-3.5">
                <span className="sts-text-section-label">{stat.label}</span>
                <p
                  className={cn(
                    "font-mono text-[22px] font-semibold leading-none tracking-tight tabular-nums",
                    stat.warn ? "text-amber-600 dark:text-amber-400" : "text-sts-foreground",
                  )}
                >
                  {stat.value}
                </p>
                <span
                  className={cn(
                    "font-sans text-[11.5px]",
                    stat.warn ? "text-amber-600 dark:text-amber-400" : "text-sts-subtle",
                  )}
                >
                  {stat.hint}
                </span>
              </div>
            ))}
          </div>
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
          <>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-sans text-[14px] font-semibold text-sts-foreground">
                All tenants
                <span className="ml-2 font-mono text-[12px] font-normal text-sts-subtle tabular-nums">
                  {q ? `${visibleLive.length} of ${liveTenants.length}` : liveTenants.length}
                </span>
              </h2>
              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-sts-subtle"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or slug"
                  aria-label="Search tenants"
                  className="h-8 rounded-full pl-8 text-[12.5px]"
                />
              </div>
            </div>
            {visibleLive.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-sts-card-border py-10 text-center font-sans text-[13px] text-sts-muted">
                No tenants match &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleLive.map((t, i) => (
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
                    onPurge={() => setPurgeTarget(t)}
                  />
                ))}
              </ul>
            )}
          </>
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
                {visibleDeleted.map((t, i) => (
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
                    onPurge={() => setPurgeTarget(t)}
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

      {purgeTarget && (
        <PurgeDialog
          tenant={purgeTarget}
          onCancel={() => setPurgeTarget(null)}
          onConfirm={() => purgeTenant(purgeTarget)}
        />
      )}

      {showCreateModal && <CreateTenantModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
