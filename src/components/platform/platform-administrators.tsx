"use client";

import { useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";

type AdminRow = { id: string; name: string; email: string; avatarUrl: string | null };

export function PlatformAdministrators({
  admins: initialAdmins,
  currentUserId,
}: {
  admins: AdminRow[];
  currentUserId: string;
}) {
  const [admins, setAdmins] = useState<AdminRow[]>(initialAdmins);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchSeq = useRef(0);

  function onQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(value.trim())}`).catch(() => null);
      if (seq !== searchSeq.current) return;
      const body = res && res.ok ? await res.json().catch(() => ({ users: [] })) : { users: [] };
      setSearchResults(body.users ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }

  async function addAdmin(user: AdminRow) {
    setQuery("");
    setSearchResults([]);
    setSearchOpen(false);
    setError(null);
    setBusyId(user.id);
    const res = await fetch("/api/admin/super-admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(body.error ?? "Failed to grant super-admin access");
      return;
    }
    setAdmins((prev) =>
      prev.some((a) => a.id === user.id) ? prev : [...prev, body.admin].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  async function removeAdmin(user: AdminRow) {
    setError(null);
    setBusyId(user.id);
    const res = await fetch("/api/admin/super-admins", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to remove super-admin access");
      return;
    }
    setAdmins((prev) => prev.filter((a) => a.id !== user.id));
  }

  const existingIds = new Set(admins.map((a) => a.id));

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={ShieldCheck}
          title="Platform administrators"
          description="Super admins can manage every tenant, template, and feature flag on the platform. Grant this sparingly."
        />

        <div className="mt-6 max-w-sm">
          <label className="mb-1.5 block font-sans text-[12.5px] font-medium text-pen-foreground">
            Add administrator
          </label>
          <div className="relative">
            <Input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search a name or email"
              className="h-9 w-full"
              autoComplete="off"
            />
            {searchOpen && query.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-pen-card-border bg-pen-bg shadow-xl">
                {searching ? (
                  <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">No matching users.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto p-1">
                    {searchResults.map((u) => {
                      const already = existingIds.has(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          disabled={already}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addAdmin(u)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-pen-surface disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={22} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                              {u.name || u.email}
                            </div>
                            <div className="truncate font-sans text-[11px] text-pen-subtle">{u.email}</div>
                          </div>
                          {already && <span className="font-sans text-[11px] text-pen-subtle">Already admin</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        <div className="mt-8">
          <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">
            Current administrators ({admins.length})
          </h2>
          <div className="mt-3 flex flex-col gap-1 rounded-xl border border-pen-card-border bg-pen-card p-2 shadow-pen-card">
            {admins.map((admin) => {
              const isSelf = admin.id === currentUserId;
              return (
                <div key={admin.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar name={admin.name} avatarUrl={admin.avatarUrl} size={28} />
                    <div className="min-w-0">
                      <div className="truncate font-sans text-[13px] font-medium text-pen-foreground">
                        {admin.name || admin.email}
                        {isSelf && <span className="ml-1.5 font-sans text-[11px] text-pen-subtle">(you)</span>}
                      </div>
                      <div className="truncate font-sans text-[11.5px] text-pen-subtle">{admin.email}</div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSelf || busyId === admin.id}
                    title={isSelf ? "You can't remove your own super-admin access" : undefined}
                    onClick={() => removeAdmin(admin)}
                  >
                    <X className="size-3.5" />
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
