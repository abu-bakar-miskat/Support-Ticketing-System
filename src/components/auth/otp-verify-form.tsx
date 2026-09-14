"use client";

import { useState } from "react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

/** 8-digit code entry that verifies the emailed OTP (scanner/cross-device safe). */
export function OtpVerifyForm({
  email,
  next,
  verificationType,
}: {
  email: string;
  next: string;
  verificationType: "signup" | "magiclink";
}) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          email,
          token: code,
          next,
          verificationType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        redirectTo?: string;
        error?: string;
      };
      if (!res.ok || !data.redirectTo) {
        setError(data.error || "That code is invalid or has expired.");
        setPending(false);
        return;
      }
      window.location.replace(data.redirectTo);
    } catch (err) {
      console.error("[OtpVerifyForm] verify failed:", err);
      const timedOut =
        err instanceof DOMException && err.name === "TimeoutError";
      setError(
        timedOut
          ? "Sign-in is taking too long. Request a new code and try again."
          : "Could not verify that code. Try again.",
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col items-center">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="verificationType" value={verificationType} />
      {next !== "/" && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="token" value={code} />

      <InputOTP
        maxLength={8}
        value={code}
        onChange={setCode}
        containerClassName="justify-center"
        aria-label="8-digit sign-in code"
        disabled={pending}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3].map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {[4, 5, 6, 7].map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>

      <div className="h-5" />

      {error && (
        <p role="alert" className="mb-4 w-full text-center text-[13px] text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || code.replace(/\D/g, "").length < 6}
        aria-busy={pending}
        className={cn(
          "flex h-12 w-full items-center justify-center gap-2 rounded-xl",
          "bg-sts-button text-[14px] font-semibold text-sts-button-fg shadow-sm",
          "sts-pressable transition-[background-color,transform,box-shadow] duration-200 hover:bg-sts-button/90 hover:shadow-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sts-card",
          "disabled:cursor-not-allowed disabled:opacity-70",
        )}
      >
        {pending ? (
          <>
            <LoadingSpinner className="size-4" />
            Signing you in…
          </>
        ) : (
          "Verify code"
        )}
      </button>
    </form>
  );
}
