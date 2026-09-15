"use client";

import { X } from "lucide-react";
import { PlatformActivityLog } from "@/components/platform/platform-activity-log";

/**
 * Per-user audit trail (drill-down). Renders the shared audit log in compact
 * mode, scoped to one target profile — the immutable record of privileged
 * changes made to this user (admin grant/revoke, role changes, activation,
 * deletion). Read-only.
 */
export function UserAuditModal({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 sts-overlay-backdrop" onClick={onClose} />
      <div
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-sts-card-border shadow-2xl"
        style={{ background: "var(--sts-card-solid)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-sts-card-border px-6 py-4">
          <div>
            <h2 className="sts-text-modal-title">Audit log</h2>
            <p className="mt-0.5 font-sans text-[12px] text-sts-muted">{userName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-sts-card-border p-1.5 text-sts-subtle hover:text-sts-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <PlatformActivityLog
            tenants={[]}
            actors={[]}
            fixedTargetType="Profile"
            targetId={userId}
            compact
          />
        </div>
      </div>
    </div>
  );
}
