"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createTenantInvite } from "@/lib/api/admin";

type Role = "admin" | "manager" | "sub_manager" | "agent";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  sub_manager: "Sub-manager",
  agent: "Agent",
};

const ROLE_HINTS: Record<Role, string> = {
  admin: "Full access across the whole tenant.",
  manager: "Manages a single department.",
  sub_manager: "Leads a sub-department.",
  agent: "Works tickets in a sub-department.",
};

/**
 * Tenant-scoped, role-first invite. The role chosen at the top decides which
 * targets are needed: admin = tenant-wide, manager = one department,
 * sub_manager/agent = department + sub-department. Only tenant admins may invite
 * admins/managers (`canInvitePrivileged`); the server enforces this too.
 */
export function InviteMemberModal({
  tenantId,
  canInvitePrivileged,
  departments,
  subDepartments,
  onSent,
  onClose,
}: {
  tenantId: string;
  canInvitePrivileged: boolean;
  departments: { id: string; name: string }[];
  subDepartments: { id: string; name: string; departmentId?: string | null }[];
  onSent?: () => void;
  onClose: () => void;
}) {
  const roleOptions: Role[] = canInvitePrivileged
    ? ["admin", "manager", "sub_manager", "agent"]
    : ["sub_manager", "agent"];

  const [role, setRole] = useState<Role>(roleOptions.includes("agent") ? "agent" : roleOptions[0]);
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const subOptions = subDepartments.filter(
    (s) => s.departmentId == null || s.departmentId === departmentId,
  );
  const [subDepartmentId, setSubDepartmentId] = useState(subOptions[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsDept = role === "manager" || role === "sub_manager" || role === "agent";
  const needsSubDept = role === "sub_manager" || role === "agent";

  function changeDept(next: string) {
    setDepartmentId(next);
    const first = subDepartments.find((s) => s.departmentId == null || s.departmentId === next);
    setSubDepartmentId(first?.id ?? "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (role === "manager" && !departmentId) {
      setError("Select a department");
      return;
    }
    if (needsSubDept && !subDepartmentId) {
      setError("Select a sub-department");
      return;
    }
    setSaving(true);
    try {
      await createTenantInvite(tenantId, {
        email: email.trim(),
        role,
        departmentIds: role === "manager" ? [departmentId] : undefined,
        subDepartmentId: needsSubDept ? subDepartmentId : null,
        message: message.trim() || undefined,
      });
      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sts-overlay-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
          <p className="font-sans text-[14px] font-semibold text-sts-foreground">Invite new member</p>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-sts-muted" />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 px-5 py-4">
          {/* Role first — decides which targets are needed. */}
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Role</label>
            <div className="grid grid-cols-2 gap-1.5">
              {roleOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors",
                    role === r
                      ? "border-sts-blue bg-sts-blue/10"
                      : "border-sts-card-border bg-sts-surface hover:border-sts-blue/40",
                  )}
                >
                  <span
                    className={cn(
                      "font-sans text-[12.5px] font-semibold",
                      role === r ? "text-sts-blue" : "text-sts-foreground",
                    )}
                  >
                    {ROLE_LABELS[r]}
                  </span>
                  <span className="font-sans text-[10.5px] text-sts-subtle">{ROLE_HINTS[r]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-id"
            />
            <p className="mt-1.5 font-sans text-[11px] text-sts-subtle">
              Recipient must sign in with their Microsoft work account.
            </p>
          </div>

          {needsDept && (
            <div>
              <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Department</label>
              <SearchableSelect
                aria-label="Department"
                value={departmentId}
                onChange={changeDept}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                placeholder="Select a department…"
                searchPlaceholder="Search departments…"
                className="w-full bg-sts-surface"
              />
            </div>
          )}

          {needsSubDept && (
            <div>
              <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">
                Sub-department
              </label>
              <SearchableSelect
                aria-label="Sub-department"
                value={subDepartmentId}
                onChange={setSubDepartmentId}
                options={subOptions.map((t) => ({ value: t.id, label: t.name }))}
                placeholder={subOptions.length === 0 ? "No sub departments available" : "Select a sub department…"}
                searchPlaceholder="Search sub departments…"
                emptyLabel="No sub departments available"
                className="w-full bg-sts-surface"
              />
            </div>
          )}

          {role === "admin" && (
            <p className="rounded-lg border border-sts-card-border bg-sts-surface px-3 py-2 font-sans text-[11.5px] text-sts-muted">
              Admins have full access across the whole tenant — no department needed.
            </p>
          )}

          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">
              Message <span className="font-normal text-sts-subtle">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Add a short note for the invitee…"
              className="w-full resize-none rounded-lg border border-sts-card-border bg-sts-surface px-3 py-2 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-id"
            />
          </div>

          {error && (
            <p className="font-sans text-[12px] text-red-500" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-sts-card-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-full px-3 font-sans text-[12.5px] font-medium text-sts-muted hover:text-sts-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (needsSubDept && !subDepartmentId) || (role === "manager" && !departmentId)}
              className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[12.5px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Send invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
