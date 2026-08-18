"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TenantAvatar } from "@/components/tenants/tenant-avatar";
import {
  TENANT_TYPES,
  DEFAULT_TENANT_TYPE,
  tenantTypeLabel,
} from "@/lib/tenant-types";

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  logoUrl: string | null;
  departments: number;
  members: number;
};

export function TenantsClient({
  tenants,
  canManage,
}: {
  tenants: TenantRow[];
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(DEFAULT_TENANT_TYPE);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("create");
    setError(null);
    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create tenant");
      setBusy(null);
      return;
    }
    window.location.reload();
  }

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

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <PageHeader
          icon={Building2}
          title="Tenants"
          description="Each tenant is fully independent, with its own departments, members, theme, and data. Enter a tenant to work inside its scope, or manage its branding without switching."
        />

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {/* Create */}
        {canManage && (
          <form
            onSubmit={createTenant}
            className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-pen-card-border bg-pen-card p-3 shadow-pen-card"
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New tenant name"
              className="h-9 flex-1"
            />
            <Select
              value={type}
              onValueChange={(v) => setType(v ?? DEFAULT_TENANT_TYPE)}
            >
              <SelectTrigger className="h-9 min-w-[130px]">
                <span className="font-sans text-[12.5px]">
                  {tenantTypeLabel(type)}
                </span>
              </SelectTrigger>
              <SelectContent>
                {TENANT_TYPES.map((t) => (
                  <SelectItem
                    key={t}
                    value={t}
                    className="font-sans text-[12.5px]"
                  >
                    {tenantTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="submit"
              size="lg"
              disabled={busy === "create" || !name.trim()}
            >
              <Plus className="size-4" />
              {busy === "create" ? "Creating…" : "Create tenant"}
            </Button>
          </form>
        )}

        {/* List */}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {tenants.map((t) => {
            return (
              <li
                key={t.id}
                className="flex flex-col rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card"
              >
                <div className="flex items-start gap-3">
                  <TenantAvatar name={t.name} logoUrl={t.logoUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[14px] font-semibold text-pen-foreground">
                      {t.name}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[11.5px] text-pen-muted">
                      <span className="text-pen-subtle">/{t.slug}</span>
                      <span className="rounded-full bg-pen-blue-tint px-2 py-0.5 font-medium text-pen-blue">
                        {tenantTypeLabel(t.type)}
                      </span>
                      <span>
                        {t.departments} dept{t.departments === 1 ? "" : "s"} ·{" "}
                        {t.members} member
                        {t.members === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {canManage && (
                    <Link
                      href={`/tenants/${t.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "lg" }),
                        "flex-1",
                      )}
                    >
                      Manage
                    </Link>
                  )}
                  <Button
                    size="lg"
                    className="flex-1"
                    onClick={() => enterTenant(t.id)}
                    disabled={busy === `enter-${t.id}`}
                  >
                    {busy === `enter-${t.id}` ? "Entering…" : "Enter"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
