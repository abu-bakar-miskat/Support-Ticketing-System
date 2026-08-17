"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellOff } from "lucide-react";
import {
  type EmailTemplateInfo,
  type EmailTemplateOverrideDraft,
  fetchEmailTemplates,
  previewEmailTemplate,
  resetEmailTemplate,
  saveEmailTemplate,
} from "@/lib/api/email-templates";
import { fetchEmailNotifications } from "@/lib/api/email-notifications";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TEMPLATE_SKELETON_COUNT = 6;

/** Maps a template key (e.g. "customerReply") to its notification toggle key ("notifyCustomerReply"). */
function notifyKeyFor(templateKey: string): string {
  return `notify${templateKey[0].toUpperCase()}${templateKey.slice(1)}`;
}

export type DeptOption = { id: string; name: string };

const inputClass =
  "h-9 w-full rounded-md border-pen-card-border bg-pen-bg px-[11px] font-sans text-[12.5px] text-pen-foreground shadow-none outline-none focus:border-pen-blue";

const PLACEHOLDER_HINTS: Record<string, string> = {
  viewTicketButton:
    "Inserts a styled “View ticket” button. Use this instead of writing [url]View ticket.",
  ticketUrl: "Plain ticket URL (for text links). Prefer {{viewTicketButton}} for the CTA.",
  signature: "Inserts the sender's personal signature card (set in Profile → Email signature). Falls back to a placeholder signature card if the sender hasn't set one up or turned it off.",
};

