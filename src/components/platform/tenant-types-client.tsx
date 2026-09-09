"use client";

import { useState } from "react";
import { Tags, MoreHorizontal, Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TenantTypeModal, type TenantTypeRow } from "@/components/platform/tenant-type-modal";

export function TenantTypesClient({
  types,
  canManage,
}: {
  types: TenantTypeRow[];
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantTypeRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantTypeRow | null>(null);

  async function deleteType(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/tenant-types/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to delete tenant type");
    }
    window.location.reload();
  }

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={Tags}
          title="Tenant Types"
          description="Categories a tenant can be classified as. Each type's key is the value stored on a tenant; the label is what's shown throughout the platform."
          actions={
            canManage && (
              <Button size="lg" onClick={() => setShowCreate(true)}>
                <Plus className="size-4" />
                Create type
              </Button>
            )
          }
        />

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {types.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-sts-card-border bg-sts-card/50 px-6 py-12 text-center">
            <Tags className="mx-auto size-6 text-sts-subtle" />
            <p className="mt-3 font-sans text-[13.5px] font-medium text-sts-foreground">No tenant types yet</p>
            <p className="mt-1 font-sans text-[12.5px] text-sts-muted">
              Create your first type to start classifying tenants.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {types.map((t) => (
              <li
                key={t.id}
                className="group flex flex-col rounded-xl border border-sts-card-border bg-sts-card p-4 shadow-sts-card transition-all duration-200 hover:-translate-y-0.5 hover:border-sts-muted/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[14.5px] font-semibold text-sts-foreground">
                      {t.label}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-sts-subtle">{t.key}</span>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`More actions for ${t.label}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-sts-subtle transition-colors hover:bg-sts-surface hover:text-sts-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(t)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(t)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {t.description && (
                  <p className="mt-2 line-clamp-2 font-sans text-[12px] text-sts-muted">{t.description}</p>
                )}

                <div className="mt-3 flex items-center gap-1.5 border-t border-sts-card-border/60 pt-3 font-sans text-[12px] text-sts-muted">
                  <Building2 className="size-3.5 text-sts-subtle" />
                  {t.tenants} tenant{t.tenants === 1 ? "" : "s"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && <TenantTypeModal onClose={() => setShowCreate(false)} />}
      {editTarget && <TenantTypeModal existing={editTarget} onClose={() => setEditTarget(null)} />}

      {deleteTarget && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`Delete "${deleteTarget.label}"?`}
          description={
            deleteTarget.tenants > 0
              ? `${deleteTarget.tenants} tenant${deleteTarget.tenants === 1 ? "" : "s"} still use this type, so it can't be deleted until they're reassigned.`
              : "This removes the type from the catalog. Existing tenants aren't affected."
          }
          confirmLabel="Delete"
          successMessage="Tenant type deleted."
          onConfirm={() => deleteType(deleteTarget.id)}
        />
      )}
    </div>
  );
}
