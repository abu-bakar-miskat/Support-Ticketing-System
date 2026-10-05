"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, ChevronDown, Copy, Check, Info, Plus, X, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  PortalApiFormsSection,
  type PortalApiFormRow,
} from "@/components/departments/portal-api-forms-section";

export type ApiKeyRow = {
  id: string;
  name: string;
  maskedKey: string;
  scope: string;
  department: string;
  created: string;
  createdBy: string;
  lastUsed: string;
  revoked: boolean;
  formId?: string | null;
  formName?: string | null;
};

export type DepartmentOption = {
  id: string;
  name: string;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Step-by-step guide for connecting a claude.ai account to the MCP endpoint. */
function ClaudeConnectGuide() {
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined"
    ? "https://ticketing-system.pengroup.com"
    : window.location.origin;

  const trimmed = keyInput.trim();
  const url = `${origin}/api/mcp/${trimmed || "<your-api-key>"}/mcp`;

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <Bot className="size-4 shrink-0 text-sts-blue" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <span className="font-sans text-[13px] font-semibold text-sts-foreground">
            Connect Claude (claude.ai) to the ticketing system
          </span>
          <p className="font-sans text-[11.5px] text-sts-muted">
            Let Claude search, create, and manage tickets from a chat — takes 2 minutes.
          </p>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-sts-muted transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="border-t border-sts-card-border px-4 py-4">
          <ol className="flex flex-col gap-3 font-sans text-[12.5px] leading-relaxed text-sts-foreground">
            <li>
              <span className="font-semibold">1. Generate a key above.</span>{" "}
              <span className="text-sts-muted">
                <strong>read</strong> = look-ups only, <strong>read_write</strong> = create, edit &
                comment on tickets, <strong>admin</strong> = everything including deleting tickets.
                Leave the department empty for org-wide access. Copy the key when it&apos;s shown —
                it appears only once.
              </span>
            </li>
            <li>
              <span className="font-semibold">2. Build your connector URL</span>{" "}
              <span className="text-sts-muted">— paste your key here to fill it in:</span>
              <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
                <Input
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="pen_…"
                  className="h-8 font-mono text-[11.5px] sm:max-w-[240px]"
                />
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[8px] border border-sts-card-border bg-sts-bg px-2.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-sts-id">{url}</code>
                  <button
                    type="button"
                    onClick={copyUrl}
                    disabled={!trimmed}
                    className="shrink-0 rounded p-1 text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-40"
                    title="Copy URL"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[11.5px] text-sts-muted">
                The key is never stored here — this just assembles the URL in your browser.
              </p>
            </li>
            <li>
              <span className="font-semibold">3. Add it in claude.ai</span>{" "}
              <span className="text-sts-muted">
                (paid plan): <strong>Settings → Connectors → Add custom connector</strong>, paste the
                URL, and save. Leave the <strong>OAuth Client ID</strong> field empty and skip any
                sign-in step — the key inside the URL is the authentication. If Claude shows a
                &quot;couldn&apos;t register with sign-in service&quot; error, the key in the URL is
                wrong or revoked.
              </span>
            </li>
            <li>
              <span className="font-semibold">4. Chat away.</span>{" "}
              <span className="text-sts-muted">
                Try &quot;show me ticket WEB-12&quot; or &quot;create a bug for the WEB subDepartment&quot;.
                Actions taken by Claude are attributed to the key&apos;s owner and send the same
                notifications as the web app. Full tool reference in the{" "}
                <Link href="/docs#claude-connector" className="text-sts-blue hover:underline">
                  user manual
                </Link>
                .
              </span>
            </li>
          </ol>
          <div className="mt-3 flex items-start gap-2 rounded-[8px] bg-amber-50 px-3 py-2.5 dark:bg-amber-900/20">
            <Info className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} />
            <p className="font-sans text-[11.5px] leading-snug text-amber-700 dark:text-amber-300">
              The connector URL contains your key — treat it like a password and never share it.
              Revoking the key below disconnects that Claude account instantly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-subtle uppercase">
      {children}
    </span>
  );
}

