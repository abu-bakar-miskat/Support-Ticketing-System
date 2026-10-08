"use client";

import { useState } from "react";
import { Loader2, Mail, RotateCcw, Save } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HtmlCodeEditor } from "@/components/ui/html-code-editor";

type OtpTemplate = { subject: string; bodyHtml: string };

export function PlatformOtpEmailPage({
  otpTemplate,
  otpDefault,
  platformName,
}: {
  /** Current super-admin OTP override, or null when using the built-in default. */
  otpTemplate: OtpTemplate | null;
  /** The built-in OTP template — used to prefill and to reset. */
  otpDefault: OtpTemplate;
  platformName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [otpSubject, setOtpSubject] = useState((otpTemplate ?? otpDefault).subject);
  const [otpBodyHtml, setOtpBodyHtml] = useState((otpTemplate ?? otpDefault).bodyHtml);
  const [otpBaseline, setOtpBaseline] = useState<OtpTemplate>(otpTemplate ?? otpDefault);
  const [savingOtp, setSavingOtp] = useState(false);
  const [resettingOtp, setResettingOtp] = useState(false);

  const otpDirty = otpSubject !== otpBaseline.subject || otpBodyHtml !== otpBaseline.bodyHtml;
  useUnsavedChangesGuard(otpDirty);

  const otpPreviewHtml = otpBodyHtml
    .replaceAll("{{code}}", "123456")
    .replaceAll("{{platformName}}", platformName.trim() || "Global Support Portal");

  async function saveOtp() {
    setSavingOtp(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpEmailTemplate: { subject: otpSubject, bodyHtml: otpBodyHtml } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to save OTP email");
        return;
      }
      const saved: OtpTemplate = body.otpEmailTemplate ?? otpDefault;
      setOtpSubject(saved.subject);
      setOtpBodyHtml(saved.bodyHtml);
      setOtpBaseline(saved);
      setStatus("OTP sign-in email saved");
    } catch {
      setError("Failed to save OTP email");
    } finally {
      setSavingOtp(false);
    }
  }

  async function resetOtp() {
    setResettingOtp(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpEmailTemplate: null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to reset OTP email");
        return;
      }
      setOtpSubject(otpDefault.subject);
      setOtpBodyHtml(otpDefault.bodyHtml);
      setOtpBaseline(otpDefault);
      setStatus("OTP sign-in email reset to default");
    } catch {
      setError("Failed to reset OTP email");
    } finally {
      setResettingOtp(false);
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={Mail}
          title="OTP sign-in email"
          description="The passwordless sign-in code email, sent to everyone across the platform. Use {{code}} where the numeric code should appear, and {{platformName}} for the company name."
        />

        {(error || status) && (
          <div className="mt-5 space-y-2">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
                {error}
              </div>
            )}
            {status && (
              <div className="rounded-lg border border-sts-green/30 bg-sts-green/10 px-3 py-2 font-sans text-[12.5px] text-sts-green">
                {status}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card">
          <div className="flex flex-col gap-4 px-[22px] py-5">
            <div className="flex flex-col gap-[5px]">
              <label className="font-sans text-[13px] font-medium text-sts-foreground">Subject</label>
              <Input value={otpSubject} onChange={(e) => setOtpSubject(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="flex flex-col gap-[5px]">
                <label className="font-sans text-[13px] font-medium text-sts-foreground">Body HTML</label>
                <HtmlCodeEditor
                  value={otpBodyHtml}
                  onChange={setOtpBodyHtml}
                  minHeight={420}
                  maxHeight={420}
                  className="h-[420px]"
                />
              </div>

              <div className="flex flex-col gap-[5px]">
                <label className="font-sans text-[13px] font-medium text-sts-foreground">Preview</label>
                <div className="h-[420px] overflow-hidden rounded-lg border border-sts-card-border bg-white">
                  <iframe title="OTP email preview" srcDoc={otpPreviewHtml} sandbox="" className="h-full w-full" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={saveOtp} disabled={!otpDirty || savingOtp}>
                {savingOtp ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
              <Button variant="outline" onClick={resetOtp} disabled={resettingOtp}>
                {resettingOtp ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Reset to default
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
