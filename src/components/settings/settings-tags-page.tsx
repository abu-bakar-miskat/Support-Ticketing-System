"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TagPill } from "@/components/board/tag-pill";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export type TagRow = {
  id: string;
  name: string;
  color: string;
  count: number;
};

const COLOR_PRESETS = [
  "#94a3b8", "#0a76b9", "#16a34a", "#dc2626",
  "#f97316", "#7c3aed", "#eab308", "#ec4899",
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
      {children}
    </span>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "size-5 rounded-full transition-transform hover:scale-110",
            value === c && "ring-2 ring-offset-1 ring-pen-foreground",
          )}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

export function SettingsTagsPage({ labels: initial }: { labels: TagRow[] }) {
  const queryClient = useQueryClient();
  const [labels, setLabels] = useState<TagRow[]>(initial);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TagRow | null>(null);

  async function handleCreate() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Failed"); return; }
      const label = await res.json();
      setLabels((prev) => [...prev, { ...label, count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      queryClient.invalidateQueries({ queryKey: ["labels"] });
      setCreating(false);
      setNewName("");
      setNewColor(COLOR_PRESETS[0]);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(label: TagRow) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setCreating(false);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Failed"); return; }
      const updated = await res.json();
      setLabels((prev) => prev.map((l) => l.id === id ? { ...l, ...updated } : l));
      queryClient.invalidateQueries({ queryKey: ["labels"] });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(label: TagRow) {
    const res = await fetch(`/api/labels/${label.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete label");
    setLabels((prev) => prev.filter((l) => l.id !== label.id));
    queryClient.invalidateQueries({ queryKey: ["labels"] });
  }

  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title="Delete label"
        description={confirmDelete ? `Delete "${confirmDelete.name}"? It will be removed from all tickets.` : ""}
        confirmLabel="Delete"
        successMessage={confirmDelete ? `"${confirmDelete.name}" deleted` : undefined}
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete); }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="pen-text-admin-title">Tags & labels</h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">Categorise tickets across projects.</p>
        </div>
        <Button
          onClick={() => { setCreating(true); setEditingId(null); }}
          className="h-[34px] w-full shrink-0 gap-1.5 rounded-[7px] bg-pen-blue px-0 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90 sm:w-[140px]"
        >
          <Plus className="size-[13px]" strokeWidth={2.5} />
          New label
        </Button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
              <TableHead className="h-8 w-[40%]"><SectionLabel>Label</SectionLabel></TableHead>
              <TableHead className="h-8 w-[24%]"><SectionLabel>Color</SectionLabel></TableHead>
              <TableHead className="h-8 w-[20%]"><SectionLabel>Used by</SectionLabel></TableHead>
              <TableHead className="h-8 w-[16%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Create row */}
            {creating && (
              <TableRow className="border-[#f0f4f8] dark:border-[#3a3a37]">
                <TableCell className="py-0">
                  <div className="flex h-[54px] items-center">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                      placeholder="Label name…"
                      className="w-full rounded-md border border-pen-card-border bg-pen-surface px-2.5 py-1.5 font-sans text-[12.5px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue"
                    />
                  </div>
                </TableCell>
                <TableCell className="py-0">
                  <div className="flex h-[54px] items-center">
                    <ColorPicker value={newColor} onChange={setNewColor} />
                  </div>
                </TableCell>
                <TableCell />
                <TableCell className="py-0 text-right">
                  <div className="flex h-[54px] items-center justify-end gap-1">
                    <button type="button" onClick={handleCreate} disabled={saving} className="flex size-7 items-center justify-center rounded-md bg-pen-blue text-white hover:bg-pen-blue/90 disabled:opacity-50">
                      <Check className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => setCreating(false)} className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface">
                      <X className="size-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {labels.length === 0 && !creating ? (
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableCell colSpan={4} className="py-0">
                  <div className="flex h-[46px] items-center">
                    <span className="font-sans text-[11.5px] text-pen-muted">No labels yet</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {labels.map((label) => (
              <TableRow key={label.id} className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]">
                <TableCell className="py-0">
                  <div className="flex h-[46px] items-center">
                    {editingId === label.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(label.id); if (e.key === "Escape") setEditingId(null); }}
                        className="w-full rounded-md border border-pen-card-border bg-pen-surface px-2.5 py-1.5 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue"
                      />
                    ) : (
                      <TagPill label={label.name} color={label.color} size="md" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-0">
                  <div className="flex h-[46px] items-center">
                    {editingId === label.id ? (
                      <ColorPicker value={editColor} onChange={setEditColor} />
                    ) : (
                      <span className="size-4 rounded-full" style={{ backgroundColor: label.color }} />
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-0">
                  <div className="flex h-[46px] items-center">
                    <span className="font-sans text-[11.5px] text-pen-muted">{label.count} {label.count === 1 ? "ticket" : "tickets"}</span>
                  </div>
                </TableCell>
                <TableCell className="py-0 text-right">
                  <div className="flex h-[46px] items-center justify-end gap-1">
                    {editingId === label.id ? (
                      <>
                        <button type="button" onClick={() => handleSaveEdit(label.id)} disabled={saving} className="flex size-7 items-center justify-center rounded-md bg-pen-blue text-white hover:bg-pen-blue/90 disabled:opacity-50">
                          <Check className="size-3.5" />
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface">
                          <X className="size-3.5" />
                        </button>
                      </>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger type="button" className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground" aria-label={`Actions for ${label.name}`}>
                          <MoreHorizontal className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-36">
                          <DropdownMenuItem className="font-sans text-xs" onClick={() => startEdit(label)}>Edit label</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" className="font-sans text-xs" onClick={() => setConfirmDelete(label)}>Delete label</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
