"use client";

import { useState } from "react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { verifyOtpCode } from "@/app/login/actions";
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const formData = new FormData(e.currentTarget);
    try {
      const { redirectTo } = await verifyOtpCode(formData);
      // Full navigation (not a React transition). Wrapping this in
      // startTransition kept "Verifying…" pending until the dashboard RSC
      // finished — which is exactly the stuck spinner after an invite login.
      window.location.replace(redirectTo);
    } catch (err) {
      console.error("[OtpVerifyForm] verify failed:", err);
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
            Verifying…
          </>
        ) : (
          "Verify code"
        )}
      </button>
    </form>
  );
}
