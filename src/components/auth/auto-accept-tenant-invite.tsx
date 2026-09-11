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
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <div className="flex flex-col items-center gap-3 rounded-lg border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Couldn&apos;t finish accepting</h1>
          <p className="text-center text-sm text-muted-foreground">{error}</p>
          <a
            href="/"
            className="mt-2 inline-block rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Open dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="flex flex-col items-center gap-3 rounded-lg border p-6 shadow-sm">
        <LoadingSpinner className="size-6 text-blue-600" />
        <h1 className="text-xl font-semibold">Accepting invitation…</h1>
        <p className="text-center text-sm text-muted-foreground">
          Hang tight — we&apos;re attaching your account and opening your dashboard.
        </p>
      </div>
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
