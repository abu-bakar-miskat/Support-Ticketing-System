"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const ACCEPT_TIMEOUT_MS = 20_000;

type AcceptJson = {
  ok?: boolean;
  redirectPath?: string;
  error?: string;
};

/**
 * Accept the invite via fetch after paint, then hard-navigate to the dashboard.
 *
 * Do not `location.assign` the Route Handler: that document navigation keeps
 * this URL on screen until the 303 *and* the destination RSC finish — which
 * looks like a stuck spinner. Fetch waits only on accept, then we navigate.
 */
export function AutoAcceptInvite({ acceptUrl }: { acceptUrl: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, ACCEPT_TIMEOUT_MS);

    (async () => {
      try {
        const res = await fetch(acceptUrl, {
          method: "POST",
          credentials: "include",
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => ({}))) as AcceptJson;
        if (!res.ok) {
          setError(data.error || "Could not accept this invitation.");
          return;
        }
        window.location.replace(data.redirectPath || "/");
      } catch (err) {
        if (ac.signal.aborted && !timedOut) return;
        if (timedOut) {
          setError(
            "Accepting this invitation is taking too long. Open your dashboard to continue.",
          );
          return;
        }
        console.error("[AutoAcceptInvite] accept failed:", err);
        setError("Could not accept this invitation. Open your dashboard to continue.");
      }
    })();

    return () => {
      window.clearTimeout(timeout);
      ac.abort();
    };
  }, [acceptUrl]);

  if (error) {
    return (
      <div className="flex flex-col items-center">
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          Couldn&apos;t finish accepting
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">{error}</p>
        <a
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sts-blue px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90"
        >
          Open dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <LoadingSpinner className="size-6 text-sts-blue" />
      <h1 className="mt-3 text-center text-[18px] font-semibold text-sts-foreground">
        Accepting invitation…
      </h1>
      <p className="mt-2 text-center text-[13.5px] text-sts-muted">
        Hang tight — we&apos;re attaching your account and opening your dashboard.
      </p>
    </div>
  );
}

export function AutoAcceptTenantInvite({ token }: { token: string }) {
  return (
    <AutoAcceptInvite
      acceptUrl={`/api/tenant-invites/${encodeURIComponent(token)}/accept`}
    />
  );
}
