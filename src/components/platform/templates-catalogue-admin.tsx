"use client";

import { useState } from "react";
import { LayoutTemplate, Plus, Check, X, Archive } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TEMPLATE_FEATURE_KEYS, type TemplateFeatureKey } from "@/lib/template-features";

const FEATURE_LABELS: Record<TemplateFeatureKey, string> = {
  supportForm: "Support forms",
  emailSettings: "Email settings",
  apiKeys: "API keys",
  importForm: "Import from Notion",
};

type TemplateRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  featureKeys: string[];
  activeTenantCount: number;
};

type RequestRow = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  template: { id: string; name: string };
  message: string | null;
  requestedAt: string;
  requestedBy: { id: string; name: string | null; email: string } | null;
};

export function TemplatesCatalogueAdmin({
  initialTemplates,
  initialRequests,
}: {
  initialTemplates: TemplateRow[];
  initialRequests: RequestRow[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [requests, setRequests] = useState(initialRequests);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [featureKeys, setFeatureKeys] = useState<Set<TemplateFeatureKey>>(new Set());

  function toggleFeature(key: TemplateFeatureKey) {
    setFeatureKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("create");
    setError(null);
    const res = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        featureKeys: Array.from(featureKeys),
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create template");
      return;
    }
    const created = await res.json();
    setTemplates((prev) => [
      ...prev,
      { id: created.id, name: created.name, slug: created.slug, description: created.description, isActive: true, featureKeys: Array.from(featureKeys), activeTenantCount: 0 },
    ]);
    setName("");
    setDescription("");
    setFeatureKeys(new Set());
  }

  async function toggleArchived(template: TemplateRow) {
    setBusy(template.id);
    setError(null);
    const res = template.isActive
      ? await fetch(`/api/admin/templates/${template.id}`, { method: "DELETE" })
      : await fetch(`/api/admin/templates/${template.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update template");
      return;
    }
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, isActive: !t.isActive } : t)));
  }

  async function reviewRequest(requestId: string, decision: "APPROVED" | "REJECTED") {
    setBusy(requestId);
    setError(null);
    const res = await fetch(`/api/admin/template-requests/${requestId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to review request");
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    if (decision === "APPROVED") {
      setTemplates((prev) =>
        prev.map((t) => {
          const req = initialRequests.find((r) => r.id === requestId);
          if (req && t.id === req.template.id) return { ...t, activeTenantCount: t.activeTenantCount + 1 };
          return t;
        }),
      );
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={LayoutTemplate}
          title="Template Catalogue"
          description="Bundle settings sections into named templates. Tenants can run several templates at once and request new ones; requests land below for approval."
        />

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {/* Create template */}
        <form
          onSubmit={createTemplate}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name (e.g. Support)"
              className="h-9 flex-1"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="h-9 flex-1"
            />
            <Button type="submit" size="lg" disabled={busy === "create" || !name.trim()}>
              <Plus className="size-4" />
              {busy === "create" ? "Creating…" : "Create template"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            {TEMPLATE_FEATURE_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-1.5 font-sans text-[12.5px] text-pen-muted">
                <input
                  type="checkbox"
                  checked={featureKeys.has(key)}
                  onChange={() => toggleFeature(key)}
                  className="size-3.5 rounded border-pen-card-border"
                />
                {FEATURE_LABELS[key]}
              </label>
            ))}
          </div>
        </form>

        {/* Pending requests */}
        {requests.length > 0 && (
          <div className="mt-8">
            <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">
              Pending requests ({requests.length})
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pen-card-border bg-pen-card p-3 shadow-pen-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[13px] text-pen-foreground">
                      <span className="font-semibold">{r.tenant.name}</span> requested{" "}
                      <span className="font-semibold">{r.template.name}</span>
                    </p>
                    <p className="mt-0.5 font-sans text-[11.5px] text-pen-subtle">
                      {r.requestedBy?.name ?? r.requestedBy?.email ?? "Unknown"} ·{" "}
                      {new Date(r.requestedAt).toLocaleDateString()}
                      {r.message ? ` — "${r.message}"` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === r.id}
                      onClick={() => reviewRequest(r.id, "REJECTED")}
                    >
                      <X className="size-3.5" />
                      Reject
                    </Button>
                    <Button size="sm" disabled={busy === r.id} onClick={() => reviewRequest(r.id, "APPROVED")}>
                      <Check className="size-3.5" />
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Templates list */}
        <div className="mt-8">
          <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">Templates</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex flex-col rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-sans text-[14.5px] font-semibold text-pen-foreground">
                    {t.name}
                  </span>
                  <Switch
                    checked={t.isActive}
                    onCheckedChange={() => toggleArchived(t)}
                    disabled={busy === t.id}
                    size="sm"
                  />
                </div>
                {t.description && (
                  <p className="mt-1 font-sans text-[12px] text-pen-muted">{t.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.featureKeys.map((key) => (
                    <span
                      key={key}
                      className="rounded-full bg-pen-blue-tint px-2 py-0.5 font-sans text-[10.5px] font-medium text-pen-blue"
                    >
                      {FEATURE_LABELS[key as TemplateFeatureKey] ?? key}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-1.5 border-t border-pen-card-border/60 pt-3 font-sans text-[11.5px] text-pen-subtle">
                  {t.isActive ? (
                    <span>{t.activeTenantCount} tenant{t.activeTenantCount === 1 ? "" : "s"} active</span>
                  ) : (
                    <span className="flex items-center gap-1 text-pen-muted">
                      <Archive className="size-3" /> Archived
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
