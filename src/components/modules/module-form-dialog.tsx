"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateModule, useUpdateModule } from "@/hooks/queries/use-modules";
import type { ModuleRollup } from "@/lib/api/modules";
import { cn } from "@/lib/utils";

export type ModuleFormProjectOption = {
  id: string;
  name: string;
  color: string | null;
  moduleSystemEnabled: boolean;
  department: { id: string; name: string } | null;
};

type ModuleFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Default project when opening create (current page selection). */
  projectId: string;
  /** All in-scope projects for the create picker (grouped by department). */
  projects: ModuleFormProjectOption[];
  /** When set, the dialog edits this module; otherwise it creates a new one. */
  module?: Pick<ModuleRollup, "id" | "name" | "description"> | null;
  /** Called after a successful create so the page can switch to that project. */
  onCreated?: (projectId: string) => void;
};

export function ModuleFormDialog({
  open,
  onOpenChange,
  projectId,
  projects,
  module = null,
  onCreated,
}: ModuleFormDialogProps) {
  const isEdit = !!module;
  const [name, setName] = useState(module?.name ?? "");
  const [description, setDescription] = useState(module?.description ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(module?.name ?? "");
      setDescription(module?.description ?? "");
      setSelectedProjectId(projectId);
      setError(null);
    }
  }, [open, module, projectId]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const targetProjectId = isEdit ? projectId : selectedProjectId;

  const projectsByDept = useMemo(() => {
    const groups = new Map<string, { label: string; projects: ModuleFormProjectOption[] }>();
    for (const p of projects) {
      const key = p.department?.id ?? "__none__";
      const label = p.department?.name ?? "Other projects";
      const g = groups.get(key) ?? { label, projects: [] };
      g.projects.push(p);
      groups.set(key, g);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "__none__") return 1;
      if (b[0] === "__none__") return -1;
      return a[1].label.localeCompare(b[1].label);
    });
  }, [projects]);

  const createMutation = useCreateModule({
    onSuccess: (_data, vars) => {
      const p = projects.find((x) => x.id === vars.projectId);
      const willEnable = p && !p.moduleSystemEnabled;
      toast.success(
        willEnable
          ? `Module created — module system enabled for ${p.name}`
          : `Module created in ${p?.name ?? "project"}`,
      );
      onCreated?.(vars.projectId);
      onOpenChange(false);
    },
    onError: (err) => setError(err.message),
  });
  const updateMutation = useUpdateModule({
    onSuccess: () => {
      toast.success("Module updated");
      onOpenChange(false);
    },
    onError: (err) => setError(err.message),
  });
  const saving = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Module name is required");
      return;
    }
    if (!isEdit && !selectedProjectId) {
      setError("Select a project");
      return;
    }
    setError(null);
    if (isEdit && module) {
      updateMutation.mutate({
        id: module.id,
        projectId: targetProjectId,
        body: { name: trimmed, description: description.trim() || null },
      });
    } else {
      createMutation.mutate({
        projectId: selectedProjectId,
        name: trimmed,
        description: description.trim() || null,
      });
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 pen-overlay-backdrop transition-opacity duration-200" />
        <Dialog.Popup className="pen-glass-panel fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-pen-card-border shadow-2xl">
          <div className="flex items-center justify-between border-b border-pen-card-border px-6 py-4">
            <Dialog.Title className="pen-text-modal-title">
              {isEdit ? "Edit module" : "New module"}
            </Dialog.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-md p-1 text-pen-subtle hover:text-pen-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
            {isEdit ? (
              <p className="flex min-w-0 items-center gap-1.5 font-sans text-[12px] text-pen-muted">
                <span className="shrink-0">In</span>
                <span
                  className="size-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: selectedProject?.color ?? "#0a76b9" }}
                  aria-hidden
                />
                <span className="truncate font-medium text-pen-foreground">
                  {selectedProject?.name ?? "project"}
                </span>
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="pen-text-label">
                  Project <span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedProjectId}
                  onValueChange={(v) => {
                    if (v) setSelectedProjectId(v);
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      "h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground",
                    )}
                  >
                    <SelectValue placeholder="Select a project">
                      {selectedProject ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-sm"
                            style={{ backgroundColor: selectedProject.color ?? "#0a76b9" }}
                          />
                          <span className="truncate">{selectedProject.name}</span>
                        </span>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto font-sans">
                    {projectsByDept.map(([key, group]) => (
                      <SelectGroup key={key}>
                        <SelectLabel className="px-2 py-1.5 font-sans text-[10.5px] font-semibold uppercase tracking-wide text-pen-subtle">
                          {group.label}
                        </SelectLabel>
                        {group.projects.map((p) => (
                          <SelectItem
                            key={p.id}
                            value={p.id}
                            className="gap-2 font-sans text-[12.5px]"
                          >
                            <span
                              className="size-2 shrink-0 rounded-sm"
                              style={{ backgroundColor: p.color ?? "#0a76b9" }}
                            />
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            {!p.moduleSystemEnabled ? (
                              <span className="shrink-0 text-[10.5px] text-pen-subtle">
                                off → on
                              </span>
                            ) : null}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProject && !selectedProject.moduleSystemEnabled && (
                  <p className="font-sans text-[11.5px] text-pen-muted">
                    Module system is off for this project — creating a module will turn it on.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="pen-text-label">
                Module name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus={isEdit}
                placeholder="e.g. Payments, Onboarding, Reporting"
                className="h-9 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="pen-text-label">
                Description <span className="text-pen-subtle">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What does this module cover?"
                className="resize-none rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
              />
            </div>

            {error && (
              <p className="font-sans text-[12px] text-pen-red">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => onOpenChange(false)}
                className="font-sans text-[12px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving || (!isEdit && !selectedProjectId)}
                className="gap-1.5 bg-pen-blue font-sans text-[12px] text-white dark:text-gray-900 hover:bg-pen-blue/90"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                {isEdit ? "Save changes" : "Create module"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