function TemplateEditor({
  template,
  departmentId,
  onSaved,
}: {
  template: EmailTemplateInfo;
  departmentId: string;
  onSaved: () => void;
}) {
  const isCustomized = Boolean(template.override);
  const initial = template.override ?? template.default;

  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [draft, setDraft] = useState<EmailTemplateOverrideDraft>(initial);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewHeight, setPreviewHeight] = useState(520);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  async function runPreview(next: EmailTemplateOverrideDraft) {
    setLoadingPreview(true);
    try {
      const result = await previewEmailTemplate(template.key, next, departmentId);
      setPreview(result);
    } catch {
      toast.error("Failed to render preview");
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    runPreview(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.key, departmentId]);

  async function handleSave() {
    if (!draft.bodyHtml.trim()) {
      toast.error("Body HTML cannot be empty");
      return;
    }
    setSaving(true);
    try {
      await saveEmailTemplate(template.key, draft, departmentId);
      toast.success(`${template.label} template saved`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await resetEmailTemplate(template.key, departmentId);
      setDraft(template.default);
      await runPreview(template.default);
      toast.success(`${template.label} template reset to default`);
      onSaved();
    } catch {
      toast.error("Failed to reset template");
    } finally {
      setSaving(false);
    }
  }

  const hasSignaturePlaceholder = template.placeholders.includes("signature");

  return (
    <div className="flex flex-col gap-4 border-t border-pen-surface pt-4">
      <div className="flex gap-1 border-b border-pen-card-border">
        {(
          [
            { id: "preview" as const, label: "Preview" },
            { id: "code" as const, label: "Code" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "h-9 rounded-t-md px-3.5 font-sans text-[12.5px] font-medium",
              tab === t.id
                ? "border-b-2 border-pen-blue text-pen-foreground"
                : "text-pen-muted hover:text-pen-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "preview" ? (
        <div className="flex w-full flex-col gap-[5px]">
          <div className="overflow-hidden rounded-md border border-pen-card-border bg-pen-bg">
            <p className="border-b border-pen-card-border px-3 py-2 font-sans text-[11.5px] text-pen-muted">
              Subject: <span className="text-pen-foreground">{preview?.subject ?? draft.subject}</span>
            </p>
            {preview ? (
              <iframe
                title={`${template.label} preview`}
                srcDoc={preview.html}
                sandbox="allow-same-origin"
                onLoad={(e) => {
                  const doc = e.currentTarget.contentDocument;
                  if (doc) setPreviewHeight(Math.max(320, doc.documentElement.scrollHeight));
                }}
                style={{ height: previewHeight }}
                className="w-full bg-white"
              />
            ) : (
              <div className="flex h-[320px] items-center justify-center font-sans text-[12px] text-pen-subtle">
                {loadingPreview ? "Rendering…" : "No preview yet"}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <label className="pen-text-label">Subject</label>
              <input
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <label className="pen-text-label">Heading</label>
              <input
                value={draft.heading}
                onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex flex-col gap-[5px]">
            <label className="pen-text-label">Body HTML</label>
            <textarea
              value={draft.bodyHtml}
              onChange={(e) => setDraft((d) => ({ ...d, bodyHtml: e.target.value }))}
              rows={16}
              spellCheck={false}
              className="w-full resize-y rounded-md border border-pen-card-border bg-pen-bg px-[11px] py-2 font-mono text-[11.5px] leading-relaxed text-pen-foreground shadow-none outline-none focus:border-pen-blue"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {template.placeholders.map((p) => (
              <span
                key={p}
                title={PLACEHOLDER_HINTS[p]}
                className="rounded-full bg-pen-blue-tint px-2 py-0.5 font-mono text-[11px] text-pen-blue"
              >
                {`{{${p}}}`}
              </span>
            ))}
          </div>
          {hasSignaturePlaceholder ? (
            <p className="font-sans text-[11.5px] text-pen-subtle">
              <span className="font-mono text-pen-blue">{"{{signature}}"}</span> inserts the sender&rsquo;s personal
              signature card (set in Profile → Email signature) when they&rsquo;ve filled it in and turned it on;
              otherwise it falls back to the placeholder signature card shown below.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-pen-surface pt-4">
        <button
          type="button"
          onClick={() => runPreview(draft)}
          disabled={loadingPreview}
          className="h-8 rounded-md border border-pen-card-border bg-transparent px-3 font-sans text-xs font-semibold text-pen-foreground hover:bg-pen-blue-tint disabled:opacity-50"
        >
          {loadingPreview ? "Rendering…" : "Refresh preview"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-8 rounded-md bg-pen-blue px-3.5 font-sans text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {isCustomized ? (
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="h-8 rounded-md border border-pen-card-border bg-transparent px-3 font-sans text-xs font-semibold text-pen-muted hover:bg-pen-blue-tint disabled:opacity-50"
          >
            Reset to default
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsEmailTemplatesPage({
  departments = [],
}: {
  departments?: DeptOption[];
} = {}) {
  const [departmentId, setDepartmentId] = useState<string>(departments[0]?.id ?? "");
  const [templates, setTemplates] = useState<EmailTemplateInfo[] | null>(null);
  const [disabledNotifyKeys, setDisabledNotifyKeys] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  async function load() {
    if (!departmentId) return;
    try {
      const data = await fetchEmailTemplates(departmentId);
      setTemplates(data);
    } catch {
      toast.error("Failed to load email templates");
    }
  }

  async function loadNotifications() {
    if (!departmentId) return;
    try {
      const data = await fetchEmailNotifications(departmentId);
      const disabled = new Set(
        data.filter((n) => (n.override ?? n.default) === false).map((n) => n.key),
      );
      setDisabledNotifyKeys(disabled);
    } catch {
      // Non-critical — the templates list still works without the disabled indicator.
    }
  }

  useEffect(() => {
    if (!departmentId) {
      setTemplates([]);
      return;
    }
    setTemplates(null);
    load();
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  if (departments.length === 0) {
    return (
      <div className="flex flex-col gap-3 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
        <p className="max-w-[1040px] font-sans text-[13px] text-pen-muted">
          No departments available. Assign a department to edit email templates.
        </p>
      </div>
    );
  }

  const showSelector = departments.length > 1;

  return (
    <div className="flex flex-col gap-3 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      {showSelector ? (
        <div className="flex max-w-[1040px] flex-col gap-1.5">
          <label className="pen-text-label">Applies to</label>
          <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
            <SelectTrigger className="h-9 w-full max-w-[320px] rounded-md border-pen-card-border bg-pen-bg font-sans text-[12.5px] text-pen-foreground">
              <span>{departments.find((o) => o.id === departmentId)?.name ?? "Select department"}</span>
            </SelectTrigger>
            <SelectContent>
              {departments.map((o) => (
                <SelectItem key={o.id} value={o.id} className="font-sans text-[12.5px]">
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="font-sans text-[11.5px] text-pen-subtle">
            Subject, heading, and body for this department&apos;s outgoing emails.
            Templates without a customization use the built-in default.
          </p>
        </div>
      ) : (
        <p className="max-w-[1040px] font-sans text-[11.5px] text-pen-subtle">
          Subject, heading, and body for{" "}
          <span className="font-medium text-pen-foreground">
            {departments[0]?.name ?? "this department"}
          </span>
          &apos;s outgoing emails. Templates without a customization use the built-in
          default.
        </p>
      )}

      {!templates ? (
        Array.from({ length: TEMPLATE_SKELETON_COUNT }).map((_, i) => (
          <section
            key={i}
            className="w-full max-w-[1040px] rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-4"
          >
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-[13px] w-36" />
                <Skeleton className="h-[11px] w-56" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            </div>
          </section>
        ))
      ) : (
        templates.map((template) => {
          const expanded = expandedKey === template.key;
          const notifyDisabled = disabledNotifyKeys.has(notifyKeyFor(template.key));
          return (
            <section
              key={template.key}
              className="w-full max-w-[1040px] rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-4"
            >
              <button
                type="button"
                onClick={() => setExpandedKey(expanded ? null : template.key)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="flex flex-col gap-px">
                  <span className="flex items-center gap-1.5 font-sans text-sm font-semibold text-pen-foreground">
                    {template.label}
                    {notifyDisabled ? (
                      <BellOff
                        className="size-3.5 text-pen-subtle"
                        aria-label="This email is currently disabled"
                      >
                        <title>This email is currently disabled</title>
                      </BellOff>
                    ) : null}
                  </span>
                  <span className="font-sans text-[11.5px] text-pen-subtle">
                    {template.description}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium",
                    template.override
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-pen-surface text-pen-muted",
                  )}
                >
                  {template.override ? "Customized" : "Default"}
                </span>
              </button>

              {expanded && departmentId ? (
                <TemplateEditor
                  key={`${departmentId}-${template.key}`}
                  template={template}
                  departmentId={departmentId}
                  onSaved={load}
                />
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
