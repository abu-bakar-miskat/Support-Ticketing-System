"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

// Keep in sync with RESEND_WINDOW_MS in lib/auth/send-login-code.ts (the server
// backstop). The UI is the primary gate; the server enforces the same window.
export const COOLDOWN_SECONDS = 90;

/** Seconds still to wait before another code may be requested, given the last
 * send time. Recomputed from the wall clock each tick so a throttled/background
 * tab can't drift the countdown. */
export function computeRemaining(sentAt: number, now: number = Date.now()): number {
  if (!Number.isFinite(sentAt) || sentAt <= 0) return 0;
  return Math.max(0, COOLDOWN_SECONDS - Math.floor((now - sentAt) / 1000));
}

function ResendSubmit({ remaining }: { remaining: number }) {
  const { pending } = useFormStatus();
  const disabled = remaining > 0 || pending;
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        "rounded-sm font-semibold text-sts-accent underline-offset-4 transition-colors hover:underline",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60",
        "disabled:cursor-not-allowed disabled:text-sts-subtle disabled:no-underline disabled:hover:no-underline",
      )}
    >
      {pending
        ? "Sending…"
        : remaining > 0
          ? `Resend code in ${remaining}s`
          : "Resend code"}
    </button>
  );
}

/**
 * Resend-code control with a 90-second cooldown. `sentAt` is the epoch-ms time
 * the current code was issued (passed through the URL by the server action), so
 * the countdown survives a refresh and restarts whenever a new code is actually
 * sent (each resend re-navigates with a fresh `sentAt`). The button stays
 * disabled and shows the remaining seconds until the window elapses.
 */
export function ResendCodeButton({
  email,
  next,
  verificationType,
  sentAt,
  resendAction,
}: {
  email: string;
  next: string;
  verificationType: string;
  sentAt: number;
  resendAction: (formData: FormData) => void | Promise<void>;
}) {
  const [remaining, setRemaining] = useState(() => computeRemaining(sentAt));

  useEffect(() => {
    setRemaining(computeRemaining(sentAt));
    if (computeRemaining(sentAt) <= 0) return;
    const id = setInterval(() => {
      const r = computeRemaining(sentAt);
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [sentAt]);

  return (
    <form action={resendAction} className="flex flex-col items-center">
      {next !== "/" && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="verificationType" value={verificationType} />
      <ResendSubmit remaining={remaining} />
      <span aria-live="polite" className="sr-only">
        {remaining > 0
          ? `You can request another code in ${remaining} seconds.`
          : "You can request another code now."}
      </span>
    </form>
  );
}
