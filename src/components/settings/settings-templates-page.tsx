"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TemplateFormModal } from "./template-form-modal";
import { createTemplate, updateTemplate, deleteTemplate } from "@/lib/api/templates";

export type TemplateRow = {
  id: string;
  name: string;
  customFields: any[];
  createdBy: { id: string; name: string; email: string };
  createdAt: Date;
  updatedAt: Date;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
      {children}
    </span>
  );
}

export function SettingsTemplatesPage({ templates: initial }: { templates: TemplateRow[] }) {
  const [templates, setTemplates] = useState<TemplateRow[]>(initial);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateRow | null>(null);

  async function handleSave(data: {
    name: string;
    customFields: any[];
  }) {
    setSaving(true);
    try {
      if (editingTemplate) {
        const updated = await updateTemplate(editingTemplate.id, data);
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editingTemplate.id
              ? {
                  ...t,
                  ...updated,
                  createdAt: new Date(updated.createdAt),
                  updatedAt: updated.updatedAt ? new Date(updated.updatedAt) : new Date(),
                }
              : t,
          ),
        );
      } else {
        const created = await createTemplate(data);
        setTemplates((prev) => [
          {
            ...created,
            createdAt: new Date(created.createdAt),
            updatedAt: created.updatedAt ? new Date(created.updatedAt) : new Date(),
          },
          ...prev,
        ]);
      }
      setShowModal(false);
      setEditingTemplate(null);
    } catch (error) {
      toast.error((error as Error).message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(template: TemplateRow) {
    setEditingTemplate(template);
    setShowModal(true);
  }

  async function handleConfirmDelete() {
    if (!deletingTemplate) return;
    try {
      await deleteTemplate(deletingTemplate.id);
      setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
    } catch (error) {
      throw new Error("Failed to delete template");
    }
  }

  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="pen-text-admin-title">Ticket Templates</h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">Create reusable templates for tickets.</p>
        </div>
        <Button
          onClick={() => {
            setEditingTemplate(null);
            setShowModal(true);
          }}
          className="h-[34px] w-full shrink-0 gap-1.5 rounded-[7px] bg-pen-blue px-0 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90 sm:w-[140px]"
        >
          <Plus className="size-[13px]" strokeWidth={2.5} />
          New template
        </Button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
              <TableHead className="h-8 w-[50%]">
                <SectionLabel>Name</SectionLabel>
              </TableHead>
              <TableHead className="h-8 w-[40%]">
                <SectionLabel>Created by</SectionLabel>
              </TableHead>
              <TableHead className="h-8 w-[10%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 ? (
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableCell colSpan={3} className="py-0">
                  <div className="flex h-[46px] items-center">
                    <span className="font-sans text-[11.5px] text-pen-muted">No templates yet</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {templates.map((template) => (
              <TableRow key={template.id} className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]">
                <TableCell className="py-0">
                  <div className="flex h-[46px] items-center">
                    <span className="font-sans text-sm font-medium text-pen-foreground">{template.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-0">
                  <div className="flex h-[46px] items-center">
                    <span className="font-sans text-[12.5px] text-pen-muted">{template.createdBy.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-0 text-right">
                  <div className="flex h-[46px] items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(template)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border border-pen-blue bg-pen-blue/10 text-pen-blue font-sans text-[11px] font-medium transition-all hover:bg-pen-blue hover:text-white"
                      title="Edit template"
                    >
                      <Edit2 className="size-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingTemplate(template)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border border-pen-red bg-pen-red/10 text-pen-red font-sans text-[11px] font-medium transition-all hover:bg-pen-red hover:text-white"
                      title="Delete template"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {showModal && (
        <TemplateFormModal
          template={editingTemplate}
          onSave={handleSave}
          onCancel={() => {
            setShowModal(false);
            setEditingTemplate(null);
          }}
          saving={saving}
        />
      )}

      {deletingTemplate && (
        <ConfirmDialog
          open={true}
          onOpenChange={() => setDeletingTemplate(null)}
          title={`Delete "${deletingTemplate.name}"?`}
          description="This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