function ScopePill({ scope }: { scope: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-sts-surface px-[7px] py-0.5 font-sans text-[11.5px] font-medium text-sts-muted">
      {scope}
    </span>
  );
}

// ── Generate Key Modal ─────────────────────────────────────────────────────────

function GenerateKeyModal({
  departments,
  isAdmin,
  onClose,
  onCreated,
  portalMode = false,
}: {
  departments: DepartmentOption[];
  isAdmin: boolean;
  onClose: () => void;
  onCreated: (rawKey: string, keyName: string) => void;
  portalMode?: boolean;
}) {
  const [name, setName] = useState("");
  const [formName, setFormName] = useState("");
  const [deptId, setDeptId] = useState(departments[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          departmentId: portalMode ? undefined : (deptId || undefined),
          purpose: portalMode ? "portal" : undefined,
          formName: portalMode ? (formName.trim() || undefined) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to create key");
        return;
      }
      onCreated(data.rawKey, data.name);
    } catch {
      setErr("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sts-overlay-backdrop p-4">
      <div className="w-full max-w-md rounded-xl border border-sts-card-border bg-sts-card shadow-xl">
        <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
          <h2 className="sts-text-modal-title">Generate API key</h2>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-sts-muted hover:bg-sts-surface hover:text-sts-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-medium text-sts-foreground">
              Key name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub Actions, Zapier integration"
              className="h-9 font-sans text-[13px]"
              autoFocus
            />
          </div>

          {portalMode && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="font-sans text-[12px] font-medium text-sts-foreground">
                  Support form name
                </label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={name.trim() ? `${name.trim()} Support Form` : "Customer support form"}
                  className="h-9 font-sans text-[13px]"
                />
              </div>
            </>
          )}

          {!portalMode && departments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[12px] font-medium text-sts-foreground">
                Department scope
              </label>
              <SearchableSelect
                value={deptId}
                onChange={setDeptId}
                options={[
                  ...(isAdmin
                    ? [{ value: "", label: "Global (all departments)" }]
                    : []),
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
                placeholder="Select department…"
                className="bg-sts-bg"
                aria-label="Department scope"
              />
              <p className="font-sans text-[11px] text-sts-muted">
                Key will only be able to read data from this department.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-[8px] bg-sts-surface px-3 py-2.5">
            <Info
              className="mt-0.5 size-3.5 shrink-0 text-sts-muted"
              strokeWidth={2}
            />
            <p className="font-sans text-[11.5px] leading-snug text-sts-muted">
              {portalMode
                ? "A dedicated support form will be created for this key. The key can submit that form, view its tickets, and add requester comments. The raw key is shown once."
                : "Keys are read-only and scoped to the selected department. The raw key is shown once — store it securely."}
            </p>
          </div>

          {err && <p className="font-sans text-[12px] text-sts-red">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="border-sts-card-border font-sans text-[12.5px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !name.trim()}
              className="gap-1.5 bg-sts-blue font-sans text-[12.5px] text-white dark:text-gray-900 hover:bg-sts-blue/90"
            >
              {loading ? "Generating…" : "Generate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Key Reveal Modal ───────────────────────────────────────────────────────────

function KeyRevealModal({
  rawKey,
  keyName,
  onClose,
}: {
  rawKey: string;
  keyName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sts-overlay-backdrop p-4">
      <div className="w-full max-w-md rounded-xl border border-sts-card-border bg-sts-card shadow-xl">
        <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Key className="size-4 text-sts-green" />
            <h2 className="sts-text-modal-title">Key created — copy now</h2>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <p className="font-sans text-[12.5px] text-sts-muted">
            <span className="font-semibold text-sts-foreground">{keyName}</span>{" "}
            has been created. This key will not be shown again.
          </p>

          <div className="flex items-center gap-2 rounded-[8px] border border-sts-card-border bg-sts-bg px-3 py-2.5">
            <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-sts-foreground">
              {rawKey}
            </code>
            <button
              onClick={copy}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-sts-muted transition-colors hover:bg-sts-surface hover:text-sts-foreground"
              title="Copy key"
            >
              {copied ? (
                <Check className="size-3.5 text-sts-green" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-[8px] bg-amber-50 px-3 py-2.5 dark:bg-amber-900/20">
            <Info
              className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              strokeWidth={2}
            />
            <p className="font-sans text-[11.5px] leading-snug text-amber-700 dark:text-amber-300">
              Store this key somewhere safe. You won&apos;t be able to view it again.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={onClose}
              className="bg-sts-blue font-sans text-[12.5px] text-white dark:text-gray-900 hover:bg-sts-blue/90"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function SettingsApiKeysPage({
  apiKeys: initialKeys,
  departments,
  isAdmin,
  portalMode = false,
  portalForms = [],
}: {
  apiKeys: ApiKeyRow[];
  departments: DepartmentOption[];
  isAdmin: boolean;
  portalMode?: boolean;
  portalForms?: PortalApiFormRow[];
}) {
  const router = useRouter();
  const [showGenerate, setShowGenerate] = useState(false);
  const [revealKey, setRevealKey] = useState<{
    raw: string;
    name: string;
  } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [routeCopied, setRouteCopied] = useState(false);

  function handleCreated(rawKey: string, keyName: string) {
    setShowGenerate(false);
    setRevealKey({ raw: rawKey, name: keyName });
  }

  function handleRevealClose() {
    setRevealKey(null);
    router.refresh();
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setRevoking(null);
    }
  }

  async function handleDelete(id: string) {
    const response = await fetch(`/api/settings/api-keys/${id}?permanent=true`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Failed to delete connection");
    }
    router.refresh();
  }

  async function copyPortalRoute() {
    await navigator.clipboard.writeText(`${window.location.origin}/api/portal/v1`);
    setRouteCopied(true);
    setTimeout(() => setRouteCopied(false), 2000);
  }

  return (
    <>
      {showGenerate && (
        <GenerateKeyModal
          departments={departments}
          isAdmin={isAdmin}
          portalMode={portalMode}
          onClose={() => setShowGenerate(false)}
          onCreated={handleCreated}
        />
      )}

      {revealKey && (
        <KeyRevealModal
          rawKey={revealKey.raw}
          keyName={revealKey.name}
          onClose={handleRevealClose}
        />
      )}

      <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="sts-text-admin-title">{portalMode ? "Generate API" : "API keys"}</h1>
            <p className="mt-[3px] font-sans text-[13px] text-sts-muted">
              {portalMode
                ? "Connect an external portal to this tenant's departments and support forms."
                : "Programmatic read-only access for external platform integration."}
            </p>
          </div>
          <Button
            onClick={() => setShowGenerate(true)}
            className="h-[34px] w-full shrink-0 gap-1.5 rounded-full bg-sts-blue px-0 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-sts-blue/90 sm:w-[150px]"
          >
            <Plus className="size-[13px]" strokeWidth={2.5} />
            Generate key
          </Button>
        </div>

        {portalMode ? (
          <div className="flex flex-col gap-3 rounded-xl border border-sts-card-border bg-sts-card px-4 py-3.5 shadow-[0_10px_30px_-28px_rgba(74,44,35,0.4)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sts-surface text-sts-muted">
                <Info className="size-3.5" strokeWidth={1.8} aria-hidden />
              </span>
              <div>
                <p className="font-sans text-[12px] font-semibold text-sts-foreground">Server-side integration</p>
                <p className="mt-0.5 max-w-2xl font-sans text-[11.5px] leading-relaxed text-sts-muted">
                  Send the key as <code className="font-mono text-[11px] text-sts-foreground">Authorization: Bearer &lt;key&gt;</code>. Never expose it in browser code.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-lg bg-sts-surface px-2.5 py-2 ring-1 ring-sts-card-border/70">
              <code className="font-mono text-[11.5px] text-sts-foreground">/api/portal/v1</code>
              <button
                type="button"
                onClick={copyPortalRoute}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-sts-card px-2.5 font-sans text-[11px] font-semibold text-sts-foreground shadow-sm ring-1 ring-sts-card-border transition-colors hover:text-sts-id focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30 active:translate-y-px"
                aria-label="Copy portal API route"
              >
                {routeCopied ? <Check className="size-3 text-sts-green" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                {routeCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-[8px] bg-sts-surface px-3.5 py-2.5">
            <Info className="mt-px size-3.5 shrink-0 text-sts-muted" strokeWidth={2} aria-hidden />
            <p className="font-sans text-[11.5px] leading-snug text-sts-muted">
              Keys use Bearer token auth:{" "}
              <code className="rounded bg-sts-card px-1 font-mono text-[11px]">Authorization: Bearer &lt;key&gt;</code>
              . Access is scoped to the key&apos;s department. Available endpoints:{" "}
              <code className="rounded bg-sts-card px-1 font-mono text-[11px]">GET /api/v1/projects</code>
              {" — list projects (with member counts), "}
              <code className="rounded bg-sts-card px-1 font-mono text-[11px]">GET /api/v1/projects/:id</code>
              {" — project with members, tickets & sub-tickets, "}
              <code className="rounded bg-sts-card px-1 font-mono text-[11px]">GET /api/v1/projects/:id/tickets</code>
              {" — tickets list, "}
              <code className="rounded bg-sts-card px-1 font-mono text-[11px]">GET /api/v1/tickets/:id</code>
              {" — ticket detail."}
            </p>
          </div>
        )}

        {!portalMode && <ClaudeConnectGuide />}

        {portalMode ? (
          <PortalApiFormsSection
            apiKeys={initialKeys}
            forms={portalForms}
            revokingId={revoking}
            onRevoke={handleRevoke}
            onDelete={handleDelete}
          />
        ) : (
          <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
            <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[22%]">
                  <SectionLabel>Name</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[22%]">
                  <SectionLabel>Key</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[16%]">
                  <SectionLabel>Department</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[12%]">
                  <SectionLabel>Scopes</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[16%]">
                  <SectionLabel>Last used</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[12%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialKeys.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={6}
                    className="h-14 px-0 font-sans text-[12.5px] text-sts-muted"
                  >
                    No API keys yet. Generate one to get started.
                  </TableCell>
                </TableRow>
              )}

              {initialKeys.map((apiKey) => (
                <TableRow
                  key={apiKey.id}
                  className={cn(
                    "border-[#f0f4f8] hover:bg-sts-bg/40 dark:border-[#3a3a37]",
                    apiKey.revoked && "opacity-50",
                  )}
                >
                  <TableCell className="py-0">
                    <div className="flex h-[50px] items-center">
                      <span className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">
                        {apiKey.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-0">
                    <div className="flex h-[50px] items-center">
                      <span className="truncate font-mono text-[11.5px] text-sts-muted">
                        {apiKey.maskedKey}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-0">
                    <div className="flex h-[50px] items-center">
                      <span className="truncate font-sans text-[12px] text-sts-subtle">
                        {apiKey.department}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-0">
                    <div className="flex h-[50px] items-center">
                      <ScopePill scope={apiKey.scope} />
                    </div>
                  </TableCell>
                  <TableCell className="py-0">
                    <div className="flex h-[50px] items-center">
                      <span className="font-sans text-[11.5px] text-sts-subtle">
                        {apiKey.lastUsed}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-0 text-right">
                    <div className="flex h-[50px] items-center justify-end">
                      {apiKey.revoked ? (
                        <span className="font-sans text-[11.5px] font-medium text-sts-subtle">
                          Revoked
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={revoking === apiKey.id}
                            onClick={() => handleRevoke(apiKey.id)}
                            className="h-auto px-0 py-0 font-sans text-[11.5px] font-semibold text-sts-red hover:bg-transparent hover:text-sts-red/80 disabled:opacity-50"
                          >
                            {revoking === apiKey.id ? "Revoking…" : "Revoke"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
