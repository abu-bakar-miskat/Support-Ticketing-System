"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/lib/api/profile";
import { toast } from "sonner";
import { Lock, Camera, Loader2, Check, Plus, Trash2, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { AVATAR_ICON_ACCEPT, validateAvatarIcon } from "@/lib/avatar-icon-file";
import { renderSignatureHtml } from "@/lib/email-templates/signature";
import { hasSignatureContent, sanitizeSignatureHtml } from "@/lib/sanitize-signature-html";
import { TIMEZONES } from "@/lib/timezones";

type SignatureEntry = {
  id: string;
  label: string;
  html: string;
};

type SignaturePrefs = {
  enabled: boolean;
  activeId: string | null;
  list: SignatureEntry[];
};

function escapeHtml(text: string): string {
  return text.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
}

/** Plain-text snippet of a signature, for the list row subtitle. */
function plainPreview(html: string): string {
  if (typeof document === "undefined") return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = (div.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

type SettingsProfileProps = {
  name: string;
  email: string;
  role: string;
  timezone: string;
  avatarUrl: string | null;
  location: string;
  githubUsername: string;
  workingDays: number[];
  workStartTime: string;
  workEndTime: string;
  signature: SignaturePrefs;
};

function MicrosoftSsoBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-[5px] border border-pen-blue bg-pen-blue-tint px-[7px] py-[3px]">
      <div className="relative size-3 shrink-0 overflow-hidden">
        <div className="absolute top-0 left-0 size-[5px] bg-[#f25022]" />
        <div className="absolute top-0 left-[7px] size-[5px] bg-[#7fba00]" />
        <div className="absolute top-[7px] left-0 size-[5px] bg-[#00a4ef]" />
        <div className="absolute top-[7px] left-[7px] size-[5px] bg-[#ffb900]" />
      </div>
      <span className="font-sans text-[11.5px] font-semibold text-pen-id">
        Signed in via Microsoft SSO
      </span>
    </div>
  );
}

function FieldLabel({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Label id={id} className="pen-text-label">
      {children}
    </Label>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Input
          value={value}
          readOnly={readOnly}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={cn(
            "h-9 rounded-md border-pen-card-border bg-pen-bg px-[11px] font-sans text-[12.5px] text-pen-foreground shadow-none",
            readOnly && "pr-8 text-pen-muted",
          )}
        />
        {readOnly ? (
          <Lock className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-pen-subtle" />
        ) : null}
      </div>
    </div>
  );
}

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

export function SettingsProfilePage({
  name: userName,
  email: userEmail,
  role: userRole,
  timezone: initialTimezone,
  avatarUrl,
  location: initialLocation,
  githubUsername: initialGithubUsername,
  workingDays: initialWorkingDays,
  workStartTime: initialWorkStartTime,
  workEndTime: initialWorkEndTime,
  signature: initialSignature,
}: SettingsProfileProps) {
  const router = useRouter();
  const [liveAvatarUrl, setLiveAvatarUrl] = useState(avatarUrl ?? undefined);
  const userAvatarUrl = liveAvatarUrl;
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState(userName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [location, setLocation] = useState(initialLocation);
  const [githubUsername, setGithubUsername] = useState(initialGithubUsername);
  const [workingDays, setWorkingDays] = useState<number[]>(initialWorkingDays);
  const [workStartTime, setWorkStartTime] = useState(initialWorkStartTime);
  const [workEndTime, setWorkEndTime] = useState(initialWorkEndTime);
  const [sigList, setSigList] = useState<SignatureEntry[]>(initialSignature.list);
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(
    initialSignature.activeId,
  );
  const [sigEnabled, setSigEnabled] = useState(initialSignature.enabled);
  const [showAddSigForm, setShowAddSigForm] = useState(false);
  const [editingSigId, setEditingSigId] = useState<string | null>(null);
  const [newSigLabel, setNewSigLabel] = useState("");
  const [newSigHtml, setNewSigHtml] = useState("");
  const [sigFormKey, setSigFormKey] = useState(0);
  const sigPasteRef = useRef<HTMLDivElement>(null);

  // The paste target is uncontrolled (contentEditable) — seed it once per remount
  // (i.e. whenever the form is opened, fresh for "add" or pre-filled for "edit").
  useEffect(() => {
    if (sigPasteRef.current) sigPasteRef.current.innerHTML = newSigHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigFormKey]);

  const [sigPreviewHeight, setSigPreviewHeight] = useState(340);
  const [showSigPreview, setShowSigPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const isDirty =
    fullName.trim() !== userName ||
    timezone !== initialTimezone ||
    location !== initialLocation ||
    githubUsername.trim() !== initialGithubUsername ||
    JSON.stringify([...workingDays].sort()) !==
      JSON.stringify([...initialWorkingDays].sort()) ||
    workStartTime !== initialWorkStartTime ||
    workEndTime !== initialWorkEndTime ||
    JSON.stringify(sigList) !== JSON.stringify(initialSignature.list) ||
    activeSignatureId !== initialSignature.activeId ||
    sigEnabled !== initialSignature.enabled;

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateAvatarIcon(file);
    if (validationError) {
      toast.error(validationError);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }

    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setLiveAvatarUrl(data.avatarUrl);
      toast.success("Avatar updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  const timezoneOptions = TIMEZONES.some((t) => t.value === initialTimezone)
    ? TIMEZONES
    : [{ value: initialTimezone, label: initialTimezone }, ...TIMEZONES];

  function handleDiscard() {
    setFullName(userName);
    setTimezone(initialTimezone);
    setLocation(initialLocation);
    setGithubUsername(initialGithubUsername);
    setWorkingDays(initialWorkingDays);
    setWorkStartTime(initialWorkStartTime);
    setWorkEndTime(initialWorkEndTime);
    setSigList(initialSignature.list);
    setActiveSignatureId(initialSignature.activeId);
    setSigEnabled(initialSignature.enabled);
    closeAddSigForm();
  }

  function openAddSigForm() {
    setEditingSigId(null);
    setNewSigLabel("");
    setNewSigHtml("");
    setShowAddSigForm(true);
    setSigFormKey((k) => k + 1);
  }

  function openEditSigForm(entry: SignatureEntry) {
    setEditingSigId(entry.id);
    setNewSigLabel(entry.label);
    setNewSigHtml(entry.html);
    setShowAddSigForm(true);
    setSigFormKey((k) => k + 1);
  }

  function closeAddSigForm() {
    setShowAddSigForm(false);
    setEditingSigId(null);
    setNewSigLabel("");
    setNewSigHtml("");
    setSigFormKey((k) => k + 1);
  }

  function handleSignaturePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    const sanitized = html
      ? sanitizeSignatureHtml(html)
      : plain
        ? `<p>${plain.split("\n").map(escapeHtml).join("<br/>")}</p>`
        : "";
    if (sigPasteRef.current) sigPasteRef.current.innerHTML = sanitized;
    setNewSigHtml(sanitized);
  }

  function handleSaveSignature() {
    const label = newSigLabel.trim();
    if (!label || !hasSignatureContent(newSigHtml)) {
      toast.error("Give the signature a name and paste its content");
      return;
    }

    if (editingSigId) {
      setSigList((prev) =>
        prev.map((entry) =>
          entry.id === editingSigId ? { ...entry, label, html: newSigHtml } : entry,
        ),
      );
    } else {
      const entry: SignatureEntry = { id: crypto.randomUUID(), label, html: newSigHtml };
      setSigList((prev) => [...prev, entry]);
      setActiveSignatureId((prev) => prev ?? entry.id);
    }
    closeAddSigForm();
  }

  function handleDeleteSignature(id: string) {
    const next = sigList.filter((entry) => entry.id !== id);
    setSigList(next);
    if (activeSignatureId === id) setActiveSignatureId(next[0]?.id ?? null);
    if (next.length === 0) setSigEnabled(false);
  }

  function handleSignatureEnabledChange(checked: boolean) {
    if (checked && sigList.length === 0) {
      toast.error("Add at least one signature before enabling this");
      return;
    }
    setSigEnabled(checked);
  }

  async function handleSave() {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error("Full name cannot be empty");
      return;
    }

    setSaving(true);
    try {
      await Promise.all([
        updateProfile({
          name: trimmedName,
          timezone,
          location: location.trim() || null,
          githubUsername: githubUsername.trim().replace(/^@/, "") || null,
          signature: {
            enabled: sigEnabled,
            activeId: activeSignatureId,
            list: sigList,
          },
        }),
        fetch("/api/profile/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workingDays, workStartTime, workEndTime }),
        }),
      ]);
      toast.success("Profile updated");
      router.refresh();
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  const activeSignature = sigList.find((entry) => entry.id === activeSignatureId) ?? null;

  return (
    <div className="flex flex-col gap-6 px-5 py-8 sm:px-8 lg:px-11 lg:py-9">
      <div className="flex flex-col gap-[5px]">
        <h1 className="pen-text-admin-title">Profile</h1>
        <p className="font-sans text-[13px] text-pen-muted">
          Your personal information, signed in via Microsoft.
        </p>
      </div>

      <div className="flex w-full max-w-[912px] flex-col gap-5 rounded-[10px] border border-pen-card-border bg-pen-card px-5 py-[22px] sm:px-[26px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <Avatar className="size-16">
              {userAvatarUrl ? (
                <AvatarImage src={userAvatarUrl} alt={userName} />
              ) : null}
              <AvatarFallback className="bg-pen-blue font-sans text-lg font-medium text-white dark:text-gray-900">
                {userName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            {/* Upload overlay */}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Change avatar"
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded-full bg-black/40 transition-opacity",
                uploadingAvatar
                  ? "opacity-100 cursor-wait"
                  : "opacity-0 hover:opacity-100",
              )}
            >
              {uploadingAvatar ? (
                <Loader2
                  className="size-5 animate-spin text-white"
                  aria-hidden
                />
              ) : (
                <Camera className="size-5 text-white" aria-hidden />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept={AVATAR_ICON_ACCEPT}
              aria-label="Upload avatar image"
              className="sr-only"
              onChange={handleAvatarUpload}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <p className="font-sans text-[17px] font-semibold text-pen-foreground">
              {userName}
            </p>
            <p className="truncate font-sans text-[12.5px] text-pen-muted">
              {userEmail}
            </p>
            <MicrosoftSsoBadge />
          </div>
        </div>

        <Separator className="bg-pen-card-border" />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <ProfileField
              label="Name"
              value={fullName}
              onChange={setFullName}
            />
          </div>
          <div className="flex flex-col gap-4 lg:flex-row">
            <ProfileField label="Email" value={userEmail} readOnly />
            <ProfileField label="Role" value={userRole} readOnly />
          </div>
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <FieldLabel>Timezone</FieldLabel>
              <Select
                value={timezone}
                onValueChange={(v) => v && setTimezone(v)}
              >
                <SelectTrigger className="h-9 w-full rounded-md border-pen-card-border bg-pen-bg px-[11px] font-sans text-[12.5px] text-pen-foreground shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((tz) => (
                    <SelectItem
                      key={tz.value}
                      value={tz.value}
                      className="font-sans text-[12.5px]"
                    >
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <FieldLabel>Location</FieldLabel>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Dhaka, BD"
                className="h-9 rounded-md border-pen-card-border bg-pen-bg px-[11px] font-sans text-[12.5px] text-pen-foreground shadow-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <FieldLabel>GitHub username</FieldLabel>
              <Input
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
                placeholder="e.g. octocat"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-9 rounded-md border-pen-card-border bg-pen-bg px-[11px] font-sans text-[12.5px] text-pen-foreground shadow-none"
              />
              <p className="font-sans text-[11px] text-pen-subtle">
                Links your commits and pull requests on tracked repos to your profile&apos;s contribution graph.
              </p>
            </div>
            <div className="hidden min-w-0 flex-1 lg:block" />
          </div>

          <div className="flex flex-col gap-[5px]">
            <FieldLabel>Working Days</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const active = workingDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() =>
                      setWorkingDays((prev) =>
                        active
                          ? prev.filter((x) => x !== d.value)
                          : [...prev, d.value],
                      )
                    }
                    className={`h-8 min-w-[44px] rounded-md border px-3 font-sans text-[12px] font-medium transition-colors ${
                      active
                        ? "border-pen-blue bg-pen-blue text-white dark:text-gray-900"
                        : "border-pen-card-border bg-pen-bg text-pen-muted hover:border-pen-blue/50 hover:text-pen-foreground"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <FieldLabel>Work Start Time</FieldLabel>
              <Input
                type="time"
                value={workStartTime}
                onChange={(e) => setWorkStartTime(e.target.value)}
                className="h-9 rounded-md border-pen-card-border bg-pen-bg px-[11px] font-sans text-[12.5px] text-pen-foreground shadow-none"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <FieldLabel>Work End Time</FieldLabel>
              <Input
                type="time"
                value={workEndTime}
                onChange={(e) => setWorkEndTime(e.target.value)}
                className="h-9 rounded-md border-pen-card-border bg-pen-bg px-[11px] font-sans text-[12.5px] text-pen-foreground shadow-none"
              />
            </div>
          </div>
        </div>

        {/* <Separator className="bg-pen-card-border" /> */}

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-px">
              <h2 className="font-sans text-sm font-semibold text-pen-foreground">
                Email signature
              </h2>
              <p className="font-sans text-[11.5px] text-pen-subtle">
                Append this signature to assignment, reply, mention and invite emails sent under your name.
              </p>
            </div>
            <Switch
              checked={sigEnabled}
              onCheckedChange={handleSignatureEnabledChange}
              className="h-[22px] w-[38px] shrink-0 data-checked:bg-pen-blue data-unchecked:bg-pen-surface dark:data-unchecked:bg-pen-card-border [&_[data-slot=switch-thumb]]:size-4 [&_[data-slot=switch-thumb]]:data-checked:translate-x-[calc(100%-2px)]"
            />
          </div>

          <div className="flex flex-col gap-2">
            {sigList.length === 0 ? (
              <p className="font-sans text-[11.5px] text-pen-subtle">
                No signatures yet. Add one below.
              </p>
            ) : (
              sigList.map((entry) => {
                const isActive = entry.id === activeSignatureId;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                      isActive
                        ? "border-pen-blue bg-pen-blue-tint"
                        : "border-pen-card-border bg-pen-bg",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveSignatureId(entry.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                          isActive ? "border-pen-blue bg-pen-blue" : "border-pen-card-border",
                        )}
                      >
                        {isActive ? (
                          <Check className="size-2.5 text-white dark:text-gray-900" />
                        ) : null}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                          {entry.label}
                        </span>
                        <span className="truncate font-sans text-[11px] text-pen-muted">
                          {plainPreview(entry.html) || "No preview available"}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEditSigForm(entry)}
                        title="Edit signature"
                        className="shrink-0 rounded-md p-1.5 text-pen-subtle hover:bg-pen-blue-tint hover:text-pen-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSignature(entry.id)}
                        title="Delete signature"
                        className="shrink-0 rounded-md p-1.5 text-pen-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showAddSigForm ? (
            <div className="flex flex-col gap-3 rounded-md border border-pen-card-border bg-pen-bg p-3">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                  <FieldLabel>Signature name</FieldLabel>
                  <Input
                    value={newSigLabel}
                    onChange={(e) => setNewSigLabel(e.target.value)}
                    placeholder="e.g. Support signature"
                    className="h-9 rounded-md border-pen-card-border bg-pen-card px-[11px] font-sans text-[12.5px] text-pen-foreground shadow-none"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-[5px]">
                <div className="flex items-center justify-between">
                  <FieldLabel>Paste your signature</FieldLabel>
                  {newSigHtml ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (sigPasteRef.current) sigPasteRef.current.innerHTML = "";
                        setNewSigHtml("");
                      }}
                      className="font-sans text-[11px] font-semibold text-pen-subtle hover:text-pen-foreground"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <div
                  key={sigFormKey}
                  ref={sigPasteRef}
                  contentEditable
                  suppressContentEditableWarning
                  onPaste={handleSignaturePaste}
                  role="textbox"
                  aria-label="Pasted signature content"
                  className="min-h-[110px] overflow-y-auto rounded-md border border-dashed border-gray-300 bg-white p-3 font-sans text-[12.5px] text-black empty:before:text-gray-400 empty:before:content-['Copy_your_signature_from_your_signature_generator_and_paste_it_here']"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeAddSigForm}
                  className="h-8 rounded-md border-pen-card-border bg-transparent font-sans text-xs font-semibold text-pen-foreground hover:bg-pen-blue-tint"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveSignature}
                  className="h-8 rounded-md bg-pen-blue font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90"
                >
                  {editingSigId ? "Save changes" : "Add signature"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={openAddSigForm}
              className="h-8 w-fit gap-1.5 rounded-md border-pen-card-border bg-transparent px-2.5 font-sans text-xs font-semibold text-pen-foreground hover:bg-pen-blue-tint"
            >
              <Plus className="size-3.5" />
              Add signature
            </Button>
          )}

          <div className="flex flex-col gap-[5px]">
            <div className="flex items-center justify-between">
              <FieldLabel>Preview{activeSignature ? ` (${activeSignature.label})` : ""}</FieldLabel>
              <button
                type="button"
                onClick={() => setShowSigPreview((v) => !v)}
                disabled={!activeSignature}
                className="h-7 rounded-md border border-pen-card-border bg-transparent px-2.5 font-sans text-[11.5px] font-semibold text-pen-foreground hover:bg-pen-blue-tint disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showSigPreview ? "Hide preview" : "Show preview"}
              </button>
            </div>
            {!activeSignature ? (
              <p className="font-sans text-[11.5px] text-pen-subtle">
                Add a signature above and select it to preview and send it.
              </p>
            ) : showSigPreview ? (
              <div className="overflow-hidden rounded-md bg-pen-bg p-3">
                <iframe
                  title="Signature preview"
                  srcDoc={`<body style="margin:0;padding:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${renderSignatureHtml(
                    activeSignature.html,
                  )}</body>`}
                  sandbox="allow-same-origin"
                  onLoad={(e) => {
                    const doc = e.currentTarget.contentDocument;
                    if (!doc) return;
                    const recalc = () =>
                      setSigPreviewHeight(doc.documentElement.scrollHeight);
                    recalc();
                    // Images inside a pasted signature often finish decoding after `load` fires.
                    new ResizeObserver(recalc).observe(doc.documentElement);
                  }}
                  style={{ height: sigPreviewHeight }}
                  className="w-full bg-white"
                />
              </div>
            ) : null}
          </div>
        </div>

        <Separator className="bg-pen-card-border" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="font-sans text-[11.5px] text-pen-muted">
            Sign out works through Microsoft.
          </p>
          <div className="flex flex-1 justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={handleDiscard}
              className="h-8 min-w-[78px] rounded-md border-pen-card-border bg-transparent font-sans text-xs font-semibold text-pen-foreground hover:bg-pen-blue-tint"
            >
              Discard
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="h-8 min-w-[72px] rounded-md bg-pen-blue font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
