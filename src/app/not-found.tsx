"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenLogo } from "@/components/auth/pen-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function NotFound() {
  const router = useRouter();

  return (
    <main className="pen-ambient-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden font-sans">

      {/* Theme toggle */}
      <ThemeToggle className="absolute right-6 top-6 z-20" />

      {/* Card */}
      <div className="pen-glass-panel pen-modal-enter relative z-10 flex w-full max-w-[420px] flex-col items-center gap-8 rounded-2xl border px-10 py-10 ring-1 ring-white/40 dark:ring-white/10">
        {/* Logo */}
        <div className="flex justify-center">
          <PenLogo />
        </div>

        {/* 404 number */}
        <div className="relative flex flex-col items-center">
          <span
            className="select-none font-sans text-[108px] font-semibold leading-none tracking-tight"
            style={{
              background: "linear-gradient(135deg, #0a76b9 0%, #06476f 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
            aria-hidden
          >
            404
          </span>
          {/* Underline accent */}
          <span className="mt-1 block h-1 w-12 rounded-full bg-[#0a76b9] opacity-60" />
        </div>

        {/* Message */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="pen-text-page-title">
            Page not found
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-pen-muted">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            <br />
            Check the URL or head back to the dashboard.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex w-full flex-col gap-3">
          <Link
            href="/"
            className="flex h-10 w-full items-center justify-center rounded-lg bg-[#0a76b9] font-sans text-[13.5px] font-medium text-white transition-colors hover:bg-[#0967a0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a76b9]/60"
          >
            Back to dashboard
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-10 w-full items-center justify-center rounded-lg border border-pen-card-border bg-pen-bg font-sans text-[13.5px] font-medium text-pen-muted transition-colors hover:border-pen-muted hover:text-pen-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-card-border"
          >
            ← Go back
          </button>
        </div>

        {/* Footer note */}
        <p className="font-sans text-[11.5px] text-pen-subtle">
          If this keeps happening, contact your workspace admin.
        </p>
      </div>
    </main>
  );
}
