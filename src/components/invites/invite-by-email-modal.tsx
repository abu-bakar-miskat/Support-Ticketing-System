"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createDepartmentInvite,
  type DepartmentInviteRow,
} from "@/lib/api/admin";

export function InviteByEmailModal({
  deptId,
  subDepartments,
  onSent,
  onClose,
}: {
  deptId: string;
  subDepartments: { id: string; name: string }[];
  onSent?: (invite: DepartmentInviteRow) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [subDepartmentId, setSubDepartmentId] = useState(subDepartments[0]?.id ?? "");
  const [role, setRole] = useState<"agent" | "sub_manager">("agent");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !subDepartmentId) {
      setError("Email and team are required");
      return;
    }
    setSaving(true);
    try {
      const invite = await createDepartmentInvite(deptId, {
        email: email.trim(),
        subDepartmentId,
        role,
        message: message.trim() || undefined,
      });
      onSent?.(invite);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pen-overlay-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
          <p className="font-sans text-[14px] font-semibold text-pen-foreground">Invite by email</p>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-pen-muted" />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-id"
            />
            <p className="mt-1.5 font-sans text-[11px] text-pen-subtle">
              Recipient must sign in with their Microsoft work account.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">
              Team
            </label>
            <SearchableSelect
              aria-label="Team"
              value={subDepartmentId}
              onChange={setSubDepartmentId}
              options={subDepartments.map((t) => ({ value: t.id, label: t.name }))}
              placeholder={subDepartments.length === 0 ? "No teams available" : "Select a team…"}
              searchPlaceholder="Search teams…"
              emptyLabel="No teams available"
              className="bg-pen-surface"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">
              Role
            </label>
            <div className="flex h-9 overflow-hidden rounded-lg border border-pen-card-border">
              {(["agent", "sub_manager"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex flex-1 items-center justify-center font-sans text-[12px] font-medium capitalize transition-colors",
                    r !== "agent" && "border-l border-pen-card-border",
                    role === r
                      ? "bg-pen-blue text-white dark:text-gray-900"
                      : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">
              Message <span className="font-normal text-pen-subtle">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Add a short note for the invitee…"
              className="w-full resize-none rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-id"
            />
          </div>
          {error && (
            <p className="font-sans text-[12px] text-red-500" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-pen-card-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg px-3 font-sans text-[12.5px] font-medium text-pen-muted hover:text-pen-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !subDepartmentId}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-pen-blue px-3 font-sans text-[12.5px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
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
