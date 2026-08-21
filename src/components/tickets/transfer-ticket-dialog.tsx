"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type Destination = {
  id: string;
  name: string;
  prefix: string;
  departmentId: string | null;
  departmentName: string;
};

export function TransferTicketDialog({
  open,
  onOpenChange,
  ticketDbId,
  ticketHumanId,
  currentSubDepartmentId,
  onTransferred,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketDbId: string;
  ticketHumanId: string;
  currentSubDepartmentId: string;
  onTransferred: () => void;
}) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loadingDest, setLoadingDest] = useState(false);
  const [target, setTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget("");
    setLoadingDest(true);
    fetch("/api/transfer-destinations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load destinations"))))
      .then((rows: Destination[]) => setDestinations(rows.filter((d) => d.id !== currentSubDepartmentId)))
      .catch(() => toast.error("Could not load transfer destinations"))
      .finally(() => setLoadingDest(false));
  }, [open, currentSubDepartmentId]);

  const options: SearchableSelectOption[] = destinations.map((d) => ({
    value: d.id,
    label: `${d.departmentName} · ${d.name} (${d.prefix})`,
  }));

  async function handleTransfer() {
    if (!target) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketDbId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTeamId: target }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Transfer failed");
      onOpenChange(false);
      toast.success("Ticket transferred — you keep access to track it");
      onTransferred();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 pen-overlay-backdrop" />
        <Dialog.Popup className="pen-glass-panel fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-pen-card-border p-6 shadow-2xl">
          <Dialog.Title className="pen-text-modal-title">
            Transfer {ticketHumanId}
          </Dialog.Title>
          <Dialog.Description className="mt-2 font-sans text-[13px] text-pen-subtle">
            Move this ticket to another department or sub-department. You&apos;ll keep read access to track its progress.
          </Dialog.Description>

          <div className="mt-4">
            <label className="mb-1.5 block font-sans text-[11.5px] font-semibold text-pen-subtle">
              Destination
            </label>
            <SearchableSelect
              value={target}
              onChange={setTarget}
              options={options}
              placeholder={loadingDest ? "Loading…" : "Select a destination team…"}
              searchPlaceholder="Search departments…"
              emptyLabel={loadingDest ? "Loading…" : "No other teams available"}
              disabled={loadingDest || submitting}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={submitting || !target} onClick={handleTransfer}>
              {submitting ? <Loader2 className="animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
              Transfer
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
